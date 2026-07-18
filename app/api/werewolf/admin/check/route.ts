import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/werewolf-admin-auth'

export async function GET(req: NextRequest) {
  return NextResponse.json({ authed: isAdminRequest(req) })
}
