// Meme Party — shared types for the server-authoritative game engine, the
// public/private views sent to clients, and the content library.

export type GameMode = 'caption' | 'meme' | 'reaction'
export const GAME_MODES: GameMode[] = ['caption', 'meme', 'reaction']

export const MODE_LABEL: Record<GameMode, string> = {
  caption: 'Caption Battle',
  meme: 'Meme Battle',
  reaction: 'Reaction Battle',
}

export const MODE_HINT: Record<GameMode, string> = {
  caption: 'Chọn caption hài nhất cho tình huống',
  meme: 'Chọn meme trả lời tình huống hay nhất',
  reaction: 'Chọn meme biểu cảm phản ứng đỉnh nhất',
}

export type Phase =
  | 'LOBBY'
  | 'ROUND_BRIEFING'
  | 'SUBMISSION_OPEN'
  | 'REVIEW'
  | 'MEME_SHOWCASE'
  | 'VOTING_OPEN'
  | 'RESULTS'
  | 'ROUND_END'
  | 'GAME_FINISHED'
  | 'PAUSED'
  | 'HOST_RECONNECTING'
  | 'HOST_TRANSFER'
  | 'CANCELLED'

export type SpecialEffect = 'double' | 'chaos' | 'award'
export type ChaosStyle = 'tilt' | 'mirror' | 'rainbow' | 'shake' | 'zoom'
export type MemberRole = 'host' | 'player' | 'spectator'

export interface Member {
  id: string
  name: string
  role: MemberRole
  /** True when the member joined before the match started (may submit/vote). */
  eligible: boolean
  joinOrder: number
  kicked: boolean
  /** sha256 of the member's secret session token — never sent to clients. */
  tokenHash: string
  lastSeen: number
}

// ── Content snapshots ───────────────────────────────────────────────────────

/** A card a player can pick: either a caption (text) or a meme image. */
export interface Option {
  id: string
  kind: 'caption' | 'asset'
  text?: string
  title?: string
  imageUrl?: string
}

export interface PromptSnapshot {
  id: string
  text: string
  title?: string
  /** Situation image (mainly for Caption Battle). */
  imageUrl?: string
}

export interface PromptContent extends PromptSnapshot {
  mode: GameMode
}
export interface CaptionContent {
  id: string
  text: string
}
export interface AssetContent {
  id: string
  title: string
  imageUrl: string
  modes: GameMode[]
}
export interface ContentPool {
  prompts: PromptContent[]
  captions: CaptionContent[]
  assets: AssetContent[]
}

// ── Game state ──────────────────────────────────────────────────────────────

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface Submission {
  id: string
  playerId: string
  option: Option
  status: SubmissionStatus
  /** Stable shuffled position, used for anonymous ordering in Review/Showcase/Voting. */
  order: number
}

export interface TallyEntry {
  submissionId: string
  playerId: string
  votes: number
}

export interface RoundResult {
  tallies: TallyEntry[]
  winnerSubmissionIds: string[]
  unique: boolean
  noWinner: boolean
  multiplier: 1 | 2
  pointsAwarded: Record<string, number>
  lockedAt: number
}

export interface RoundAward {
  title: string
  submissionId: string
}

export interface RoundState {
  index: number
  mode: GameMode
  special: SpecialEffect | null
  chaosStyle: ChaosStyle | null
  prompt: PromptSnapshot
  hands: Record<string, Option[]>
  submissions: Submission[]
  reopenCount: number
  showcaseIndex: number
  /** voterId → submissionId */
  votes: Record<string, string>
  votingClosed: boolean
  result: RoundResult | null
  resultPublished: boolean
  award: RoundAward | null
  skipped: boolean
}

export interface RoundPlan {
  mode: GameMode
  special: SpecialEffect | null
}

export interface ScoreEntry {
  points: number
  uniqueWins: number
}

export interface GameEvent {
  seq: number
  at: number
  type: string
  data?: Record<string, string | number | boolean | null>
}

export interface RoomSettings {
  minPlayers: number
  maxPlayers: number
  rounds: number
  hostGraceMs: number
  presenceMs: number
}

export interface RoomState {
  id: string
  code: string
  createdAt: number
  /** Monotonic semantic version — bumped on every change clients can observe. */
  stateVersion: number
  phase: Phase
  /** Phase to restore when a pause / host reconnection ends. */
  suspendedFrom: Phase | null
  hostLostAt: number | null
  settings: RoomSettings
  members: Record<string, Member>
  nextJoinOrder: number
  matchStarted: boolean
  plan: RoundPlan[]
  roundIndex: number
  rounds: RoundState[]
  scores: Record<string, ScoreEntry>
  usedPromptIds: string[]
  processed: Record<string, number>
  processedOrder: string[]
  events: GameEvent[]
}

