import { NextRequest } from 'next/server'
import { fail, ok, readJson, requireAdmin } from '@/lib/meme-party/api'
import { getContentStore } from '@/lib/meme-party/content-store'
import { bulkAction } from '@/lib/meme-party/library-service'

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const body = await readJson<{ ids?: unknown; action?: unknown; confirm?: unknown }>(req)
  if (!body || !Array.isArray(body.ids) || (body.action !== 'activate' && body.action !== 'deactivate' && body.action !== 'delete')) {
    return fail('Yêu cầu không hợp lệ', 400, 'invalid_body')
  }
  if (body.action === 'delete' && body.confirm !== true) return fail('Cần xác nhận trước khi xoá', 400, 'confirm_required')
  const affected = await bulkAction(getContentStore(), body.ids as string[], body.action, 'admin')
  return ok({ affected })
}
