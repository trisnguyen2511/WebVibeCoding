import { NextRequest } from 'next/server'
import { fail, ok, requireAdmin } from '@/lib/meme-party/api'
import { getContentStore } from '@/lib/meme-party/content-store'
import { cancelImport } from '@/lib/meme-party/import-service'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    const job = await cancelImport(getContentStore(), params.id)
    if (!job) return fail('Không tìm thấy lượt import', 404, 'not_found')
    const { records: _r, files: _f, ...rest } = job
    void _r
    void _f
    return ok(rest)
  } catch (e) {
    return fail('Lỗi máy chủ: ' + (e instanceof Error ? e.message : 'unknown'), 500, 'server_error')
  }
}
