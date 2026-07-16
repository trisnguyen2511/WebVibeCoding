import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { pushToRoom } from '@/lib/chat-notify'
import { enforceStorageQuota } from '@/lib/chat-storage-quota'
import { verifyAdminPassword } from '@/lib/chat-admin-auth'
import { CHAT_MAX_FILE_SIZE_BYTES } from '@/lib/chat-limits'
import { fetchLinkPreview, findFirstUrl } from '@/lib/link-preview'
import { FONT_CATALOG } from '@/lib/chat-defaults'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
// Read from the shared catalog instead of a hand-copied list — this hardcoded
// set previously only had the original 4 fonts, so every message sent with
// one of the 6 fonts added later (rounded/serif/script/impact/cute/funky)
// silently had its font_family stripped to null here, even though the input
// box itself (which reads style.font directly, no server round-trip) showed
// the chosen font correctly right up until send.
const FONT_FAMILIES = new Set(FONT_CATALOG.map((f) => f.id as string))
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
  const { roomId, deviceId, content, file, adminPassword, style, replyTo, revealAt, gesture, clientId } = body as {
    roomId?: string
    deviceId?: string
    content?: string
    file?: { url?: string; publicId?: string; bytes?: number; name?: string; resourceType?: string }
    adminPassword?: string
    style?: { color?: string; font?: string; bold?: boolean; italic?: boolean }
    replyTo?: { id?: string; nickname?: string; content?: string }
    revealAt?: string
    gesture?: string
    clientId?: string
  }
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })

  const gestureText = gesture && GESTURES[gesture] ? GESTURES[gesture] : null
  const trimmedContent = gestureText ? '' : typeof content === 'string' ? content.trim() : ''
  if (!trimmedContent && !gestureText && !file?.url) {
    return NextResponse.json({ error: 'content or file is required' }, { status: 400 })
  }
  if (file?.url && typeof file.bytes === 'number' && file.bytes > CHAT_MAX_FILE_SIZE_BYTES) {
    if (!adminPassword || !verifyAdminPassword(adminPassword)) {
      return NextResponse.json({ error: 'file exceeds the size limit' }, { status: 413 })
    }
  }

  let revealAtIso: string | null = null
  if (revealAt) {
    const parsed = new Date(revealAt)
    if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: 'invalid revealAt' }, { status: 400 })
    if (parsed.getTime() > Date.now()) revealAtIso = parsed.toISOString()
  }

  // Best-effort — a slow/failed fetch of the target page must never block
  // or fail the message send.
  const firstUrl = findFirstUrl(trimmedContent)
  const linkPreview = firstUrl ? await fetchLinkPreview(firstUrl).catch(() => null) : null

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
    text_color?: string | null
    font_family?: string | null
    bold?: boolean
    italic?: boolean
    reply_to_id?: string | null
    reply_to_nickname?: string | null
    reply_to_content?: string | null
    reveal_at?: string | null
    file_url?: string
    file_public_id?: string
    file_bytes?: number
    file_name?: string
    file_resource_type?: string
    link_preview?: unknown
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
    link_preview: linkPreview,
  }

  if (replyTo?.id && typeof replyTo.nickname === 'string') {
    insertPayload.reply_to_id = replyTo.id
    insertPayload.reply_to_nickname = replyTo.nickname
    insertPayload.reply_to_content = (replyTo.content ?? '').slice(0, REPLY_PREVIEW_MAX_LENGTH)
  }

  if (file?.url) {
    insertPayload.file_url = file.url
    if (file.publicId) insertPayload.file_public_id = file.publicId
    if (typeof file.bytes === 'number') insertPayload.file_bytes = file.bytes
    if (file.name) insertPayload.file_name = file.name
    insertPayload.file_resource_type = file.resourceType || 'raw'
  }

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert(insertPayload)
    .select(
      'id, device_id, nickname, content, image_url, text_color, font_family, bold, italic, reply_to_id, reply_to_nickname, reply_to_content, reveal_at, file_url, file_bytes, file_name, file_resource_type, link_preview, created_at'
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

  const { data: room } = await supabase.from('chat_rooms').select('name, icon_url').eq('id', roomId).maybeSingle()
  const notifyBody = isLocked
    ? `${sender.nickname} đã gửi một tin nhắn hẹn giờ 🕰️`
    : message.file_url
      ? `${sender.nickname}: [${
          message.file_resource_type === 'image' ? 'Hình ảnh' : message.file_resource_type === 'video' ? 'Video' : 'File'
        }]${message.content ? ` ${message.content}` : ''}`
      : `${sender.nickname}: ${message.content}`
  await pushToRoom(supabase, roomId, deviceId, room?.name ?? 'Tin nhắn mới', notifyBody, room?.icon_url, message.id)

  if (file?.url) {
    await enforceStorageQuota()
  }

  return NextResponse.json({ message: broadcastPayload })
}
