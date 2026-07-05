import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, messageId, deviceId, emoji } = body as {
    roomId?: string
    messageId?: string
    deviceId?: string
    emoji?: string
  }
  if (!roomId || !messageId || !deviceId || !emoji) {
    return NextResponse.json({ error: 'roomId, messageId, deviceId and emoji are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: device } = await supabase
    .from('chat_devices')
    .select('id')
    .eq('room_id', roomId)
    .eq('device_id', deviceId)
    .maybeSingle()
  if (!device) return NextResponse.json({ error: 'not a member of this room' }, { status: 403 })

  const { data: existing } = await supabase
    .from('chat_message_reactions')
    .select('emoji')
    .eq('message_id', messageId)
    .eq('device_id', deviceId)
    .maybeSingle()

  let resultEmoji: string | null = emoji
  if (existing?.emoji === emoji) {
    await supabase.from('chat_message_reactions').delete().eq('message_id', messageId).eq('device_id', deviceId)
    resultEmoji = null
  } else {
    await supabase
      .from('chat_message_reactions')
      .upsert({ message_id: messageId, room_id: roomId, device_id: deviceId, emoji }, { onConflict: 'message_id,device_id' })
  }

  await supabase.channel(`chat-room-${roomId}`).send({
    type: 'broadcast',
    event: 'reaction',
    payload: { messageId, deviceId, emoji: resultEmoji },
  })

  return NextResponse.json({ emoji: resultEmoji })
}
