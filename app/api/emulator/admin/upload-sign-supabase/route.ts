import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/emulator-admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const BUCKET = 'emulator-roms'

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  const { fileName, system } = body as { fileName?: string; system?: string }
  if (!fileName || !system) {
    return NextResponse.json({ error: 'fileName and system are required' }, { status: 400 })
  }

  const path = `${system}/${Date.now()}-${fileName}`
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`

  return NextResponse.json({ signedUrl: data.signedUrl, path, publicUrl })
}
