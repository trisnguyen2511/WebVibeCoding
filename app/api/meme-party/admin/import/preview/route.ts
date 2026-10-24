import { NextRequest } from 'next/server'
import { fail, ok, readJson, requireAdmin } from '@/lib/meme-party/api'
import { getContentStore } from '@/lib/meme-party/content-store'
import { previewImport } from '@/lib/meme-party/import-service'
import { LIMITS } from '@/lib/meme-party/import-validate'
import type { DuplicatePolicy, ImportKind, StagedFile } from '@/lib/meme-party/library-types'

interface Body {
  kind?: unknown
  format?: unknown
  filename?: unknown
  text?: unknown
  policy?: unknown
  files?: unknown
}

const POLICIES: DuplicatePolicy[] = ['skip', 'update', 'create_new']
const KINDS: ImportKind[] = ['csv', 'json', 'images', 'combined']

function parseFiles(raw: unknown): StagedFile[] | null {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > LIMITS.maxRecords) return null
  const files: StagedFile[] = []
  for (const f of raw) {
    const o = f as Record<string, unknown>
    if (!o || typeof o.filename !== 'string' || typeof o.imageUrl !== 'string' || typeof o.sha256 !== 'string' || typeof o.mime !== 'string') return null
    files.push({
      filename: o.filename,
      imageUrl: o.imageUrl,
      storagePath: typeof o.storagePath === 'string' ? o.storagePath : null,
      mime: o.mime,
      width: typeof o.width === 'number' ? o.width : null,
      height: typeof o.height === 'number' ? o.height : null,
      sha256: o.sha256,
      size: typeof o.size === 'number' ? o.size : 0,
    })
  }
  return files
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const body = await readJson<Body>(req, LIMITS.maxFileBytes + 512 * 1024)
  if (!body) return fail('Yêu cầu không hợp lệ hoặc quá lớn', 400, 'invalid_body')
  const kind = body.kind as ImportKind
  const policy = body.policy as DuplicatePolicy
  const files = parseFiles(body.files)
  if (!KINDS.includes(kind) || !POLICIES.includes(policy) || !files || typeof body.filename !== 'string' || (body.text !== undefined && typeof body.text !== 'string')) {
    return fail('Tham số import không hợp lệ', 400, 'invalid_body')
  }
  if ((kind === 'csv' || kind === 'json' || kind === 'combined') && typeof body.text !== 'string') return fail('Thiếu nội dung file', 400, 'invalid_body')
  const format = body.format === 'csv' || body.format === 'json' ? body.format : undefined
  try {
    const { job, plan } = await previewImport(getContentStore(), { kind, format, filename: body.filename.slice(0, 200), text: body.text as string | undefined, policy, files, createdBy: 'admin' })
    return ok({ jobId: job?.id ?? null, plan })
  } catch (e) {
    return fail('Lỗi máy chủ: ' + (e instanceof Error ? e.message : 'unknown'), 500, 'server_error')
  }
}
