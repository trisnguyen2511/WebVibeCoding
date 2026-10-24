import { randomInt, randomUUID } from 'crypto'
import { applyCommand, createRoom, heartbeat, joinRoom, reconcile } from './engine'
import { getContentStore } from './content-store'
import { getRoomStore, type RoomStore } from './room-store'
import { hashToken, memberForToken, newMemberId, newRoomCode, newToken } from './sessions'
import type { Command, EngineContext, EngineError, RoomState, RoomView } from './types'
import { viewFor } from './view'

const MAX_RETRIES = 8
const HEARTBEAT_WRITE_MS = 8_000

export type ServiceResult<T> = ({ ok: true } & T) | { ok: false; error: EngineError }

const err = (code: string, message: string, status: number): { ok: false; error: EngineError } => ({
  ok: false,
  error: { code, message, status },
})

const defaultCtx = (now: number): EngineContext => ({
  now,
  rng: () => randomInt(0, 2 ** 31) / 2 ** 31,
  genId: () => randomUUID().slice(0, 12),
})

function settingsFromEnv(): Partial<RoomState['settings']> {
  const grace = Number(process.env.MEME_PARTY_HOST_GRACE_SECONDS)
  return Number.isFinite(grace) && grace > 0 ? { hostGraceMs: grace * 1000 } : {}
}

export async function createNewRoom(hostName: string, store: RoomStore = getRoomStore(), now = Date.now()) {
  const hostToken = newToken()
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = newRoomCode()
    if (await store.codeExists(code)) continue
    const state = createRoom({
      id: randomUUID(),
      code,
      hostName,
      hostId: newMemberId(),
      hostTokenHash: hashToken(hostToken),
      now,
      settings: settingsFromEnv(),
    })
    if (await store.create(state)) return { ok: true as const, roomId: state.id, code, hostToken, memberId: Object.keys(state.members)[0] }
  }
  return err('code_unavailable', 'Không tạo được mã phòng', 500)
}

/** Runs `mutate` against the latest state, retrying on CAS conflicts. */
async function mutate(
  store: RoomStore,
  code: string,
  mutator: (state: RoomState) => { next: RoomState } | { error: EngineError },
): Promise<ServiceResult<{ state: RoomState }>> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const stored = await store.getByCode(code)
    if (!stored) return err('room_not_found', 'Không tìm thấy phòng', 404)
    const out = mutator(stored.state)
    if ('error' in out) return { ok: false, error: out.error }
    if (out.next === stored.state) return { ok: true, state: stored.state }
    if (await store.compareAndSet(stored.state.id, stored.rev, out.next)) return { ok: true, state: out.next }
  }
  return err('conflict', 'Phòng đang bận, thử lại', 409)
}

export async function joinExistingRoom(code: string, name: string, store: RoomStore = getRoomStore(), now = Date.now()) {
  const token = newToken()
  const memberId = newMemberId()
  const res = await mutate(store, code, (state) => {
    const joined = joinRoom(state, { memberId, name, tokenHash: hashToken(token) }, { now })
    return joined.ok ? { next: joined.state } : { error: joined.error }
  })
  if (!res.ok) return res
  const member = res.state.members[memberId]
  return { ok: true as const, memberId, token, role: member.role, roomId: res.state.id }
}

export async function getView(
  code: string,
  token: string | null,
  store: RoomStore = getRoomStore(),
  now = Date.now(),
): Promise<ServiceResult<{ view: RoomView }>> {
  const res = await mutate(store, code, (state) => {
    let next = state
    const member = memberForToken(state, token)
    if (member && now - member.lastSeen >= HEARTBEAT_WRITE_MS) next = heartbeat(next, member.id, now)
    const reconciled = reconcile(next, now)
    return { next: reconciled.state }
  })
  if (!res.ok) return res
  const member = memberForToken(res.state, token)
  if (token && !member) return err('forbidden', 'Phiên không hợp lệ hoặc đã bị loại khỏi phòng', 403)
  return { ok: true, view: viewFor(res.state, member?.id ?? null, now) }
}

export async function runCommand(
  code: string,
  token: string | null,
  cmdId: string,
  cmd: Command,
  store: RoomStore = getRoomStore(),
  now = Date.now(),
  ctxOverride?: Partial<EngineContext>,
): Promise<ServiceResult<{ stateVersion: number; duplicate: boolean }>> {
  if (!cmdId || cmdId.length > 64) return err('invalid_command', 'cmdId không hợp lệ', 400)
  // Only commands that deal a round need the content library.
  const content = cmd.type === 'START_MATCH' || cmd.type === 'NEXT_ROUND' ? await getContentStore().getPool() : undefined
  const ctx: EngineContext = { ...defaultCtx(now), content, ...ctxOverride }

  let duplicate = false
  const res = await mutate(store, code, (state) => {
    const member = memberForToken(state, token)
    if (!member) return { error: { code: 'forbidden', message: 'Phiên không hợp lệ', status: 403 } }
    const reconciled = reconcile(heartbeat(state, member.id, now), now).state
    const result = applyCommand(reconciled, member.id, cmdId, cmd, ctx)
    if (!result.ok) return { error: result.error }
    duplicate = !!result.duplicate
    return { next: result.state }
  })
  if (!res.ok) return res
  return { ok: true, stateVersion: res.state.stateVersion, duplicate }
}
