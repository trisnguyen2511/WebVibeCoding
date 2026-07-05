import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId')
  if (!roomId) return NextResponse.json({ error: 'roomId is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: room, error } = await supabase
    .from('chat_rooms')
    .select('pinned_message_id')
    .eq('id', roomId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!room?.pinned_message_id) return NextResponse.json({ message: null })

  const { data: message } = await supabase
    .from('chat_messages')
    .select('id, device_id, nickname, content, image_url')
    .eq('id', room.pinned_message_id)
    .maybeSingle()

  return NextResponse.json({ message: message ?? null })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, deviceId, messageId } = body as { roomId?: string; deviceId?: string; messageId?: string | null }
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  const { data: device } = await supabase
    .from('chat_devices')
    .select('id')
    .eq('room_id', roomId)
    .eq('device_id', deviceId)
    .maybeSingle()
  if (!device) return NextResponse.json({ error: 'not a member of this room' }, { status: 403 })

  const { error } = await supabase.from('chat_rooms').update({ pinned_message_id: messageId ?? null }).eq('id', roomId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let message = null
  if (messageId) {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, device_id, nickname, content, image_url')
      .eq('id', messageId)
      .maybeSingle()
    message = data
  }

  await supabase.channel(`chat-room-${roomId}`).send({
    type: 'broadcast',
    event: 'pin',
    payload: { message },
  })

  return NextResponse.json({ message })
}
