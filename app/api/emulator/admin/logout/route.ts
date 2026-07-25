import { NextResponse } from 'next/server'
import { EMULATOR_ADMIN_COOKIE } from '@/lib/emulator-admin-auth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(EMULATOR_ADMIN_COOKIE)
  return res
}
