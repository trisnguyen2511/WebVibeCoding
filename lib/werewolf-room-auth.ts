import type { SupabaseClient } from '@supabase/supabase-js'

export interface WerewolfRoomRow {
  id: string
  code: string
  gm_device_id: string
  status: 'lobby' | 'locked' | 'in_game'
  roles: unknown
  role_counts: unknown
  assign_mode: 'preset' | 'live'
  realtime_enabled: boolean
  game_started_at: string | null
  game_ended_at: string | null
}

type OwnedRoomResult = { room: WerewolfRoomRow } | { error: string; status: number }

/** Loads a room and checks the caller's gmDeviceId owns it — the MC-side "auth" for every room-management route. */
export async function loadOwnedRoom(supabase: SupabaseClient, roomId: string, gmDeviceId: string): Promise<OwnedRoomResult> {
  const { data: room, error } = await supabase.from('werewolf_rooms').select('*').eq('id', roomId).maybeSingle()
  if (error) return { error: error.message, status: 500 }
  if (!room) return { error: 'room not found', status: 404 }
  if (room.gm_device_id !== gmDeviceId) return { error: 'unauthorized', status: 403 }
  return { room: room as WerewolfRoomRow }
}
