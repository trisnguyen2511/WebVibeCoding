import { computeRoundResult } from './scoring'
import {
  GAME_MODES,
  HOST_COMMAND_TYPES,
  type ChaosStyle,
  type Command,
  type ContentPool,
  type EngineContext,
  type EngineError,
  type EngineResult,
  type GameMode,
  type Member,
  type Option,
  type Phase,
  type RoomSettings,
  type RoomState,
  type RoundPlan,
  type RoundState,
  type SpecialEffect,
  type Submission,
} from './types'

export const HAND_SIZE = 6
export const MIN_VALID_SUBMISSIONS = 3
export const MAX_SPECTATORS = 40
export const NAME_MAX = 20
const PROCESSED_CAP = 300
const EVENT_CAP = 120
const CHAOS_STYLES: ChaosStyle[] = ['tilt', 'mirror', 'rainbow', 'shake', 'zoom']

export const DEFAULT_SETTINGS: RoomSettings = {
  minPlayers: 5,
  maxPlayers: 12,
  rounds: 10,
  hostGraceMs: 60_000,
  presenceMs: 20_000,
}

const PLAY_PHASES: Phase[] = ['ROUND_BRIEFING', 'SUBMISSION_OPEN', 'REVIEW', 'MEME_SHOWCASE', 'VOTING_OPEN', 'RESULTS', 'ROUND_END']
const TERMINAL: Phase[] = ['GAME_FINISHED', 'CANCELLED']

const fail = (code: string, message: string, status = 409): { ok: false; error: EngineError } => ({
  ok: false,
  error: { code, message, status },
})

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Players allowed to submit and vote in the running match (the Host is never one). */
export function eligiblePlayers(state: RoomState): Member[] {
  return Object.values(state.members)
    .filter((m) => m.role === 'player' && m.eligible && !m.kicked)
    .sort((a, b) => a.joinOrder - b.joinOrder)
}

export function getHost(state: RoomState): Member | undefined {
  return Object.values(state.members).find((m) => m.role === 'host')
}

export function isOnline(state: RoomState, member: Member, now: number): boolean {
  return now - member.lastSeen <= state.settings.presenceMs
}

function log(state: RoomState, now: number, type: string, data?: Record<string, string | number | boolean | null>) {
  const seq = (state.events[state.events.length - 1]?.seq ?? 0) + 1
  state.events.push({ seq, at: now, type, data })
  if (state.events.length > EVENT_CAP) state.events.splice(0, state.events.length - EVENT_CAP)
}

function cleanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

// ── Room lifecycle ──────────────────────────────────────────────────────────

export function createRoom(args: {
  id: string
  code: string
  hostName: string
  hostId: string
  hostTokenHash: string
  now: number
  settings?: Partial<RoomSettings>
}): RoomState {
  const host: Member = {
    id: args.hostId,
    name: cleanName(args.hostName) || 'Host',
    role: 'host',
    eligible: false,
    joinOrder: 0,
    kicked: false,
    tokenHash: args.hostTokenHash,
    lastSeen: args.now,
  }
  const state: RoomState = {
    id: args.id,
    code: args.code,
    createdAt: args.now,
    stateVersion: 1,
    phase: 'LOBBY',
    suspendedFrom: null,
    hostLostAt: null,
    settings: { ...DEFAULT_SETTINGS, ...args.settings },
    members: { [host.id]: host },
    nextJoinOrder: 1,
    matchStarted: false,
    plan: [],
    roundIndex: -1,
    rounds: [],
    scores: {},
    usedPromptIds: [],
    processed: {},
    processedOrder: [],
    events: [],
  }
  log(state, args.now, 'ROOM_CREATED')
  return state
}

