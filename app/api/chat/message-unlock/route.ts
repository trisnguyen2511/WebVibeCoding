import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const deviceId = req.nextUrl.searchParams.get('deviceId')
  if (!id || !deviceId) return NextResponse.json({ error: 'id and deviceId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: message, error } = await supabase
    .from('chat_messages')
    .select(
      'id, room_id, device_id, nickname, content, image_url, text_color, font_family, bold, italic, reply_to_id, reply_to_nickname, reply_to_content, reveal_at, created_at'
    )
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!message) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: device } = await supabase
    .from('chat_devices')
    .select('id')
    .eq('room_id', message.room_id)
    .eq('device_id', deviceId)
    .maybeSingle()
  if (!device) return NextResponse.json({ error: 'not a member of this room' }, { status: 403 })

  const isLocked = Boolean(message.reveal_at && new Date(message.reveal_at).getTime() > Date.now())
  if (isLocked) return NextResponse.json({ message: { ...message, content: null, locked: true } })

  return NextResponse.json({ message: { ...message, locked: false } })
}
