import { NextRequest } from 'next/server'
import { clientKey, fail, ok, readJson } from '@/lib/meme-party/api'
import { rateLimited } from '@/lib/meme-party/rate-limit'
import { createNewRoom } from '@/lib/meme-party/room-service'

export async function POST(req: NextRequest) {
  if (rateLimited(`create:${clientKey(req)}`, 10, 60_000)) return fail('Thao tác quá nhanh, thử lại sau', 429, 'rate_limited')
  const body = await readJson<{ hostName?: string }>(req, 2048)
  if (!body) return fail('Yêu cầu không hợp lệ', 400, 'invalid_body')
  const hostName = typeof body.hostName === 'string' ? body.hostName : 'Host'
  try {
    const res = await createNewRoom(hostName)
    if (!res.ok) return fail(res.error.message, res.error.status, res.error.code)
    return ok({ roomId: res.roomId, code: res.code, hostToken: res.hostToken, memberId: res.memberId })
  } catch (e) {
    return fail('Lỗi máy chủ: ' + (e instanceof Error ? e.message : 'unknown'), 500, 'server_error')
  }
}