export function joinRoom(
  prev: RoomState,
  args: { memberId: string; name: string; tokenHash: string },
  ctx: Pick<EngineContext, 'now'>,
): EngineResult {
  const state = clone(prev)
  if (TERMINAL.includes(state.phase)) return fail('room_closed', 'Phòng đã đóng')
  const name = cleanName(args.name)
  if (!name) return fail('invalid_name', 'Tên không hợp lệ', 400)
  const active = Object.values(state.members).filter((m) => !m.kicked)
  if (active.some((m) => m.name.toLowerCase() === name.toLowerCase())) return fail('name_taken', 'Tên này đã có người dùng')

  let role: Member['role'] = 'spectator'
  let eligible = false
  if (!state.matchStarted) {
    const players = active.filter((m) => m.role === 'player').length
    if (players >= state.settings.maxPlayers) return fail('room_full', `Phòng đã đủ ${state.settings.maxPlayers} người chơi`)
    role = 'player'
    eligible = true
  } else if (active.filter((m) => m.role === 'spectator').length >= MAX_SPECTATORS) {
    return fail('room_full', 'Phòng đã đầy')
  }
  state.members[args.memberId] = {
    id: args.memberId,
    name,
    role,
    eligible,
    joinOrder: state.nextJoinOrder++,
    kicked: false,
    tokenHash: args.tokenHash,
    lastSeen: ctx.now,
  }
  state.stateVersion++
  log(state, ctx.now, 'PLAYER_JOINED', { memberId: args.memberId, role })
  return { ok: true, state }
}

/** Presence ping — intentionally does not bump stateVersion. */
export function heartbeat(prev: RoomState, memberId: string, now: number): RoomState {
  const member = prev.members[memberId]
  if (!member) return prev
  const state = clone(prev)
  state.members[memberId].lastSeen = now
  return state
}

// ── Host disconnection / transfer ───────────────────────────────────────────

/** Lazily evaluates Host presence; call before reads and commands. */
export function reconcile(prev: RoomState, now: number): { state: RoomState; changed: boolean } {
  if (!prev.matchStarted || TERMINAL.includes(prev.phase)) return { state: prev, changed: false }
  const host = getHost(prev)
  if (!host) return { state: prev, changed: false }
  const online = isOnline(prev, host, now)

  if (online) {
    if (prev.hostLostAt === null && prev.phase !== 'HOST_RECONNECTING' && prev.phase !== 'HOST_TRANSFER') {
      return { state: prev, changed: false }
    }
    const state = clone(prev)
    state.hostLostAt = null
    if (state.phase === 'HOST_RECONNECTING' || state.phase === 'HOST_TRANSFER') {
      state.phase = state.suspendedFrom ?? 'ROUND_BRIEFING'
      state.suspendedFrom = null
    }
    state.stateVersion++
    log(state, now, 'HOST_RECONNECTED')
    return { state, changed: true }
  }

  const state = clone(prev)
  if (state.hostLostAt === null) {
    state.hostLostAt = now
    if (state.phase !== 'PAUSED') {
      state.suspendedFrom = state.phase
      state.phase = 'HOST_RECONNECTING'
    }
    state.stateVersion++
    log(state, now, 'HOST_DISCONNECTED')
    return { state, changed: true }
  }
  if (now - state.hostLostAt < state.settings.hostGraceMs) return { state: prev, changed: false }

  const candidate = eligiblePlayers(state).find((m) => isOnline(state, m, now))
  if (!candidate) {
    if (state.phase === 'HOST_RECONNECTING') {
      state.phase = 'HOST_TRANSFER'
      state.stateVersion++
      log(state, now, 'HOST_TRANSFER_WAITING')
      return { state, changed: true }
    }
    return { state: prev, changed: false }
  }
  const oldHost = state.members[host.id]
  oldHost.role = 'spectator'
  oldHost.eligible = false
  state.members[candidate.id].role = 'host'
  state.hostLostAt = null
  if (state.phase === 'HOST_RECONNECTING' || state.phase === 'HOST_TRANSFER') {
    state.phase = state.suspendedFrom ?? 'ROUND_BRIEFING'
    state.suspendedFrom = null
  }
  state.stateVersion++
  log(state, now, 'HOST_CHANGED', { from: host.id, to: candidate.id })
  return { state, changed: true }
}

