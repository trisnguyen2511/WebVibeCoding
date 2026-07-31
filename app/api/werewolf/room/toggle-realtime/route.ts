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
  const { roomId, gmDeviceId, enabled } = body as { roomId?: string; gmDeviceId?: string; enabled?: boolean }
  if (!roomId || !gmDeviceId || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'roomId, gmDeviceId and enabled are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const result = await loadOwnedRoom(supabase, roomId, gmDeviceId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const { error } = await supabase
    .from('werewolf_rooms')
    .update({ realtime_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', roomId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.channel(roomChannelName(roomId)).send({
    type: 'broadcast',
    event: 'realtime_toggled',
    payload: { enabled },
  })

  return NextResponse.json({ ok: true })
}
