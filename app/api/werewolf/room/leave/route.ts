import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { roomChannelName } from '@/lib/werewolf/online-types'

// A room's session lives as long as at least one player is in it — once the
// last one leaves, the room is torn down too (the MC can also end it early
// via /dissolve).
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, deviceId } = body as { roomId?: string; deviceId?: string }
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: player, error: fetchError } = await supabase
    .from('werewolf_room_players')
    .select('id')
    .eq('room_id', roomId)
    .eq('device_id', deviceId)
    .maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!player) return NextResponse.json({ ok: true })

  const { error: deleteError } = await supabase.from('werewolf_room_players').delete().eq('id', player.id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  await supabase.channel(roomChannelName(roomId)).send({
    type: 'broadcast',
    event: 'player_left',
    payload: { playerId: player.id },
  })

  const { count } = await supabase
    .from('werewolf_room_players')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
  if ((count ?? 0) === 0) {
    await supabase.from('werewolf_rooms').delete().eq('id', roomId)
  }

  return NextResponse.json({ ok: true })
}
