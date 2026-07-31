import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { generateUniqueRoomCode } from '@/lib/werewolf-room-code'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { gmDeviceId } = body as { gmDeviceId?: string }
  if (!gmDeviceId || typeof gmDeviceId !== 'string') {
    return NextResponse.json({ error: 'gmDeviceId is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const code = await generateUniqueRoomCode(supabase)

  const { data: room, error } = await supabase
    .from('werewolf_rooms')
    .insert({ code, gm_device_id: gmDeviceId })
    .select('id, code, status')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ roomId: room.id, code: room.code, status: room.status })
}
