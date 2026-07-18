import { NextResponse } from 'next/server'
import { WEREWOLF_ADMIN_COOKIE } from '@/lib/werewolf-admin-auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(WEREWOLF_ADMIN_COOKIE)
  return res
}
