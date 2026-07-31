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
  const { roomId, gmDeviceId } = body as { roomId?: string; gmDeviceId?: string }
  if (!roomId || !gmDeviceId) return NextResponse.json({ error: 'roomId and gmDeviceId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const result = await loadOwnedRoom(supabase, roomId, gmDeviceId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  // Broadcast before the delete — players still connected need the chance to react.
  await supabase.channel(roomChannelName(roomId)).send({ type: 'broadcast', event: 'room_dissolved', payload: {} })

  const { error } = await supabase.from('werewolf_rooms').delete().eq('id', roomId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
