import { NextRequest } from 'next/server'
import { fail, ok, readJson, requireAdmin } from '@/lib/meme-party/api'
import { getContentStore } from '@/lib/meme-party/content-store'
import { bulkAction, updateItem } from '@/lib/meme-party/library-service'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const body = await readJson<Record<string, unknown>>(req)
  if (!body) return fail('Yêu cầu không hợp lệ', 400, 'invalid_body')
  const res = await updateItem(getContentStore(), params.id, body, 'admin')
  if (res.ok) return ok(res.item)
  return Response.json({ result: null, error: res.errors.map((e) => `${e.field ? e.field + ': ' : ''}${e.message}`).join('; '), code: 'validation', issues: res.errors }, { status: res.status })
}

// Soft delete: rows stay in the database so running and finished games keep their references.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const n = await bulkAction(getContentStore(), [params.id], 'delete', 'admin')
  return n > 0 ? ok({ deleted: n }) : fail('Không tìm thấy', 404, 'not_found')
}
