import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/emulator-admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { uploadRomCover } from '@/lib/cloudinary'
import { v2 as cloudinary } from 'cloudinary'

const VALID_SYSTEMS = new Set(['nes', 'snes', 'gba', 'gbc', 'n64', 'arcade'])
const ROM_EXTENSIONS = {
  nes: ['.nes'],
  snes: ['.sfc', '.smc'],
  gba: ['.gba'],
  gbc: ['.gbc', '.gb'],
  n64: ['.n64', '.z64', '.v64'],
  arcade: ['.zip'],
}
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

interface GameFile {
  system: string
  gameName: string
  romFile: File
  coverFile?: File
}

async function uploadRomFile(file: File): Promise<{ url: string; publicId: string; bytes: number } | null> {
  try {
    const buffer = await file.arrayBuffer()
    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', folder: 'emulator_roms', public_id: file.name.replace(/\.[^.]+$/, '') },
        (error, result) => {
          if (error) reject(error)
          else if (result) resolve({ secure_url: result.secure_url, public_id: result.public_id })
        },
      )
      uploadStream.end(Buffer.from(buffer))
    })

    return { url: result.secure_url, publicId: result.public_id, bytes: buffer.byteLength }
  } catch {
    return null
  }
}

async function uploadCoverImage(file: File): Promise<{ url: string; publicId: string } | null> {
  try {
    const buffer = await file.arrayBuffer()
    const dataUrl = `data:${file.type};base64,${Buffer.from(buffer).toString('base64')}`

    const cover = await uploadRomCover(dataUrl)
    return { url: cover.url, publicId: cover.publicId }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const allFiles = formData.getAll('files') as File[]

    console.log('[IMPORT] Received files:', allFiles.length)
    allFiles.forEach((f) => console.log(`  - ${f.webkitRelativePath || f.name} (${f.size} bytes)`))

    if (allFiles.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Parse folder structure
    const gamesBySystemAndName: Record<string, Record<string, GameFile>> = {}

    for (const file of allFiles) {
      const relativePath = file.webkitRelativePath || file.name
      const parts = relativePath.split('/')

      if (parts.length < 3) {
        console.log(`[SKIP] ${relativePath} - not enough path parts`)
        continue
      }

      const system = parts[0].toLowerCase()
      const gameName = parts[1]

      if (!VALID_SYSTEMS.has(system)) {
        console.log(`[SKIP] ${relativePath} - invalid system "${system}"`)
        continue
      }

      const fileName = file.name.toLowerCase()
      const fileExt = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()

      if (!gamesBySystemAndName[system]) gamesBySystemAndName[system] = {}
      if (!gamesBySystemAndName[system][gameName]) {
        gamesBySystemAndName[system][gameName] = { system, gameName, romFile: null as any }
      }

      // Check if ROM file
      const romExts = ROM_EXTENSIONS[system as keyof typeof ROM_EXTENSIONS] || []
      if (romExts.some((ext) => fileExt === ext)) {
        gamesBySystemAndName[system][gameName].romFile = file
        console.log(`[ROM] ${system}/${gameName}/${file.name}`)
      }
      // Check if cover image
      else if (IMAGE_EXTENSIONS.includes(fileExt)) {
        gamesBySystemAndName[system][gameName].coverFile = file
        console.log(`[COVER] ${system}/${gameName}/${file.name}`)
      } else {
        console.log(`[SKIP] ${system}/${gameName}/${file.name} - unknown extension`)
      }
    }

    // Upload games
    const supabase = getSupabaseAdmin()
    let created = 0
    let skipped = 0
    const errors: string[] = []

    console.log(`[PARSE] Found ${Object.keys(gamesBySystemAndName).length} systems`)
    for (const system of Object.keys(gamesBySystemAndName)) {
      console.log(`[PARSE] ${system}: ${Object.keys(gamesBySystemAndName[system]).length} games`)
    }

    for (const system of Object.keys(gamesBySystemAndName)) {
      for (const gameName of Object.keys(gamesBySystemAndName[system])) {
        const game = gamesBySystemAndName[system][gameName]

        if (!game.romFile) {
          console.log(`[SKIP] ${system}/${gameName} - no ROM file`)
          errors.push(`${system}/${gameName}: no ROM file found`)
          skipped++
          continue
        }

        // Upload ROM
        console.log(`[UPLOAD] ${system}/${gameName}/${game.romFile.name}`)
        const romData = await uploadRomFile(game.romFile)
        if (!romData) {
          console.log(`[ERROR] ${system}/${gameName} - ROM upload failed`)
          errors.push(`${system}/${gameName}: ROM upload failed`)
          skipped++
          continue
        }

        // Upload cover if exists
        let coverUrl: string | null = null
        let coverPublicId: string | null = null
        if (game.coverFile) {
          const coverData = await uploadCoverImage(game.coverFile)
          if (coverData) {
            coverUrl = coverData.url
            coverPublicId = coverData.publicId
          }
        }

        try {
          await supabase.from('emulator_roms').insert({
            name: gameName,
            system,
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
    }

    console.log(`[DONE] Created: ${created}, Skipped: ${skipped}`)
    if (errors.length > 0) console.log('[ERRORS]', errors)

    return NextResponse.json({
      created,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      message: `Created ${created} games, skipped ${skipped}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[FATAL]', message)
    return NextResponse.json({ error: `Failed to process folder: ${message}` }, { status: 500 })
  }
}
