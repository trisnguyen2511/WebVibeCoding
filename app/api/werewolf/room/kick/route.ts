import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadOwnedRoom } from '@/lib/werewolf-room-auth'
import { roomChannelName } from '@/lib/werewolf/online-types'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, gmDeviceId, playerId } = body as { roomId?: string; gmDeviceId?: string; playerId?: string }
  if (!roomId || !gmDeviceId || !playerId)
    return NextResponse.json({ error: 'roomId, gmDeviceId and playerId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const auth = await loadOwnedRoom(supabase, roomId, gmDeviceId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error: deleteError } = await supabase
    .from('werewolf_room_players')
    .delete()
    .eq('id', playerId)
    .eq('room_id', roomId)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  await supabase.channel(roomChannelName(roomId)).send({
    type: 'broadcast',
    event: 'player_kicked',
    payload: { playerId },
  })

  return NextResponse.json({ ok: true })
}
