import { NextRequest } from 'next/server'
import { MEME_ADMIN_COOKIE, issueAdminCookieValue, verifyAdminPassword } from '@/lib/meme-party/admin-auth'
import { clientKey, fail, readJson } from '@/lib/meme-party/api'
import { rateLimited } from '@/lib/meme-party/rate-limit'
import { NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  if (rateLimited(`login:${clientKey(req)}`, 8, 5 * 60_000)) return fail('Thử quá nhiều lần, đợi vài phút', 429, 'rate_limited')
  const body = await readJson<{ password?: string }>(req, 1024)
  if (!body || typeof body.password !== 'string' || !verifyAdminPassword(body.password)) return fail('Sai mật khẩu', 401, 'invalid_password')
  const res = NextResponse.json({ result: { ok: true }, error: null })
  res.cookies.set(MEME_ADMIN_COOKIE, issueAdminCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 12,
  })
  return res
}
