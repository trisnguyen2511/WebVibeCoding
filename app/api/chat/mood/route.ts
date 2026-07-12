import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { pushToRoom } from '@/lib/chat-notify'
import { DEFAULT_MOOD_OPTIONS } from '@/lib/chat-defaults'

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

  // Only notify when a mood is actually set — clearing it back to neutral
  // isn't interesting enough to interrupt the other person for.
  if (mood) {
    const [{ data: sender }, { data: room }] = await Promise.all([
      supabase.from('chat_devices').select('nickname').eq('room_id', roomId).eq('device_id', deviceId).maybeSingle(),
      supabase.from('chat_rooms').select('name, icon_url, mood_options').eq('id', roomId).maybeSingle(),
    ])
    const moodOptions = room?.mood_options && room.mood_options.length > 0 ? room.mood_options : DEFAULT_MOOD_OPTIONS
    const option = moodOptions.find((m: { id: string; emoji: string; label: string }) => m.id === mood)
    const moodText = option ? `${option.emoji} ${option.label}` : mood
    const notifyBody = `${sender?.nickname ?? 'Ai đó'} đang cảm thấy ${moodText}`
    await pushToRoom(supabase, roomId, deviceId, room?.name ?? 'Trạng thái mới', notifyBody, room?.icon_url)
  }

  return NextResponse.json({ ok: true })
}
