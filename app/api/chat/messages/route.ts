import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const PAGE_SIZE = 50

function redactLocked<T extends { reveal_at: string | null; content: string | null }>(message: T) {
  const isLocked = Boolean(message.reveal_at && new Date(message.reveal_at).getTime() > Date.now())
  if (!isLocked) return { ...message, locked: false }
  return { ...message, content: null, locked: true }
}

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId')
  const deviceId = req.nextUrl.searchParams.get('deviceId')
  const before = req.nextUrl.searchParams.get('before')
  const after = req.nextUrl.searchParams.get('after')
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  const { data: device } = await supabase
    .from('chat_devices')
    .select('id')
    .eq('room_id', roomId)
    .eq('device_id', deviceId)
    .maybeSingle()
  if (!device) return NextResponse.json({ error: 'not a member of this room' }, { status: 403 })

  let query = supabase
    .from('chat_messages')
    .select(
      'id, device_id, nickname, content, image_url, text_color, font_family, bold, italic, reply_to_id, reply_to_nickname, reply_to_content, reveal_at, file_url, file_bytes, file_name, file_resource_type, created_at, chat_message_reactions(device_id, emoji)'
    )
    .eq('room_id', roomId)

  if (after) {
    // Incremental sync for a locally-cached room: only what's arrived since
    // the last cached message, in chronological order, no page limit needed.
    query = query.gt('created_at', after).order('created_at', { ascending: true }).limit(500)
  } else {
    query = query.order('created_at', { ascending: false }).limit(PAGE_SIZE)
    if (before) query = query.lt('created_at', before)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messages = after ? (data ?? []).map(redactLocked) : (data ?? []).reverse().map(redactLocked)
  return NextResponse.json({ messages, hasMore: after ? false : (data ?? []).length === PAGE_SIZE })
}
