import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/emulator-admin-auth'
import { createRomUploadSignature } from '@/lib/cloudinary'

const MAX_ROM_BYTES = 2 * 1024 ** 3 // 2GB
const VALID_SYSTEMS = new Set(['nes', 'snes', 'gba', 'gbc', 'n64', 'arcade'])

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { fileName, sizeBytes, system } = body as { fileName?: string; sizeBytes?: number; system?: string }

  if (!fileName || typeof fileName !== 'string') {
    return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
  }
  if (!system || !VALID_SYSTEMS.has(system)) {
    return NextResponse.json({ error: 'hệ máy không hợp lệ' }, { status: 400 })
  }
  if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
    return NextResponse.json({ error: 'sizeBytes is required' }, { status: 400 })
  }
  if (sizeBytes > MAX_ROM_BYTES) {
    return NextResponse.json({ error: 'File ROM vượt quá 2GB — vui lòng chọn file nhỏ hơn.' }, { status: 400 })
  }

  return NextResponse.json(createRomUploadSignature(system, fileName))
}
