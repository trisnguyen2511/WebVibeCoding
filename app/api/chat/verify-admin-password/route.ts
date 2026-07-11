import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminPassword } from '@/lib/chat-admin-auth'

// Lightweight check used to let a user bypass the file-size limit for a
// single upload — unlike /api/chat/admin/login this does not set the
// admin-panel session cookie.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { password } = body as { password?: string }
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  return NextResponse.json({ ok: verifyAdminPassword(password) })
}
