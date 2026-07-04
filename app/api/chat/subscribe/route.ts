import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, deviceId, subscription } = body as {
    roomId?: string
    deviceId?: string
    subscription?: unknown
  }
  if (!roomId || !deviceId || !subscription) {
    return NextResponse.json({ error: 'roomId, deviceId and subscription are required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('chat_devices')
    .update({ push_subscription: subscription })
    .eq('room_id', roomId)
    .eq('device_id', deviceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
