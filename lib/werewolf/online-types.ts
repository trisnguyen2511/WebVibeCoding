import type { AssignMode, RoleDef } from './types'

export type RoomStatus = 'lobby' | 'locked' | 'in_game'

export interface RoomPlayer {
  id: string
  name: string
  seat: number | null
  roleIds: string[]
}

/** MC-side view of the room — full roster, no per-device secrets. */
export interface RoomState {
  roomId: string
  code: string
  status: RoomStatus
  realtimeEnabled: boolean
  gameEndedAt: string | null
  players: RoomPlayer[]
}

/** Player-side view — only what their own device is allowed to see. */
export interface SelfRoomView {
  roomId: string
  code: string
  status: RoomStatus
  playerId: string
  name: string
  seat: number | null
  roleIds: string[]
  roles: RoleDef[]
  realtimeEnabled: boolean
  gameEndedAt: string | null
}

export function roomChannelName(roomId: string): string {
  return `werewolf-room-${roomId}`
}

export type RoomBroadcastEvent =
  | { event: 'player_joined'; payload: RoomPlayer }
  | { event: 'player_left'; payload: { playerId: string } }
  | { event: 'player_kicked'; payload: { playerId: string } }
  | { event: 'room_locked'; payload: Record<string, never> }
  | { event: 'room_reopened'; payload: Record<string, never> }
  | {
      event: 'game_started'
      payload: { roles: RoleDef[]; assignMode: AssignMode; players: { playerId: string; seat: number | null; roleIds: string[] }[] }
    }
  | { event: 'role_assigned'; payload: { playerId: string; roleIds: string[] } }
  | { event: 'realtime_toggled'; payload: { enabled: boolean } }
  | { event: 'game_ended'; payload: Record<string, never> }
  | { event: 'room_dissolved'; payload: Record<string, never> }
