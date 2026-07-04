import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getWebPush } from '@/lib/web-push'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, deviceId, content } = body as { roomId?: string; deviceId?: string; content?: string }
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: sender } = await supabase
    .from('chat_devices')
    .select('nickname')
    .eq('room_id', roomId)
    .eq('device_id', deviceId)
    .maybeSingle()
  if (!sender) return NextResponse.json({ error: 'not a member of this room' }, { status: 403 })

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({ room_id: roomId, device_id: deviceId, nickname: sender.nickname, content: content.trim() })
    .select('id, device_id, nickname, content, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.channel(`chat-room-${roomId}`).send({
    type: 'broadcast',
    event: 'message',
    payload: message,
  })

  const { data: room } = await supabase.from('chat_rooms').select('name').eq('id', roomId).maybeSingle()
  const { data: devices } = await supabase
    .from('chat_devices')
    .select('device_id, push_subscription')
    .eq('room_id', roomId)
    .neq('device_id', deviceId)
    .not('push_subscription', 'is', null)

  if (devices && devices.length > 0) {
    const webpush = getWebPush()
    const payload = JSON.stringify({
      title: room?.name ?? 'Tin nhắn mới',
      body: `${sender.nickname}: ${message.content}`,
      roomId,
    })
    await Promise.all(
      devices.map(async (d) => {
        try {
          await webpush.sendNotification(d.push_subscription, payload)
        } catch {
          // subscription may be stale/expired — ignore, device will resubscribe on next visit
        }
      })
    )
  }

  return NextResponse.json({ message })
}
