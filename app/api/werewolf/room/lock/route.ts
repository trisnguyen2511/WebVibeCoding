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
  const { roomId, gmDeviceId, locked } = body as { roomId?: string; gmDeviceId?: string; locked?: boolean }
  if (!roomId || !gmDeviceId || typeof locked !== 'boolean') {
    return NextResponse.json({ error: 'roomId, gmDeviceId and locked are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const result = await loadOwnedRoom(supabase, roomId, gmDeviceId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  if (result.room.status === 'in_game') return NextResponse.json({ error: 'Ván đang diễn ra' }, { status: 409 })

  const nextStatus = locked ? 'locked' : 'lobby'
  const { error } = await supabase.from('werewolf_rooms').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', roomId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.channel(roomChannelName(roomId)).send({
    type: 'broadcast',
    event: locked ? 'room_locked' : 'room_reopened',
    payload: {},
  })

  return NextResponse.json({ ok: true, status: nextStatus })
}
