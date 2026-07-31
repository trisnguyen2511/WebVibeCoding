import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadOwnedRoom } from '@/lib/werewolf-room-auth'
import { roomChannelName } from '@/lib/werewolf/online-types'

// Used both when a round ends naturally and when the MC hits "Chơi lại" —
// either way the room re-opens for join, keeping names/seats but wiping
// roles, so the same players (plus any newcomers) can be dealt a fresh hand.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, gmDeviceId } = body as { roomId?: string; gmDeviceId?: string }
  if (!roomId || !gmDeviceId) return NextResponse.json({ error: 'roomId and gmDeviceId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const result = await loadOwnedRoom(supabase, roomId, gmDeviceId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const nowIso = new Date().toISOString()
  const { error: roomError } = await supabase
    .from('werewolf_rooms')
    .update({
      status: 'lobby',
      game_started_at: null,
      game_ended_at: nowIso,
      realtime_enabled: true,
      updated_at: nowIso,
    })
    .eq('id', roomId)
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })

  const { error: playersError } = await supabase.from('werewolf_room_players').update({ role_ids: [] }).eq('room_id', roomId)
  if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 })

  await supabase.channel(roomChannelName(roomId)).send({ type: 'broadcast', event: 'game_ended', payload: {} })

  return NextResponse.json({ ok: true })
}
