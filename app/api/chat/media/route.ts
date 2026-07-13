import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const PAGE_SIZE = 30

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
    .select('id, nickname, image_url, file_url, file_name, file_resource_type, created_at')
    .eq('room_id', roomId)
    .or('image_url.not.is.null,file_url.not.is.null')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [], hasMore: (data ?? []).length === PAGE_SIZE })
}