// ── Match setup ─────────────────────────────────────────────────────────────

/** Creates the persisted round plan: every mode at least once, shuffled; two special rounds. */
export function buildPlan(rounds: number, rng: () => number): RoundPlan[] {
  const modes: GameMode[] = [...GAME_MODES]
  while (modes.length < rounds) modes.push(GAME_MODES[Math.floor(rng() * GAME_MODES.length)])
  const shuffled = shuffle(modes.slice(0, Math.max(rounds, GAME_MODES.length)), rng)
  const plan: RoundPlan[] = shuffled.map((mode) => ({ mode, special: null }))
  const positions = shuffle(
    plan.map((_, i) => i),
    rng,
  ).slice(0, Math.min(2, plan.length))
  const second: SpecialEffect = rng() < 0.5 ? 'chaos' : 'award'
  const effects: SpecialEffect[] = shuffle<SpecialEffect>(['double', second], rng)
  positions.forEach((pos, i) => {
    plan[pos].special = effects[i]
  })
  return plan
}

function optionsFor(content: ContentPool, mode: GameMode): Option[] {
  if (mode === 'caption') return content.captions.map((c) => ({ id: `c:${c.id}`, kind: 'caption', text: c.text }))
  return content.assets
    .filter((a) => a.modes.includes(mode))
    .map((a) => ({ id: `a:${a.id}`, kind: 'asset', title: a.title, imageUrl: a.imageUrl }))
}

export function checkContent(content: ContentPool | undefined): string | null {
  if (!content) return 'Thiếu dữ liệu nội dung'
  for (const mode of GAME_MODES) {
    if (!content.prompts.some((p) => p.mode === mode)) return `Chưa có đề bài cho ${mode}`
    if (optionsFor(content, mode).length < 3) return `Chưa đủ lựa chọn (tối thiểu 3) cho ${mode}`
  }
  return null
}

function dealRound(state: RoomState, index: number, ctx: EngineContext): RoundState | EngineError {
  const plan = state.plan[index]
  const content = ctx.content
  const problem = checkContent(content)
  if (problem || !content) return { code: 'not_enough_content', message: problem ?? 'Thiếu nội dung', status: 422 }

  const candidates = content.prompts.filter((p) => p.mode === plan.mode)
  const fresh = candidates.filter((p) => !state.usedPromptIds.includes(p.id))
  const prompt = shuffle(fresh.length > 0 ? fresh : candidates, ctx.rng)[0]
  const pool = optionsFor(content, plan.mode)
  const hands: Record<string, Option[]> = {}
  for (const player of eligiblePlayers(state)) hands[player.id] = shuffle(pool, ctx.rng).slice(0, HAND_SIZE)

  state.usedPromptIds.push(prompt.id)
  return {
    index,
    mode: plan.mode,
    special: plan.special,
    chaosStyle: plan.special === 'chaos' ? CHAOS_STYLES[Math.floor(ctx.rng() * CHAOS_STYLES.length)] : null,
    prompt: { id: prompt.id, text: prompt.text, title: prompt.title, imageUrl: prompt.imageUrl },
    hands,
    submissions: [],
    reopenCount: 0,
    showcaseIndex: 0,
    votes: {},
    votingClosed: false,
    result: null,
    resultPublished: false,
    award: null,
    skipped: false,
  }
}

// ── Command handling ────────────────────────────────────────────────────────

const currentRound = (state: RoomState): RoundState | undefined => state.rounds[state.roundIndex]

function validSubmissions(round: RoundState): Submission[] {
  return round.submissions.filter((s) => s.status === 'approved')
}

