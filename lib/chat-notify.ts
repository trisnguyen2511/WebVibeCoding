import { SupabaseClient } from '@supabase/supabase-js'
import { getWebPush } from '@/lib/web-push'

export async function pushToRoom(
  supabase: SupabaseClient,
  roomId: string,
  excludeDeviceId: string | null,
  title: string,
  body: string,
  icon?: string | null,
  messageId?: string | null
): Promise<void> {
  let query = supabase
    .from('chat_devices')
    .select('push_subscription')
    .eq('room_id', roomId)
    .not('push_subscription', 'is', null)
  if (excludeDeviceId) query = query.neq('device_id', excludeDeviceId)

  const { data: devices, error } = await query
  if (error) {
    console.error('[chat-notify] failed to load subscribed devices', error.message)
    return
  }
  if (!devices || devices.length === 0) {
    console.log(`[chat-notify] no push-subscribed devices for room ${roomId} (excluding ${excludeDeviceId ?? 'none'})`)
    return
  }

  const webpush = getWebPush()
  const payload = JSON.stringify({ title, body, roomId, icon: icon || undefined, messageId: messageId || undefined })
  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification(d.push_subscription, payload)
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        console.error(`[chat-notify] push send failed (status ${statusCode ?? 'unknown'})`, err instanceof Error ? err.message : err)
      }
    })
  )
}
