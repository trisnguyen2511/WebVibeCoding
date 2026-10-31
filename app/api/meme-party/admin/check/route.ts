import { NextRequest } from 'next/server'
import { isMemeAdminRequest } from '@/lib/meme-party/admin-auth'
import { ok } from '@/lib/meme-party/api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return ok({ authed: isMemeAdminRequest(req), configured: !!process.env.MEME_ADMIN_PASSWORD })
}
