import { NextRequest } from 'next/server'
import { fail, ok } from '@/lib/meme-party/api'
import { getView } from '@/lib/meme-party/room-service'

export const dynamic = 'force-dynamic'

// Authorised snapshot for the caller: a member token sees its own view, no token sees the public (shared-screen) view.
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  if (!/^\d{6}$/.test(params.code)) return fail('Mã phòng không hợp lệ', 400, 'invalid_code')
  const token = req.headers.get('x-mp-token')
  try {
    const res = await getView(params.code, token)
    if (!res.ok) return fail(res.error.message, res.error.status, res.error.code)
    const since = Number(req.nextUrl.searchParams.get('since'))
    if (Number.isFinite(since) && since === res.view.stateVersion && req.nextUrl.searchParams.get('lite') === '1') {
      return ok({ unchanged: true, stateVersion: res.view.stateVersion })
    }
    return ok({ unchanged: false, view: res.view })
  } catch (e) {
    return fail('Lỗi máy chủ: ' + (e instanceof Error ? e.message : 'unknown'), 500, 'server_error')
  }
}
