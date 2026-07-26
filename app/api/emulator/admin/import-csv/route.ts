import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/emulator-admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { uploadRomCover } from '@/lib/cloudinary'
import { readFileSync } from 'fs'
import { extname } from 'path'
import { v2 as cloudinary } from 'cloudinary'

const VALID_SYSTEMS = new Set(['nes', 'snes', 'gba', 'gbc', 'n64', 'arcade'])

async function uploadRomFromPath(filePath: string): Promise<{ url: string; publicId: string; bytes: number } | null> {
  try {
    const fileBuffer = readFileSync(filePath)
    const fileName = filePath.split('/').pop() || 'rom'

    const result = await new Promise<{ secure_url: string; public_id: string; bytes: number }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', folder: 'emulator_roms', public_id: fileName.replace(/\.[^.]+$/, '') },
        (error, result) => {
          if (error) reject(error)
          else if (result) resolve({ secure_url: result.secure_url, public_id: result.public_id, bytes: fileBuffer.length })
        },
      )
      uploadStream.end(fileBuffer)
    })

    return { url: result.secure_url, publicId: result.public_id, bytes: result.bytes }
  } catch {
    return null
  }
}

async function getCoverDataUrl(filePath: string): Promise<string | null> {
  try {
    const fileBuffer = readFileSync(filePath)
    const ext = extname(filePath).toLowerCase()
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)

    if (!isImage || fileBuffer.length > 1024 * 1024) return null

    return `data:image/${ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : ext.slice(1)};base64,${fileBuffer.toString('base64')}`
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  const { games } = body as {
    games?: Array<{ name: string; system: string; romPath: string; coverPath: string }>
  }

  if (!Array.isArray(games) || games.length === 0) {
    return NextResponse.json({ error: 'games array is required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  let created = 0
  let skipped = 0

  for (const game of games) {
    if (!game.name?.trim() || !game.system) {
      skipped++
      continue
    }

    if (!VALID_SYSTEMS.has(game.system)) {
      skipped++
      continue
    }

    if (!game.romPath?.trim()) {
      skipped++
      continue
    }

    const romData = await uploadRomFromPath(game.romPath)
    if (!romData) {
      skipped++
      continue
    }

    let coverUrl: string | null = null
    let coverPublicId: string | null = null

    if (game.coverPath?.trim()) {
      const coverDataUrl = await getCoverDataUrl(game.coverPath)
      if (coverDataUrl) {
        try {
          const cover = await uploadRomCover(coverDataUrl)
          coverUrl = cover.url
          coverPublicId = cover.publicId
        } catch {
          // Cover upload failed, continue without cover
        }
      }
    }

    try {
      await supabase.from('emulator_roms').insert({
        name: game.name.trim(),
        system: game.system,
        url: romData.url,
        public_id: romData.publicId,
        bytes: romData.bytes,
        cover_url: coverUrl,
        cover_public_id: coverPublicId,
      })
      created++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ created, skipped, message: `Created ${created} games, skipped ${skipped}` })
}
