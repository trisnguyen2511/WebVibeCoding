import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const VALID_SYSTEMS = new Set(['nes', 'snes', 'gba', 'gbc', 'n64', 'arcade'])

// Public, read-only — the main emulator page's ROM picker needs this
// without any admin session (writes still only happen via the admin API).
export async function GET(req: NextRequest) {
  const system = req.nextUrl.searchParams.get('system')
  if (!system || !VALID_SYSTEMS.has(system)) {
    return NextResponse.json({ error: 'hệ máy không hợp lệ' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: roms, error } = await supabase
    .from('emulator_roms')
    .select('id, name, url, bytes, cover_url')
    .eq('system', system)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ roms: roms ?? [] })
}
