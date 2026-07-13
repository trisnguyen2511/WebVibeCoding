import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const RESULT_LIMIT = 30

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId')
  const deviceId = req.nextUrl.searchParams.get('deviceId')
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })
  if (!q) return NextResponse.json({ results: [] })

  const supabase = getSupabaseAdmin()

  const { data: device } = await supabase
    .from('chat_devices')
    .select('id')
    .eq('room_id', roomId)
    .eq('device_id', deviceId)
    .maybeSingle()
  if (!device) return NextResponse.json({ error: 'not a member of this room' }, { status: 403 })

  // Time-capsule messages that haven't unlocked yet must not be searchable —
  // their content shouldn't leak through search results either.
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, nickname, content, created_at, reveal_at')
    .eq('room_id', roomId)
    .ilike('content', `%${q}%`)
    .or(`reveal_at.is.null,reveal_at.lte.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data ?? [] })
}
