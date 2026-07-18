import { NextRequest, NextResponse } from 'next/server'
import { WEREWOLF_ADMIN_COOKIE, issueAdminCookieValue, verifyAdminPassword } from '@/lib/werewolf-admin-auth'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { password } = body as { password?: string }
  if (!password || typeof password !== 'string' || !verifyAdminPassword(password)) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(WEREWOLF_ADMIN_COOKIE, issueAdminCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
