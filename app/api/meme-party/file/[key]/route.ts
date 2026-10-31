import { NextRequest, NextResponse } from 'next/server'
import { getContentStore } from '@/lib/meme-party/content-store'

export const dynamic = 'force-dynamic'

// Serves images held by the in-memory dev store. With Supabase Storage configured, images are public URLs and this route returns 404.
export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  const file = await getContentStore().getFile(decodeURIComponent(params.key))
  if (!file) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: { 'content-type': file.mime, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' },
  })
}
