import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

export const CHAT_ADMIN_COOKIE = 'wv-chat-admin'

function sessionToken(): string {
  const secret = process.env.CHAT_ADMIN_PASSWORD ?? ''
  return createHmac('sha256', secret).update('private-chat-admin').digest('hex')
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.CHAT_ADMIN_PASSWORD ?? ''
  if (!expected || password.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(password), Buffer.from(expected))
}

export function issueAdminCookieValue(): string {
  return sessionToken()
}

export function isAdminRequest(req: NextRequest): boolean {
  const cookie = req.cookies.get(CHAT_ADMIN_COOKIE)?.value
  if (!cookie) return false
  const expected = sessionToken()
  if (cookie.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(expected))
}
