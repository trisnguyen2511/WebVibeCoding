import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/emulator-admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { deleteChatImages, uploadRomCover } from '@/lib/cloudinary'

const VALID_SYSTEMS = new Set(['nes', 'snes', 'gba', 'gbc', 'n64', 'arcade'])

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: roms, error } = await supabase
    .from('emulator_roms')
    .select('id, name, system, url, public_id, bytes, cover_url, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ roms: roms ?? [] })
}

// Called right after a successful direct-to-Cloudinary chunked upload
// (see /api/emulator/admin/upload-sign) finishes on the client — persists
// the resulting resource as a row, optionally with a cover thumbnail.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { name, system, url, publicId, bytes, coverDataUrl } = body as {
    name?: string
    system?: string
    url?: string
    publicId?: string
    bytes?: number
    coverDataUrl?: string
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!system || !VALID_SYSTEMS.has(system)) {
    return NextResponse.json({ error: 'hệ máy không hợp lệ' }, { status: 400 })
  }
  if (!url || !publicId || typeof bytes !== 'number') {
    return NextResponse.json({ error: 'url, publicId and bytes are required' }, { status: 400 })
  }

  let coverUrl: string | null = null
  let coverPublicId: string | null = null
  if (coverDataUrl) {
    try {
      const cover = await uploadRomCover(coverDataUrl)
      coverUrl = cover.url
      coverPublicId = cover.publicId
    } catch {
      return NextResponse.json({ error: 'upload ảnh cover thất bại' }, { status: 502 })
    }
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('emulator_roms')
    .insert({
      name: name.trim(),
      system,
      url,
      public_id: publicId,
      bytes,
      cover_url: coverUrl,
      cover_public_id: coverPublicId,
    })
    .select('id, name, system, url, public_id, bytes, cover_url, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rom: data })
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
  const { name, system, coverDataUrl, removeCover } = body as {
    name?: string
    system?: string
    coverDataUrl?: string
    removeCover?: boolean
  }

  const supabase = getSupabaseAdmin()
  const update: { name?: string; system?: string; cover_url?: string | null; cover_public_id?: string | null } = {}

  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    update.name = name.trim()
  }
  if (system !== undefined) {
    if (!VALID_SYSTEMS.has(system)) return NextResponse.json({ error: 'hệ máy không hợp lệ' }, { status: 400 })
    update.system = system
  }

  if (coverDataUrl || removeCover) {
    const { data: existing } = await supabase.from('emulator_roms').select('cover_public_id').eq('id', id).maybeSingle()
    if (existing?.cover_public_id) {
      await deleteChatImages([existing.cover_public_id], 'image').catch(() => {})
    }
    if (coverDataUrl) {
      try {
        const cover = await uploadRomCover(coverDataUrl)
        update.cover_url = cover.url
        update.cover_public_id = cover.publicId
      } catch {
        return NextResponse.json({ error: 'upload ảnh cover thất bại' }, { status: 502 })
      }
    } else {
      update.cover_url = null
      update.cover_public_id = null
    }
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabase.from('emulator_roms').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Deletes both the DB row and the underlying Cloudinary resources (ROM file
// + cover, if any) — the cloud files are removed first, and only once that
// succeeds do we drop the row, so a failed cloud delete never leaves a
// "deleted" row pointing at storage that's still actually there.
export async function DELETE(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: rom, error: fetchError } = await supabase
    .from('emulator_roms')
    .select('public_id, cover_public_id')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!rom) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    await deleteChatImages([rom.public_id], 'raw')
    if (rom.cover_public_id) await deleteChatImages([rom.cover_public_id], 'image')
  } catch {
    return NextResponse.json({ error: 'Xoá file trên cloud thất bại — thử lại.' }, { status: 502 })
  }

  const { error } = await supabase.from('emulator_roms').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
