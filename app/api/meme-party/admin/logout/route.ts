import { NextResponse } from 'next/server'
import { MEME_ADMIN_COOKIE } from '@/lib/meme-party/admin-auth'

export async function POST() {
  const res = NextResponse.json({ result: { ok: true }, error: null })
  res.cookies.set(MEME_ADMIN_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
