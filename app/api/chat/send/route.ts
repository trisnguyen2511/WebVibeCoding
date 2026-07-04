import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { uploadChatImage } from '@/lib/cloudinary'
import { pushToRoom } from '@/lib/chat-notify'
import { enforceStorageQuota } from '@/lib/chat-storage-quota'

const MAX_IMAGE_DATA_URL_LENGTH = 8 * 1024 * 1024 // ~6MB image after base64 overhead

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, deviceId, content, image } = body as {
    roomId?: string
    deviceId?: string
    content?: string
    image?: { dataUrl?: string }
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
  } = {
    room_id: roomId,
    device_id: deviceId,
    nickname: sender.nickname,
    content: trimmedContent || null,
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
    .select('id, device_id, nickname, content, image_url, created_at')
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
