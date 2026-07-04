import { NextResponse } from 'next/server'
import { CHAT_ADMIN_COOKIE } from '@/lib/chat-admin-auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(CHAT_ADMIN_COOKIE)
  return res
}
