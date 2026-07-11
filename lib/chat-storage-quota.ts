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
      await reclaimOldestAttachments(supabase, RECLAIM_TARGET_BYTES)
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
        .select('id, device_id, nickname, content, image_url, text_color, font_family, bold, italic, created_at')
        .single()
      if (!msg) return
      await supabase.channel(`chat-room-${room.id}`).send({ type: 'broadcast', event: 'message', payload: msg })
      await pushToRoom(supabase, room.id, null, 'Hệ thống', text)
    })
  )

  await supabase.from('chat_system_state').update({ storage_warned_at: new Date().toISOString() }).eq('id', true)
}

// Covers both the legacy image_* columns (old messages, sent before the
// image/video/file upload paths were unified) and the current file_* columns
// used by every attachment sent since — the cloud-storage cleanup mechanism
// must always account for everything actually taking up Cloudinary space,
// not just images.
async function reclaimOldestAttachments(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  targetBytes: number
): Promise<void> {
  const { data: rows } = await supabase
    .from('chat_messages')
    .select('id, image_public_id, image_bytes, file_public_id, file_bytes, file_resource_type')
    .or('image_public_id.not.is.null,file_public_id.not.is.null')
    .order('created_at', { ascending: true })
    .limit(500)

  if (!rows || rows.length === 0) return

  let reclaimed = 0
  const toDelete: { id: string; publicId: string; resourceType: string }[] = []
  for (const row of rows) {
    if (reclaimed >= targetBytes) break
    const publicId = row.file_public_id ?? row.image_public_id
    if (!publicId) continue
    const bytes = row.file_public_id ? row.file_bytes : row.image_bytes
    const resourceType = row.file_public_id ? row.file_resource_type ?? 'raw' : 'image'
    toDelete.push({ id: row.id, publicId, resourceType })
    reclaimed += bytes ?? 0
  }
  if (toDelete.length === 0) return

  const publicIdsByType = new Map<string, string[]>()
  for (const item of toDelete) {
    const list = publicIdsByType.get(item.resourceType) ?? []
    list.push(item.publicId)
    publicIdsByType.set(item.resourceType, list)
  }
  await Promise.all(
    Array.from(publicIdsByType.entries()).map(([resourceType, publicIds]) => deleteChatImages(publicIds, resourceType))
  )

  await Promise.all(
    toDelete.map((item) =>
      supabase
        .from('chat_messages')
        .update({
          content: '[Tệp đính kèm đã bị tự động xoá để tiết kiệm dung lượng]',
          image_url: null,
          image_public_id: null,
          image_bytes: null,
          file_url: null,
          file_public_id: null,
          file_bytes: null,
          file_name: null,
          file_resource_type: null,
        })
        .eq('id', item.id)
    )
  )
}
