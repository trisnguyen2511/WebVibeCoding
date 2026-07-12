import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Clears this device's push subscription for the room so it stops receiving
// notifications after leaving — the row itself is kept (messages/reactions
// still reference this device_id for nickname history).
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, deviceId } = body as { roomId?: string; deviceId?: string }
  if (!roomId || !deviceId) return NextResponse.json({ error: 'roomId and deviceId are required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('chat_devices')
    .update({ push_subscription: null })
    .eq('room_id', roomId)
    .eq('device_id', deviceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