/** Review gate shared by "open showcase" and "skip showcase". */
function reviewGate(round: RoundState): EngineError | null {
  if (round.submissions.some((s) => s.status === 'pending')) {
    return { code: 'review_incomplete', message: 'Còn bài chưa duyệt', status: 409 }
  }
  const authors = new Set(validSubmissions(round).map((s) => s.playerId))
  if (authors.size < MIN_VALID_SUBMISSIONS) {
    return { code: 'not_enough_submissions', message: `Cần tối thiểu ${MIN_VALID_SUBMISSIONS} bài hợp lệ từ ${MIN_VALID_SUBMISSIONS} người khác nhau`, status: 409 }
  }
  return null
}

function enterVoting(state: RoomState, round: RoundState, now: number) {
  state.phase = 'VOTING_OPEN'
  round.showcaseIndex = 0
  log(state, now, 'VOTING_STARTED', { round: round.index })
}

function endRound(state: RoomState, now: number) {
  state.phase = 'ROUND_END'
  log(state, now, 'ROUND_END', { round: state.roundIndex })
}

/**
 * Applies one command. Returns a new state (never mutates the input).
 * `cmdId` makes the command idempotent: replaying it is a no-op.
 */
export function applyCommand(prev: RoomState, actorId: string, cmdId: string, cmd: Command, ctx: EngineContext): EngineResult {
  if (prev.processed[cmdId]) return { ok: true, state: prev, duplicate: true }

  const actor = prev.members[actorId]
  if (!actor || actor.kicked) return fail('forbidden', 'Phiên không hợp lệ', 403)

  const isHostCmd = HOST_COMMAND_TYPES.has(cmd.type)
  if (isHostCmd && actor.role !== 'host') return fail('forbidden', 'Chỉ Host mới được thực hiện', 403)
  if (!isHostCmd && actor.role === 'host') return fail('forbidden', 'Host không tham gia chơi', 403)

  const state = clone(prev)
  const outcome = isHostCmd ? applyHost(state, cmd, ctx) : applyPlayer(state, actor, cmd, ctx)
  if (outcome) return { ok: false, error: outcome }

  state.stateVersion++
  state.processed[cmdId] = state.stateVersion
  state.processedOrder.push(cmdId)
  while (state.processedOrder.length > PROCESSED_CAP) {
    const old = state.processedOrder.shift()
    if (old) delete state.processed[old]
  }
  return { ok: true, state }
}

function invalidPhase(state: RoomState, cmdType: string): EngineError {
  return { code: 'invalid_phase', message: `Không thể ${cmdType} ở trạng thái ${state.phase}`, status: 409 }
}

