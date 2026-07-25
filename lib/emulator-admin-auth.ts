import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

export const EMULATOR_ADMIN_COOKIE = 'wv-emulator-admin'

function sessionToken(): string {
  const secret = process.env.EMULATOR_ADMIN_PASSWORD ?? ''
  return createHmac('sha256', secret).update('emulator-admin').digest('hex')
}

export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.EMULATOR_ADMIN_PASSWORD ?? ''
  if (!expected || password.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(password), Buffer.from(expected))
}

export function issueAdminCookieValue(): string {
  return sessionToken()
}

export function isAdminRequest(req: NextRequest): boolean {
  const cookie = req.cookies.get(EMULATOR_ADMIN_COOKIE)?.value
  if (!cookie) return false
  const expected = sessionToken()
  if (cookie.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(expected))
}
