import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/chat-admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { deleteChatImages, uploadChatImage } from '@/lib/cloudinary'
import { FONT_CATALOG, WALLPAPER_PRESETS } from '@/lib/chat-defaults'

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: rooms, error } = await supabase
    .from('chat_rooms')
    .select('id, pin, name, type, anniversary_date, icon_url, mood_options, reaction_emojis, font_options, wallpaper_preset, wallpaper_url, bubble_mine_color, bubble_other_color, theme_font, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: devices } = await supabase.from('chat_devices').select('room_id')
  const counts = new Map<string, number>()
  for (const d of devices ?? []) counts.set(d.room_id, (counts.get(d.room_id) ?? 0) + 1)

  return NextResponse.json({
    rooms: (rooms ?? []).map((r) => ({ ...r, deviceCount: counts.get(r.id) ?? 0 })),
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { pin, name, type } = body as { pin?: string; name?: string; type?: string }
  if (!pin || typeof pin !== 'string' || !/^[0-9]{4,10}$/.test(pin)) {
    return NextResponse.json({ error: 'pin must be 4-10 digits' }, { status: 400 })
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const roomType = type === 'solo' ? 'solo' : 'group'

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('chat_rooms')
    .insert({ pin, name: name.trim(), type: roomType })
    .select('id, pin, name, type, created_at')
    .single()

  if (error) {
    const message = error.code === '23505' ? 'PIN already exists' : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }
  return NextResponse.json({ room: data })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const {
    name,
    anniversaryDate,
    iconDataUrl,
    removeIcon,
    moodOptions,
    reactionEmojis,
    fontOptions,
    wallpaperPreset,
    wallpaperDataUrl,
    removeWallpaperImage,
    bubbleMineColor,
    bubbleOtherColor,
    themeFont,
  } = body as {
    name?: string
    anniversaryDate?: string | null
    iconDataUrl?: string
    removeIcon?: boolean
    moodOptions?: { id: string; emoji: string; label: string; color: string }[] | null
    reactionEmojis?: string[] | null
    fontOptions?: { id: string; label: string }[] | null
    wallpaperPreset?: string | null
    wallpaperDataUrl?: string
    removeWallpaperImage?: boolean
    bubbleMineColor?: string | null
    bubbleOtherColor?: string | null
    themeFont?: string | null
  }

  const HEX_RE = /^#[0-9a-fA-F]{6}$/

  const supabase = getSupabaseAdmin()
  const update: {
    name?: string
    anniversary_date?: string | null
    icon_url?: string | null
    icon_public_id?: string | null
    mood_options?: { id: string; emoji: string; label: string; color: string }[] | null
    reaction_emojis?: string[] | null
    font_options?: { id: string; label: string }[] | null
    wallpaper_preset?: string | null
    wallpaper_url?: string | null
    wallpaper_public_id?: string | null
    bubble_mine_color?: string | null
    bubble_other_color?: string | null
    theme_font?: string | null
  } = {}

  if (bubbleMineColor !== undefined) {
    update.bubble_mine_color = bubbleMineColor && HEX_RE.test(bubbleMineColor) ? bubbleMineColor : null
  }
  if (bubbleOtherColor !== undefined) {
    update.bubble_other_color = bubbleOtherColor && HEX_RE.test(bubbleOtherColor) ? bubbleOtherColor : null
  }
  if (themeFont !== undefined) {
    const catalogIds = new Set(FONT_CATALOG.map((f) => f.id as string))
    update.theme_font = themeFont && catalogIds.has(themeFont) ? themeFont : null
  }

  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    update.name = name.trim()
  }

  if (anniversaryDate !== undefined) {
    update.anniversary_date = anniversaryDate || null
  }

  if (moodOptions !== undefined) {
    update.mood_options =
      moodOptions && moodOptions.length > 0
        ? moodOptions.filter((m) => m.id && m.emoji && m.label && m.color)
        : null
  }

  if (reactionEmojis !== undefined) {
    update.reaction_emojis = reactionEmojis && reactionEmojis.length > 0 ? reactionEmojis.filter(Boolean) : null
  }

  if (fontOptions !== undefined) {
    // Font ids are fixed in code (each is a real pre-loaded font) — only
    // accept ids from the known catalog, admin can only pick a subset/relabel.
    const catalogIds = new Set(FONT_CATALOG.map((f) => f.id))
    const valid = (fontOptions ?? []).filter((f) => f.id && f.label && catalogIds.has(f.id as (typeof FONT_CATALOG)[number]['id']))
    update.font_options = valid.length > 0 ? valid : null
  }

  if (iconDataUrl || removeIcon) {
    const { data: existing } = await supabase.from('chat_rooms').select('icon_public_id').eq('id', id).maybeSingle()
    if (existing?.icon_public_id) {
      await deleteChatImages([existing.icon_public_id]).catch(() => {})
    }
    if (iconDataUrl) {
      try {
        const uploaded = await uploadChatImage(iconDataUrl)
        update.icon_url = uploaded.url
        update.icon_public_id = uploaded.publicId
      } catch {
        return NextResponse.json({ error: 'icon upload failed' }, { status: 502 })
      }
    } else {
      update.icon_url = null
      update.icon_public_id = null
    }
  }

  if (wallpaperPreset !== undefined) {
    const validPresetIds = new Set(WALLPAPER_PRESETS.map((w) => w.id))
    update.wallpaper_preset = wallpaperPreset && validPresetIds.has(wallpaperPreset as (typeof WALLPAPER_PRESETS)[number]['id'])
      ? wallpaperPreset
      : null
  }

  if (wallpaperDataUrl || removeWallpaperImage) {
    const { data: existing } = await supabase.from('chat_rooms').select('wallpaper_public_id').eq('id', id).maybeSingle()
    if (existing?.wallpaper_public_id) {
      await deleteChatImages([existing.wallpaper_public_id]).catch(() => {})
    }
    if (wallpaperDataUrl) {
      try {
        const uploaded = await uploadChatImage(wallpaperDataUrl)
        update.wallpaper_url = uploaded.url
        update.wallpaper_public_id = uploaded.publicId
        update.wallpaper_preset = null // custom image takes over from any preset
      } catch {
        return NextResponse.json({ error: 'wallpaper upload failed' }, { status: 502 })
      }
    } else {
      update.wallpaper_url = null
      update.wallpaper_public_id = null
    }
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabase.from('chat_rooms').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('chat_rooms').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
