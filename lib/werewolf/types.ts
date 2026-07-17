export type Faction = 'wolf' | 'village' | 'neutral'

export type EffectType =
  | 'kill'
  | 'protect'
  | 'inspect'
  | 'poison'
  | 'revive'
  | 'link'
  | 'swap'
  | 'silence'
  | 'custom'

export interface RoleDef {
  id: string
  name: string
  faction: Faction
  icon: string
  isBuiltIn: boolean
  actsAtNight: boolean
  priority: number
  targetCount: 0 | 1 | 2
  canTargetSelf: boolean
  canTargetDead: boolean
  effect: EffectType
  firstNightOnly: boolean
  description: string
  /** Extra lives before a vote elimination actually kills this role (VD Già làng). */
  extraLives: number
  /** Nhiều actor cùng giữ vai này chỉ tạo chung 1 NightAction (VD Sói cả bầy). */
  isCouncil: boolean
  /** Tổng số lần được dùng trong cả ván (VD mỗi bình thuốc Phù thủy dùng 1 lần). undefined = không giới hạn, dùng mọi đêm. */
  usesPerGame?: number
  /** MC có thể bỏ qua lượt này mà không tốn 1 lần dùng (không bắt buộc hành động). */
  skippable: boolean
}

export interface Player {
  id: string
  name: string
  roleIds: string[]
  isAlive: boolean
  linkedWith: string[]
  deathNight: number | null
  deathDay: number | null
  deathCause: string | null
  /** Số mạng còn lại khi giữ vai có extraLives > 0 (VD Già làng). */
  livesLeft: number
}

export interface NightAction {
  id: string
  night: number
  roleId: string
  actorPlayerId: string
  targetPlayerIds: string[]
  /** MC chọn "Bỏ qua lượt" — hành động không có hiệu lực và không tính vào usesPerGame. */
  skipped: boolean
  createdAt: number
}

export interface DayVote {
  id: string
  day: number
  voterPlayerId: string
  targetPlayerId: string
  createdAt: number
}

export interface DayResolution {
  day: number
  eliminatedPlayerId: string | null
  notes: string[]
}

export interface NightResolution {
  night: number
  deaths: string[]
  saved: string[]
  linked: [string, string][]
  notes: string[]
}

// Append-only log; undo/redo works by splicing entries out of/into this
// array (see lib/werewolf/game-actions.ts) rather than by marker events —
// derivePlayers() only reacts to the *resolved types, so removing a raw
// night_action/day_vote entry is enough to make it disappear everywhere.
export type GameEvent =
  | { id: string; type: 'night_action'; payload: NightAction }
  | { id: string; type: 'night_resolved'; payload: NightResolution }
  | { id: string; type: 'day_vote'; payload: DayVote }
  | { id: string; type: 'day_resolved'; payload: DayResolution }
  | { id: string; type: 'death_trigger_resolved'; payload: { playerId: string; targetPlayerIds: string[]; roleId: string } }

export type GamePhase = 'setup' | 'night' | 'day' | 'ended'

export interface PlayerSetup {
  id: string
  name: string
  roleIds: string[]
}

export interface GameState {
  setupPlayers: PlayerSetup[]
  roles: RoleDef[]
  setupRoleCounts: Record<string, number>
  events: GameEvent[]
  currentNight: number
  currentDay: number
  currentPhase: GamePhase
}

export const STORAGE_KEY = 'wv-werewolf-gm-state'
