import {
  applyCommand,
  createRoom,
  joinRoom,
} from '@/lib/meme-party/engine'
import type { Command, ContentPool, EngineContext, RoomState } from '@/lib/meme-party/types'

export function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makePool(): ContentPool {
  const prompts = (['caption', 'meme', 'reaction'] as const).flatMap((mode) =>
    [1, 2, 3, 4].map((n) => ({ id: `${mode}-p${n}`, mode, text: `${mode} prompt ${n}` })),
  )
  return {
    prompts,
    captions: Array.from({ length: 10 }, (_, i) => ({ id: `cap${i}`, text: `caption ${i}` })),
    assets: Array.from({ length: 12 }, (_, i) => ({
      id: `as${i}`,
      title: `asset ${i}`,
      imageUrl: `/x/${i}.svg`,
      modes: ['meme', 'reaction'] as ('meme' | 'reaction')[],
    })),
  }
}

let idCounter = 0
export function makeCtx(over: Partial<EngineContext> = {}): EngineContext {
  return { now: 1_000_000, rng: seededRng(7), genId: () => `id${++idCounter}`, content: makePool(), ...over }
}

let cmdCounter = 0
export const nextCmdId = () => `cmd${++cmdCounter}`

/** Runs a command and throws if rejected — for happy-path setup. */
export function run(state: RoomState, actor: string, cmd: Command, ctx: EngineContext = makeCtx()): RoomState {
  const res = applyCommand(state, actor, nextCmdId(), cmd, ctx)
  if (!res.ok) throw new Error(`${cmd.type} rejected: ${res.error.code} ${res.error.message}`)
  return res.state
}

export function lobby(playerCount = 5, now = 1_000_000): RoomState {
  let state = createRoom({ id: 'room1', code: '123456', hostName: 'Host', hostId: 'host', hostTokenHash: 'h', now })
  for (let i = 1; i <= playerCount; i++) {
    const res = joinRoom(state, { memberId: `p${i}`, name: `Player${i}`, tokenHash: `t${i}` }, { now })
    if (!res.ok) throw new Error(res.error.code)
    state = res.state
  }
  return state
}

export const playerIds = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

/** Started match, round 0 in ROUND_BRIEFING. */
export function started(playerCount = 5, ctx: EngineContext = makeCtx()): RoomState {
  return run(lobby(playerCount), 'host', { type: 'START_MATCH' }, ctx)
}

/** Drives the current round to SUBMISSION_OPEN with every given player submitting their first card. */
export function submitAll(state: RoomState, players: string[], ctx: EngineContext = makeCtx()): RoomState {
  let s = state
  if (s.phase === 'ROUND_BRIEFING') s = run(s, 'host', { type: 'OPEN_SUBMISSION' }, ctx)
  for (const p of players) {
    const hand = s.rounds[s.roundIndex].hands[p]
    s = run(s, p, { type: 'SUBMIT', optionId: hand[0].id }, ctx)
  }
  return s
}

/** Close submission, approve everything and enter voting (no showcase). */
export function toVoting(state: RoomState, ctx: EngineContext = makeCtx()): RoomState {
  let s = run(state, 'host', { type: 'CLOSE_SUBMISSION' }, ctx)
  s = run(s, 'host', { type: 'APPROVE_ALL_PENDING' }, ctx)
  return run(s, 'host', { type: 'SKIP_SHOWCASE' }, ctx)
}

export function submissionOf(state: RoomState, playerId: string): string {
  const sub = state.rounds[state.roundIndex].submissions.find((s) => s.playerId === playerId)
  if (!sub) throw new Error('no submission for ' + playerId)
  return sub.id
}
