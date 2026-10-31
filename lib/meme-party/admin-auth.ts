import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

export const MEME_ADMIN_COOKIE = 'wv-meme-admin'

function sessionToken(): string {
  const secret = process.env.MEME_ADMIN_PASSWORD ?? ''
  return createHmac('sha256', secret).update('meme-party-admin').digest('hex')
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.MEME_ADMIN_PASSWORD ?? ''
  if (!expected || password.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(password), Buffer.from(expected))
}

export const issueAdminCookieValue = sessionToken

/** Library management is closed entirely until MEME_ADMIN_PASSWORD is configured. */
export function isMemeAdminRequest(req: NextRequest): boolean {
  if (!process.env.MEME_ADMIN_PASSWORD) return false
  const cookie = req.cookies.get(MEME_ADMIN_COOKIE)?.value
  if (!cookie) return false
  const expected = sessionToken()
  return cookie.length === expected.length && timingSafeEqual(Buffer.from(cookie), Buffer.from(expected))
}
