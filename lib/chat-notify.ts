import { SupabaseClient } from '@supabase/supabase-js'
import { getWebPush } from '@/lib/web-push'

export async function pushToRoom(
  supabase: SupabaseClient,
  roomId: string,
  excludeDeviceId: string | null,
  title: string,
  body: string
): Promise<void> {
  let query = supabase
    .from('chat_devices')
    .select('push_subscription')
    .eq('room_id', roomId)
    .not('push_subscription', 'is', null)
  if (excludeDeviceId) query = query.neq('device_id', excludeDeviceId)

  const { data: devices } = await query
  if (!devices || devices.length === 0) return

  const webpush = getWebPush()
  const payload = JSON.stringify({ title, body, roomId })
  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification(d.push_subscription, payload)
      } catch {
        // subscription may be stale/expired — ignore, device will resubscribe on next visit
      }
    })
  )
}
