import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId')
  const deviceId = req.nextUrl.searchParams.get('deviceId')
  const before = req.nextUrl.searchParams.get('before')
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
    .select('id, device_id, nickname, content, image_url, text_color, font_family, bold, italic, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messages = (data ?? []).reverse()
  return NextResponse.json({ messages, hasMore: (data ?? []).length === PAGE_SIZE })
}
