import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

export const WEREWOLF_ADMIN_COOKIE = 'wv-werewolf-admin'

function sessionToken(): string {
  const secret = process.env.WEREWOLF_ADMIN_PASSWORD ?? ''
  return createHmac('sha256', secret).update('werewolf-gm-admin').digest('hex')
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.WEREWOLF_ADMIN_PASSWORD ?? ''
  if (!expected || password.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(password), Buffer.from(expected))
}

export function issueAdminCookieValue(): string {
  return sessionToken()
}

export function isAdminRequest(req: NextRequest): boolean {
  const cookie = req.cookies.get(WEREWOLF_ADMIN_COOKIE)?.value
  if (!cookie) return false
  const expected = sessionToken()
  if (cookie.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(expected))
}
