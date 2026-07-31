import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadOwnedRoom } from '@/lib/werewolf-room-auth'

// MC-only: re-hydrates the full roster after a page refresh (e.g. resuming
// an online room from localStorage).
export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId')
  const gmDeviceId = req.nextUrl.searchParams.get('gmDeviceId')
  if (!roomId || !gmDeviceId) return NextResponse.json({ error: 'roomId and gmDeviceId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const result = await loadOwnedRoom(supabase, roomId, gmDeviceId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const { data: players, error } = await supabase
    .from('werewolf_room_players')
    .select('id, name, seat, role_ids')
    .eq('room_id', roomId)
    .order('seat', { ascending: true, nullsFirst: false })
    .order('joined_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    roomId: result.room.id,
    code: result.room.code,
    status: result.room.status,
    realtimeEnabled: result.room.realtime_enabled,
    gameEndedAt: result.room.game_ended_at,
    players: (players ?? []).map((p) => ({ id: p.id, name: p.name, seat: p.seat, roleIds: p.role_ids as string[] })),
  })
}
