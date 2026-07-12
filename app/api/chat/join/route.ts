import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { pin, deviceId, nickname } = body as { pin?: string; deviceId?: string; nickname?: string }
  if (!pin || typeof pin !== 'string') return NextResponse.json({ error: 'pin is required' }, { status: 400 })
  if (!deviceId || typeof deviceId !== 'string') return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: room, error: roomError } = await supabase
    .from('chat_rooms')
    .select('id, name, type, anniversary_date, icon_url, mood_options, reaction_emojis, font_options')
    .eq('pin', pin.trim())
    .maybeSingle()

  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'PIN không tồn tại' }, { status: 404 })

  const trimmedNickname = typeof nickname === 'string' ? nickname.trim() : ''
  if (room.type !== 'solo' && !trimmedNickname) {
    return NextResponse.json({ error: 'nickname is required' }, { status: 400 })
  }
  const finalNickname = trimmedNickname || 'my pal'

  const { error: deviceError } = await supabase
    .from('chat_devices')
    .upsert(
      { room_id: room.id, device_id: deviceId, nickname: finalNickname, last_seen: new Date().toISOString() },
      { onConflict: 'room_id,device_id' }
    )
  if (deviceError) return NextResponse.json({ error: deviceError.message }, { status: 500 })

  return NextResponse.json({
    roomId: room.id,
    roomName: room.name,
    roomType: room.type,
    anniversaryDate: room.anniversary_date,
    roomIconUrl: room.icon_url,
    moodOptions: room.mood_options,
    reactionEmojis: room.reaction_emojis,
    fontOptions: room.font_options,
  })
}