function applyHost(state: RoomState, cmd: Command, ctx: EngineContext): EngineError | null {
  const { now } = ctx
  if (state.phase === 'HOST_RECONNECTING' || state.phase === 'HOST_TRANSFER') {
    return { code: 'host_locked', message: 'Host đang mất kết nối — điều khiển tạm khóa', status: 423 }
  }
  if (state.phase === 'PAUSED' && cmd.type !== 'RESUME' && cmd.type !== 'KICK' && cmd.type !== 'CANCEL_MATCH') {
    return { code: 'paused', message: 'Ván đang tạm dừng', status: 423 }
  }
  if (TERMINAL.includes(state.phase)) return { code: 'room_closed', message: 'Ván đã kết thúc', status: 409 }
  const round = currentRound(state)

  switch (cmd.type) {
    case 'START_MATCH': {
      if (state.phase !== 'LOBBY') return invalidPhase(state, cmd.type)
      const players = eligiblePlayers(state)
      if (players.length < state.settings.minPlayers) {
        return { code: 'not_enough_players', message: `Cần tối thiểu ${state.settings.minPlayers} người chơi`, status: 409 }
      }
      state.plan = buildPlan(state.settings.rounds, ctx.rng)
      state.matchStarted = true
      state.scores = Object.fromEntries(players.map((p) => [p.id, { points: 0, uniqueWins: 0 }]))
      state.roundIndex = 0
      const dealt = dealRound(state, 0, ctx)
      if ('code' in dealt) {
        state.matchStarted = false
        return dealt
      }
      state.rounds = [dealt]
      state.phase = 'ROUND_BRIEFING'
      log(state, now, 'MATCH_STARTED', { players: players.length })
      return null
    }
    case 'OPEN_SUBMISSION': {
      if (state.phase !== 'ROUND_BRIEFING') return invalidPhase(state, cmd.type)
      state.phase = 'SUBMISSION_OPEN'
      log(state, now, 'SUBMISSION_OPENED', { round: state.roundIndex })
      return null
    }
    case 'CLOSE_SUBMISSION': {
      if (state.phase !== 'SUBMISSION_OPEN' || !round) return invalidPhase(state, cmd.type)
      const order = shuffle(
        round.submissions.map((_, i) => i),
        ctx.rng,
      )
      round.submissions.forEach((s, i) => {
        s.order = order[i]
      })
      state.phase = 'REVIEW'
      log(state, now, 'SUBMISSION_CLOSED', { round: state.roundIndex, count: round.submissions.length })
      return null
    }
    case 'REVIEW_SUBMISSION': {
      if (state.phase !== 'REVIEW' || !round) return invalidPhase(state, cmd.type)
      const sub = round.submissions.find((s) => s.id === cmd.submissionId)
      if (!sub) return { code: 'not_found', message: 'Không tìm thấy bài nộp', status: 404 }
      sub.status = cmd.decision === 'approve' ? 'approved' : 'rejected'
      log(state, now, cmd.decision === 'approve' ? 'SUBMISSION_APPROVED' : 'SUBMISSION_REJECTED', { submissionId: sub.id })
      return null
    }
    case 'APPROVE_ALL_PENDING': {
      if (state.phase !== 'REVIEW' || !round) return invalidPhase(state, cmd.type)
      for (const s of round.submissions) if (s.status === 'pending') s.status = 'approved'
      log(state, now, 'SUBMISSIONS_APPROVED_ALL', { round: state.roundIndex })
      return null
    }
    case 'REOPEN_SUBMISSION': {
      if (state.phase !== 'REVIEW' || !round) return invalidPhase(state, cmd.type)
      if (new Set(validSubmissions(round).map((s) => s.playerId)).size >= MIN_VALID_SUBMISSIONS) {
        return { code: 'reopen_not_needed', message: 'Đã đủ bài hợp lệ, không cần mở lại', status: 409 }
      }
      round.reopenCount++
      state.phase = 'SUBMISSION_OPEN'
      log(state, now, 'SUBMISSION_REOPENED', { round: state.roundIndex })
      return null
    }
    case 'SKIP_ROUND': {
      if (state.phase !== 'REVIEW' || !round) return invalidPhase(state, cmd.type)
      if (new Set(validSubmissions(round).map((s) => s.playerId)).size >= MIN_VALID_SUBMISSIONS) {
        return { code: 'skip_not_allowed', message: 'Đã đủ bài hợp lệ, không thể bỏ qua vòng', status: 409 }
      }
      if (round.reopenCount < 1) {
        return { code: 'reopen_required', message: 'Hãy mở lại nộp bài ít nhất một lần trước khi bỏ qua vòng', status: 409 }
      }
      round.skipped = true
      round.votingClosed = true
      log(state, now, 'ROUND_SKIPPED', { round: state.roundIndex, special: round.special })
      endRound(state, now)
      return null
    }
    case 'OPEN_SHOWCASE': {
      if (state.phase !== 'REVIEW' || !round) return invalidPhase(state, cmd.type)
      const gate = reviewGate(round)
      if (gate) return gate
      round.showcaseIndex = 0
      state.phase = 'MEME_SHOWCASE'
      log(state, now, 'SHOWCASE_OPENED', { round: state.roundIndex })
      return null
    }
    case 'SKIP_SHOWCASE': {
      if (state.phase !== 'REVIEW' || !round) return invalidPhase(state, cmd.type)
      const gate = reviewGate(round)
      if (gate) return gate
      enterVoting(state, round, now)
      return null
    }
    case 'SHOWCASE_GOTO': {
      if (state.phase !== 'MEME_SHOWCASE' || !round) return invalidPhase(state, cmd.type)
      const max = validSubmissions(round).length - 1
      if (!Number.isInteger(cmd.index) || cmd.index < 0 || cmd.index > max) {
        return { code: 'out_of_range', message: 'Slide không tồn tại', status: 400 }
      }
      round.showcaseIndex = cmd.index
      log(state, now, 'SHOWCASE_SLIDE_CHANGED', { index: cmd.index })
      return null
    }
    case 'END_SHOWCASE': {
      if (state.phase !== 'MEME_SHOWCASE' || !round) return invalidPhase(state, cmd.type)
      log(state, now, 'SHOWCASE_ENDED', { round: state.roundIndex })
      enterVoting(state, round, now)
      return null
    }
    case 'CLOSE_VOTING': {
      if (state.phase !== 'VOTING_OPEN' || !round) return invalidPhase(state, cmd.type)
      if (round.result) return { code: 'already_locked', message: 'Kết quả đã khóa', status: 409 }
      round.votingClosed = true
      const result = computeRoundResult(round, now)
      round.result = result
      for (const [playerId, pts] of Object.entries(result.pointsAwarded)) {
        const entry = state.scores[playerId] ?? { points: 0, uniqueWins: 0 }
        entry.points += pts
        if (result.unique) entry.uniqueWins += 1
        state.scores[playerId] = entry
      }
      state.phase = 'RESULTS'
      log(state, now, 'VOTING_CLOSED', { round: state.roundIndex, noWinner: result.noWinner })
      return null
    }
    case 'PUBLISH_RESULTS': {
      if (state.phase !== 'RESULTS' || !round?.result) return invalidPhase(state, cmd.type)
      if (round.resultPublished) return { code: 'already_published', message: 'Kết quả đã công bố', status: 409 }
      round.resultPublished = true
      log(state, now, 'ROUND_RESULT_PUBLISHED', { round: state.roundIndex })
      return null
    }
    case 'SET_AWARD': {
      if (state.phase !== 'RESULTS' || !round?.resultPublished) return invalidPhase(state, cmd.type)
      if (round.special !== 'award') return { code: 'award_not_available', message: 'Vòng này không có giải đặc biệt', status: 409 }
      const title = cmd.title.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60)
      if (!title) return { code: 'invalid_title', message: 'Tiêu đề giải không hợp lệ', status: 400 }
      if (!round.submissions.some((s) => s.id === cmd.submissionId && s.status === 'approved')) {
        return { code: 'not_found', message: 'Không tìm thấy bài nộp', status: 404 }
      }
      round.award = { title, submissionId: cmd.submissionId }
      log(state, now, 'AWARD_SET', { round: state.roundIndex })
      return null
    }
    case 'FINISH_ROUND': {
      if (state.phase !== 'RESULTS' || !round?.resultPublished) return invalidPhase(state, cmd.type)
      endRound(state, now)
      return null
    }
    case 'NEXT_ROUND': {
      if (state.phase !== 'ROUND_END') return invalidPhase(state, cmd.type)
      const next = state.roundIndex + 1
      if (next >= state.plan.length) {
        state.phase = 'GAME_FINISHED'
        log(state, now, 'GAME_FINISHED')
        return null
      }
      const dealt = dealRound(state, next, ctx)
      if ('code' in dealt) return dealt
      state.roundIndex = next
      state.rounds.push(dealt)
      state.phase = 'ROUND_BRIEFING'
      log(state, now, 'ROUND_STARTED', { round: next })
      return null
    }
    case 'PAUSE': {
      if (!PLAY_PHASES.includes(state.phase)) return invalidPhase(state, cmd.type)
      state.suspendedFrom = state.phase
      state.phase = 'PAUSED'
      log(state, now, 'GAME_PAUSED')
      return null
    }
    case 'RESUME': {
      if (state.phase !== 'PAUSED') return invalidPhase(state, cmd.type)
      state.phase = state.suspendedFrom ?? 'ROUND_BRIEFING'
      state.suspendedFrom = null
      log(state, now, 'GAME_RESUMED')
      return null
    }
    case 'KICK': {
      const target = state.members[cmd.playerId]
      if (!target || target.kicked) return { code: 'not_found', message: 'Không tìm thấy người chơi', status: 404 }
      if (target.role === 'host') return { code: 'invalid_target', message: 'Không thể kick Host', status: 400 }
      if (!state.matchStarted) {
        delete state.members[cmd.playerId]
      } else {
        target.kicked = true
        target.role = 'spectator'
        target.eligible = false
        // Before voting opens a kicked player's pending work is withdrawn; once
        // voting is open submissions and confirmed votes stay valid.
        const effective = state.phase === 'PAUSED' ? state.suspendedFrom : state.phase
        if (round && (effective === 'SUBMISSION_OPEN' || effective === 'REVIEW')) {
          round.submissions = round.submissions.filter((s) => s.playerId !== cmd.playerId)
        }
      }
      log(state, now, 'PLAYER_KICKED', { playerId: cmd.playerId })
      return null
    }
    case 'CANCEL_MATCH': {
      state.suspendedFrom = null
      state.phase = 'CANCELLED'
      log(state, now, 'MATCH_CANCELLED')
      return null
    }
    default:
      return { code: 'unknown_command', message: 'Lệnh không hợp lệ', status: 400 }
  }
}

