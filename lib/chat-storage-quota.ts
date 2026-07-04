import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { deleteChatImages, getCloudinaryUsageBytes } from '@/lib/cloudinary'
import { pushToRoom } from '@/lib/chat-notify'

const GB = 1024 ** 3
const WARN_THRESHOLD_BYTES = 20 * GB
const HARD_THRESHOLD_BYTES = 24 * GB
const RECLAIM_TARGET_BYTES = 2 * GB
const WARN_COOLDOWN_MS = 60 * 60 * 1000

// Called after every image upload. Never throws — a quota-check failure
// must not block the message that triggered it from being sent.
export async function enforceStorageQuota(): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const usageBytes = await getCloudinaryUsageBytes()

    if (usageBytes >= HARD_THRESHOLD_BYTES) {
      await reclaimOldestImages(supabase, RECLAIM_TARGET_BYTES)
    }
    if (usageBytes >= WARN_THRESHOLD_BYTES) {
      await warnAllRoomsIfDue(supabase, usageBytes)
    }
  } catch {
    // best-effort — quota enforcement is not on the critical send path
  }
}

async function warnAllRoomsIfDue(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  usageBytes: number
): Promise<void> {
  const { data: state } = await supabase
    .from('chat_system_state')
    .select('storage_warned_at')
    .eq('id', true)
    .maybeSingle()

  const lastWarned = state?.storage_warned_at ? new Date(state.storage_warned_at).getTime() : 0
  if (Date.now() - lastWarned < WARN_COOLDOWN_MS) return

  const { data: rooms } = await supabase.from('chat_rooms').select('id')
  if (!rooms || rooms.length === 0) return

  const usedGb = (usageBytes / GB).toFixed(1)
  const text = `⚠️ Hệ thống: dung lượng lưu ảnh đã dùng ${usedGb}GB/25GB, sắp đầy.`

  await Promise.all(
    rooms.map(async (room) => {
      const { data: msg } = await supabase
        .from('chat_messages')
        .insert({ room_id: room.id, device_id: 'system', nickname: 'Hệ thống', content: text })
        .select('id, device_id, nickname, content, image_url, created_at')
        .single()
      if (!msg) return
      await supabase.channel(`chat-room-${room.id}`).send({ type: 'broadcast', event: 'message', payload: msg })
      await pushToRoom(supabase, room.id, null, 'Hệ thống', text)
    })
  )

  await supabase.from('chat_system_state').update({ storage_warned_at: new Date().toISOString() }).eq('id', true)
}

async function reclaimOldestImages(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  targetBytes: number
): Promise<void> {
  const { data: images } = await supabase
    .from('chat_messages')
    .select('id, image_public_id, image_bytes')
    .not('image_public_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(500)

  if (!images || images.length === 0) return

  let reclaimed = 0
  const toDelete: typeof images = []
  for (const img of images) {
    if (reclaimed >= targetBytes) break
    toDelete.push(img)
    reclaimed += img.image_bytes ?? 0
  }
  if (toDelete.length === 0) return

  await deleteChatImages(toDelete.map((d) => d.image_public_id as string))

  await Promise.all(
    toDelete.map((img) =>
      supabase
        .from('chat_messages')
        .update({
          content: '[Ảnh đã bị tự động xoá để tiết kiệm dung lượng]',
          image_url: null,
          image_public_id: null,
          image_bytes: null,
        })
        .eq('id', img.id)
    )
  )
}