// ── Commands ────────────────────────────────────────────────────────────────

export type HostCommand =
  | { type: 'START_MATCH' }
  | { type: 'OPEN_SUBMISSION' }
  | { type: 'CLOSE_SUBMISSION' }
  | { type: 'REVIEW_SUBMISSION'; submissionId: string; decision: 'approve' | 'reject' }
  | { type: 'APPROVE_ALL_PENDING' }
  | { type: 'REOPEN_SUBMISSION' }
  | { type: 'SKIP_ROUND' }
  | { type: 'OPEN_SHOWCASE' }
  | { type: 'SKIP_SHOWCASE' }
  | { type: 'SHOWCASE_GOTO'; index: number }
  | { type: 'END_SHOWCASE' }
  | { type: 'CLOSE_VOTING' }
  | { type: 'PUBLISH_RESULTS' }
  | { type: 'SET_AWARD'; submissionId: string; title: string }
  | { type: 'FINISH_ROUND' }
  | { type: 'NEXT_ROUND' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'KICK'; playerId: string }
  | { type: 'CANCEL_MATCH' }

export type PlayerCommand = { type: 'SUBMIT'; optionId: string } | { type: 'VOTE'; submissionId: string }

export type Command = HostCommand | PlayerCommand

export const HOST_COMMAND_TYPES: ReadonlySet<string> = new Set([
  'START_MATCH',
  'OPEN_SUBMISSION',
  'CLOSE_SUBMISSION',
  'REVIEW_SUBMISSION',
  'APPROVE_ALL_PENDING',
  'REOPEN_SUBMISSION',
  'SKIP_ROUND',
  'OPEN_SHOWCASE',
  'SKIP_SHOWCASE',
  'SHOWCASE_GOTO',
  'END_SHOWCASE',
  'CLOSE_VOTING',
  'PUBLISH_RESULTS',
  'SET_AWARD',
  'FINISH_ROUND',
  'NEXT_ROUND',
  'PAUSE',
  'RESUME',
  'KICK',
  'CANCEL_MATCH',
])

export interface EngineError {
  code: string
  message: string
  status: number
}

export type EngineResult = { ok: true; state: RoomState; duplicate?: boolean } | { ok: false; error: EngineError }

export interface EngineContext {
  now: number
  rng: () => number
  genId: () => string
  /** Content pool snapshot, supplied by the server for commands that deal a round. */
  content?: ContentPool
}

// ── Views (what clients may see) ────────────────────────────────────────────

export type ViewerKind = 'host' | 'player' | 'spectator' | 'screen'

export interface PublicMember {
  id: string
  name: string
  role: MemberRole
  eligible: boolean
  connected: boolean
  hasSubmitted: boolean
  hasVoted: boolean
}

export interface ScoreRow {
  playerId: string
  name: string
  points: number
  uniqueWins: number
  rank: number
}

export interface PublicSubmission {
  id: string
  option: Option
  /** Only set for the viewer's own submission. */
  mine?: boolean
}

export interface HostSubmission extends PublicSubmission {
  status: SubmissionStatus
}

export interface PublicResult {
  tallies: { submissionId: string; votes: number; option: Option; authorId: string; authorName: string }[]
  winnerSubmissionIds: string[]
  unique: boolean
  noWinner: boolean
  multiplier: 1 | 2
  pointsAwarded: Record<string, number>
}

export interface RoundView {
  index: number
  total: number
  mode: GameMode
  modeLabel: string
  special: SpecialEffect | null
  chaosStyle: ChaosStyle | null
  prompt: PromptSnapshot
  skipped: boolean
  reopenCount: number
  submittedCount: number
  eligibleCount: number
  votedCount: number
  validCount: number
  /** Approved submissions, anonymous — only populated from Showcase/Voting on. */
  submissions: PublicSubmission[]
  showcaseIndex: number
  /** Host Review list (anonymous, includes status). */
  reviewList: HostSubmission[] | null
  resultLocked: boolean
  result: PublicResult | null
  award: { title: string; submissionId: string } | null
}

export interface RoomView {
  roomId: string
  code: string
  stateVersion: number
  phase: Phase
  suspendedFrom: Phase | null
  viewer: ViewerKind
  me: { id: string; name: string; role: MemberRole; eligible: boolean } | null
  settings: { minPlayers: number; maxPlayers: number; rounds: number; hostGraceSeconds: number }
  hostDeadline: number | null
  members: PublicMember[]
  scoreboard: ScoreRow[]
  round: RoundView | null
  myHand: Option[] | null
  mySubmission: { optionId: string; status: SubmissionStatus } | null
  myVoteSubmissionId: string | null
  canStart: boolean
  matchStarted: boolean
}