function applyPlayer(state: RoomState, actor: Member, cmd: Command, ctx: EngineContext): EngineError | null {
  if (state.phase === 'PAUSED') return { code: 'paused', message: 'Ván đang tạm dừng', status: 423 }
  const phase = state.phase === 'HOST_RECONNECTING' || state.phase === 'HOST_TRANSFER' ? state.suspendedFrom : state.phase
  const round = currentRound(state)
  const eligible = actor.role === 'player' && actor.eligible && !actor.kicked

  if (cmd.type === 'SUBMIT') {
    if (!eligible) return { code: 'not_eligible', message: 'Bạn đang là khán giả, không thể nộp bài', status: 403 }
    if (phase !== 'SUBMISSION_OPEN' || !round) return { code: 'invalid_phase', message: 'Đã đóng nhận bài', status: 409 }
    const option = (round.hands[actor.id] ?? []).find((o) => o.id === cmd.optionId)
    if (!option) return { code: 'invalid_option', message: 'Lựa chọn không nằm trong bài của bạn', status: 400 }
    const existing = round.submissions.find((s) => s.playerId === actor.id)
    if (existing) {
      if (existing.status === 'approved') return { code: 'already_approved', message: 'Bài của bạn đã được duyệt', status: 409 }
      existing.option = option
      existing.status = 'pending'
    } else {
      round.submissions.push({ id: ctx.genId(), playerId: actor.id, option, status: 'pending', order: round.submissions.length })
    }
    log(state, ctx.now, 'SUBMISSION_RECEIVED', { round: round.index })
    return null
  }

  if (cmd.type === 'VOTE') {
    if (!eligible) return { code: 'not_eligible', message: 'Bạn không có quyền bình chọn', status: 403 }
    if (phase !== 'VOTING_OPEN' || !round || round.votingClosed) return { code: 'invalid_phase', message: 'Đã đóng bình chọn', status: 409 }
    const target = round.submissions.find((s) => s.id === cmd.submissionId)
    if (!target || target.status !== 'approved') return { code: 'invalid_target', message: 'Bài không hợp lệ', status: 400 }
    if (target.playerId === actor.id) return { code: 'self_vote', message: 'Không thể tự bình chọn cho bài của mình', status: 403 }
    if (round.votes[actor.id]) return { code: 'already_voted', message: 'Bạn đã bình chọn rồi', status: 409 }
    round.votes[actor.id] = target.id
    log(state, ctx.now, 'VOTE_ACCEPTED', { round: round.index })
    return null
  }
  return { code: 'unknown_command', message: 'Lệnh không hợp lệ', status: 400 }
}
