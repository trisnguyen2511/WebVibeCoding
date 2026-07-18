import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/werewolf-admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET không yêu cầu đăng nhập admin — MC nào cũng cần chọn nhanh 1 nhóm có
// sẵn ở màn hình thêm người chơi. Chỉ tạo/sửa/xoá mới cần quyền admin.
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('werewolf_player_groups')
    .select('id, name, player_names, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    groups: (data ?? []).map((g) => ({ id: g.id, name: g.name, playerNames: g.player_names as string[], createdAt: g.created_at })),
  })
}

function parsePlayerNames(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null
  const names = input.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim())
  return names.length > 0 ? names : null
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { name, playerNames } = body as { name?: string; playerNames?: unknown }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const names = parsePlayerNames(playerNames)
  if (!names) return NextResponse.json({ error: 'playerNames must be a non-empty list' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('werewolf_player_groups')
    .insert({ name: name.trim(), player_names: names })
    .select('id, name, player_names, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: { id: data.id, name: data.name, playerNames: data.player_names, createdAt: data.created_at } })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { name, playerNames } = body as { name?: string; playerNames?: unknown }

  const update: { name?: string; player_names?: string[]; updated_at: string } = { updated_at: new Date().toISOString() }
  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    update.name = name.trim()
  }
  if (playerNames !== undefined) {
    const names = parsePlayerNames(playerNames)
    if (!names) return NextResponse.json({ error: 'playerNames must be a non-empty list' }, { status: 400 })
    update.player_names = names
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('werewolf_player_groups').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('werewolf_player_groups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
