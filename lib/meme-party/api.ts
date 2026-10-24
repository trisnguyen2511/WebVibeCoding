import { NextRequest, NextResponse } from 'next/server'
import { isMemeAdminRequest } from './admin-auth'

/** All Meme Party routes answer `{ result, error }` (plus a machine-readable `code` on errors). */
export const ok = <T,>(result: T, status = 200) => NextResponse.json({ result, error: null }, { status })
export const fail = (error: string, status: number, code = 'error') => NextResponse.json({ result: null, error, code }, { status })

export async function readJson<T>(req: NextRequest, maxBytes = 64 * 1024): Promise<T | null> {
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > maxBytes) return null
  try {
    const text = await req.text()
    if (text.length > maxBytes) return null
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export const clientKey = (req: NextRequest) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'

/** Returns an error response when the caller is not an authenticated library manager. */
export function requireAdmin(req: NextRequest): NextResponse | null {
  return isMemeAdminRequest(req) ? null : fail('Cần đăng nhập quản trị thư viện', 401, 'unauthorized')
}
