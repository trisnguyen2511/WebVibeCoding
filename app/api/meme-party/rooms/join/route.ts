import { NextRequest } from 'next/server'
import { clientKey, fail, ok, readJson } from '@/lib/meme-party/api'
import { rateLimited } from '@/lib/meme-party/rate-limit'
import { joinExistingRoom } from '@/lib/meme-party/room-service'

export async function POST(req: NextRequest) {
  if (rateLimited(`join:${clientKey(req)}`, 30, 60_000)) return fail('Thao tác quá nhanh, thử lại sau', 429, 'rate_limited')
  const body = await readJson<{ code?: string; name?: string }>(req, 2048)
  if (!body || typeof body.code !== 'string' || typeof body.name !== 'string' || !/^\d{6}$/.test(body.code)) {
    return fail('Cần mã phòng 6 số và tên', 400, 'invalid_body')
  }
  try {
    const res = await joinExistingRoom(body.code, body.name)
    if (!res.ok) return fail(res.error.message, res.error.status, res.error.code)
    return ok({ memberId: res.memberId, token: res.token, role: res.role, roomId: res.roomId, code: body.code })
  } catch (e) {
    return fail('Lỗi máy chủ: ' + (e instanceof Error ? e.message : 'unknown'), 500, 'server_error')
  }
}
