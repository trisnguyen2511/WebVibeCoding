import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/chat-admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: rooms, error } = await supabase
    .from('chat_rooms')
    .select('id, pin, name, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: devices } = await supabase.from('chat_devices').select('room_id')
  const counts = new Map<string, number>()
  for (const d of devices ?? []) counts.set(d.room_id, (counts.get(d.room_id) ?? 0) + 1)

  return NextResponse.json({
    rooms: (rooms ?? []).map((r) => ({ ...r, deviceCount: counts.get(r.id) ?? 0 })),
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { pin, name } = body as { pin?: string; name?: string }
  if (!pin || typeof pin !== 'string' || !/^[0-9]{4,10}$/.test(pin)) {
    return NextResponse.json({ error: 'pin must be 4-10 digits' }, { status: 400 })
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('chat_rooms')
    .insert({ pin, name: name.trim() })
    .select('id, pin, name, created_at')
    .single()

  if (error) {
    const message = error.code === '23505' ? 'PIN already exists' : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }
  return NextResponse.json({ room: data })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('chat_rooms').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
