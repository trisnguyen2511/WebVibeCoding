import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const pin = req.nextUrl.searchParams.get('pin')
  const roomId = req.nextUrl.searchParams.get('roomId')
  if (!pin && !roomId) return NextResponse.json({ error: 'pin or roomId is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  if (roomId) {
    // Used to refresh an already-joined session's room customization
    // (mood/reaction/font options, wallpaper, bubble colors, theme font,
    // name, icon, anniversary) — these only ever land on the client at join
    // time otherwise, so an admin change would never reach a device that
    // joined before it, until the user manually left and rejoined.
    const { data: room, error } = await supabase
      .from('chat_rooms')
      .select(
        'name, type, anniversary_date, icon_url, mood_options, reaction_emojis, font_options, wallpaper_preset, wallpaper_url, bubble_mine_color, bubble_other_color, theme_font'
      )
      .eq('id', roomId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!room) return NextResponse.json({ error: 'room not found' }, { status: 404 })

    return NextResponse.json({
      roomName: room.name,
      roomType: room.type,
      anniversaryDate: room.anniversary_date,
      roomIconUrl: room.icon_url,
      moodOptions: room.mood_options,
      reactionEmojis: room.reaction_emojis,
      fontOptions: room.font_options,
      wallpaperPreset: room.wallpaper_preset,
      wallpaperUrl: room.wallpaper_url,
      bubbleMineColor: room.bubble_mine_color,
      bubbleOtherColor: room.bubble_other_color,
      themeFont: room.theme_font,
    })
  }

  const { data: room, error } = await supabase
    .from('chat_rooms')
    .select('name, type')
    .eq('pin', (pin as string).trim())
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'PIN không tồn tại' }, { status: 404 })

  return NextResponse.json({ name: room.name, type: room.type })
}
