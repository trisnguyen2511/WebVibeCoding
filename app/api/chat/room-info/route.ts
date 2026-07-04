import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const pin = req.nextUrl.searchParams.get('pin')
  if (!pin) return NextResponse.json({ error: 'pin is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: room, error } = await supabase
    .from('chat_rooms')
    .select('name, type')
    .eq('pin', pin.trim())
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'PIN không tồn tại' }, { status: 404 })

  return NextResponse.json({ name: room.name, type: room.type })
}
