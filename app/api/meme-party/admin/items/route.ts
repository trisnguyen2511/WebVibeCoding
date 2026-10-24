import { NextRequest } from 'next/server'
import { fail, ok, readJson, requireAdmin } from '@/lib/meme-party/api'
import { getContentStore } from '@/lib/meme-party/content-store'
import { CONTENT_KINDS, type ContentKind, type ContentStatus } from '@/lib/meme-party/library-types'
import { createItem } from '@/lib/meme-party/library-service'
import { GAME_MODES, type GameMode } from '@/lib/meme-party/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const p = req.nextUrl.searchParams
  const kind = p.get('kind')
  const mode = p.get('mode')
  const status = p.get('status')
  try {
    const out = await getContentStore().list({
      q: p.get('q') ?? undefined,
      kind: CONTENT_KINDS.includes(kind as ContentKind) ? (kind as ContentKind) : undefined,
      mode: GAME_MODES.includes(mode as GameMode) ? (mode as GameMode) : undefined,
      status: status === 'active' || status === 'inactive' ? (status as ContentStatus) : undefined,
      category: p.get('category') || undefined,
      tag: p.get('tag') || undefined,
      language: p.get('language') || undefined,
      limit: Math.min(Number(p.get('limit')) || 50, 200),
      offset: Number(p.get('offset')) || 0,
    })
    return ok(out)
  } catch (e) {
    return fail('Lỗi máy chủ: ' + (e instanceof Error ? e.message : 'unknown'), 500, 'server_error')
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const body = await readJson<Record<string, unknown>>(req)
  if (!body) return fail('Yêu cầu không hợp lệ', 400, 'invalid_body')
  const res = await createItem(getContentStore(), body, 'admin')
  return res.ok ? ok(res.item, 201) : validationFail(res.errors, res.status)
}

function validationFail(errors: { field: string; message: string }[], status: number) {
  return Response.json({ result: null, error: errors.map((e) => (e.field ? `${e.field}: ` : '') + e.message).join('; '), code: 'validation', issues: errors }, { status })
}
