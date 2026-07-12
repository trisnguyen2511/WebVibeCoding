import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Moods are persisted per device so they survive reloads and are visible to
// the other party even if that party isn't currently connected to the
// realtime channel (a live broadcast alone can't reach an offline peer).
export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId')
  const deviceId = req.nextUrl.searchParams.get('deviceId')
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('chat_devices').select('device_id, mood').eq('room_id', roomId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ownMood = data?.find((d) => d.device_id === deviceId)?.mood ?? null
  const otherMood = data?.find((d) => d.device_id !== deviceId && d.mood)?.mood ?? null
  return NextResponse.json({ ownMood, otherMood })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, deviceId, mood } = body as { roomId?: string; deviceId?: string; mood?: string | null }
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('chat_devices')
    .update({ mood: mood ?? null })
    .eq('room_id', roomId)
    .eq('device_id', deviceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
