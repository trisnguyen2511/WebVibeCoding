import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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
  const lastReadAt = new Date().toISOString()

  const { error } = await supabase
    .from('chat_devices')
    .update({ last_read_at: lastReadAt })
    .eq('room_id', roomId)
    .eq('device_id', deviceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.channel(`chat-room-${roomId}`).send({
    type: 'broadcast',
    event: 'seen',
    payload: { deviceId, lastReadAt },
  })

  return NextResponse.json({ ok: true, lastReadAt })
}
