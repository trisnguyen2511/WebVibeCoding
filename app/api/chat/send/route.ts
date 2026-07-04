import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { uploadChatImage } from '@/lib/cloudinary'
import { pushToRoom } from '@/lib/chat-notify'
import { enforceStorageQuota } from '@/lib/chat-storage-quota'

const MAX_IMAGE_DATA_URL_LENGTH = 8 * 1024 * 1024 // ~6MB image after base64 overhead
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
const FONT_FAMILIES = new Set(['sans', 'display', 'mono', 'cursive'])

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, deviceId, content, image, style } = body as {
    roomId?: string
    deviceId?: string
    content?: string
    image?: { dataUrl?: string }
    style?: { color?: string; font?: string; bold?: boolean; italic?: boolean }
  }
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })

  const trimmedContent = typeof content === 'string' ? content.trim() : ''
  const imageDataUrl = image?.dataUrl
  if (!trimmedContent && !imageDataUrl) {
    return NextResponse.json({ error: 'content or image is required' }, { status: 400 })
  }
  if (imageDataUrl && imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return NextResponse.json({ error: 'image too large' }, { status: 413 })
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
  } = {
    room_id: roomId,
    device_id: deviceId,
    nickname: sender.nickname,
    content: trimmedContent || null,
    text_color: style?.color && HEX_COLOR_RE.test(style.color) ? style.color : null,
    font_family: style?.font && FONT_FAMILIES.has(style.font) ? style.font : null,
    bold: Boolean(style?.bold),
    italic: Boolean(style?.italic),
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
    .select('id, device_id, nickname, content, image_url, text_color, font_family, bold, italic, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.channel(`chat-room-${roomId}`).send({
    type: 'broadcast',
    event: 'message',
    payload: message,
  })

  const { data: room } = await supabase.from('chat_rooms').select('name').eq('id', roomId).maybeSingle()
  const notifyBody = message.image_url
    ? `${sender.nickname}: [Hình ảnh]${message.content ? ` ${message.content}` : ''}`
    : `${sender.nickname}: ${message.content}`
  await pushToRoom(supabase, roomId, deviceId, room?.name ?? 'Tin nhắn mới', notifyBody)

  if (uploadedImage) {
    await enforceStorageQuota()
  }

  return NextResponse.json({ message })
}
