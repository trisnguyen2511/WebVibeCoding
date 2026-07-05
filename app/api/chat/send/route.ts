import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { uploadChatImage } from '@/lib/cloudinary'
import { pushToRoom } from '@/lib/chat-notify'
import { enforceStorageQuota } from '@/lib/chat-storage-quota'

const MAX_IMAGE_DATA_URL_LENGTH = 8 * 1024 * 1024 // ~6MB image after base64 overhead
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
const FONT_FAMILIES = new Set(['sans', 'display', 'mono', 'cursive'])
const REPLY_PREVIEW_MAX_LENGTH = 140

const GESTURES: Record<string, string> = {
  hug: '🤗 đã gửi một cái ôm',
  pat: '👊 đã gửi một cú đấm lưng ảo!',
  wave: '👋 đã vẫy tay chào',
  kiss: '😘 đã gửi một nụ hôn',
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, deviceId, content, image, style, replyTo, revealAt, gesture, clientId } = body as {
    roomId?: string
    deviceId?: string
    content?: string
    image?: { dataUrl?: string }
    style?: { color?: string; font?: string; bold?: boolean; italic?: boolean }
    replyTo?: { id?: string; nickname?: string; content?: string }
    revealAt?: string
    gesture?: string
    clientId?: string
  }
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })

  const gestureText = gesture && GESTURES[gesture] ? GESTURES[gesture] : null
  const trimmedContent = gestureText ? '' : typeof content === 'string' ? content.trim() : ''
  const imageDataUrl = gestureText ? undefined : image?.dataUrl
  if (!trimmedContent && !imageDataUrl && !gestureText) {
    return NextResponse.json({ error: 'content or image is required' }, { status: 400 })
  }
  if (imageDataUrl && imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return NextResponse.json({ error: 'image too large' }, { status: 413 })
  }

  let revealAtIso: string | null = null
  if (revealAt) {
    const parsed = new Date(revealAt)
    if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: 'invalid revealAt' }, { status: 400 })
    if (parsed.getTime() > Date.now()) revealAtIso = parsed.toISOString()
  }

  const supabase = getSupabaseAdmin()

  const { data: sender } = await supabase
    .from('chat_devices')
    .select('nickname')
    .eq('room_id', roomId)
    .eq('device_id', deviceId)
    .maybeSingle()
  if (!sender) return NextResponse.json({ error: 'not a member of this room' }, { status: 403 })

  const insertPayload: {
    room_id: string
    device_id: string
    nickname: string
    content: string | null
    image_url?: string
    image_public_id?: string
    image_bytes?: number
    text_color?: string | null
    font_family?: string | null
    bold?: boolean
    italic?: boolean
    reply_to_id?: string | null
    reply_to_nickname?: string | null
    reply_to_content?: string | null
    reveal_at?: string | null
  } = {
    room_id: roomId,
    device_id: deviceId,
    nickname: sender.nickname,
    content: gestureText || trimmedContent || null,
    text_color: style?.color && HEX_COLOR_RE.test(style.color) ? style.color : null,
    font_family: style?.font && FONT_FAMILIES.has(style.font) ? style.font : null,
    bold: Boolean(style?.bold),
    italic: Boolean(style?.italic),
    reveal_at: revealAtIso,
  }

  if (replyTo?.id && typeof replyTo.nickname === 'string') {
    insertPayload.reply_to_id = replyTo.id
    insertPayload.reply_to_nickname = replyTo.nickname
    insertPayload.reply_to_content = (replyTo.content ?? '').slice(0, REPLY_PREVIEW_MAX_LENGTH)
  }

  let uploadedImage = false
  if (imageDataUrl) {
    try {
      const uploaded = await uploadChatImage(imageDataUrl)
      insertPayload.image_url = uploaded.url
      insertPayload.image_public_id = uploaded.publicId
      insertPayload.image_bytes = uploaded.bytes
      uploadedImage = true
    } catch {
      return NextResponse.json({ error: 'image upload failed' }, { status: 502 })
    }
  }

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert(insertPayload)
    .select(
      'id, device_id, nickname, content, image_url, text_color, font_family, bold, italic, reply_to_id, reply_to_nickname, reply_to_content, reveal_at, created_at'
    )
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Time-capsule messages must not leak their content over the realtime
  // broadcast to other devices before reveal_at — only the API's GET route
  // (which re-checks the clock on every request) is allowed to unlock them.
  const isLocked = Boolean(message.reveal_at && new Date(message.reveal_at).getTime() > Date.now())
  const withClientId = clientId ? { ...message, clientId } : message
  const broadcastPayload = isLocked ? { ...withClientId, content: null, locked: true } : withClientId

  await supabase.channel(`chat-room-${roomId}`).send({
    type: 'broadcast',
    event: 'message',
    payload: broadcastPayload,
  })

  if (gesture) {
    await supabase.channel(`chat-room-${roomId}`).send({
      type: 'broadcast',
      event: 'gesture',
      payload: { deviceId, nickname: sender.nickname, gesture },
    })
  }

  const { data: room } = await supabase.from('chat_rooms').select('name').eq('id', roomId).maybeSingle()
  const notifyBody = isLocked
    ? `${sender.nickname} đã gửi một tin nhắn hẹn giờ 🕰️`
    : message.image_url
      ? `${sender.nickname}: [Hình ảnh]${message.content ? ` ${message.content}` : ''}`
      : `${sender.nickname}: ${message.content}`
  await pushToRoom(supabase, roomId, deviceId, room?.name ?? 'Tin nhắn mới', notifyBody)

  if (uploadedImage) {
    await enforceStorageQuota()
  }

  return NextResponse.json({ message: broadcastPayload })
}
