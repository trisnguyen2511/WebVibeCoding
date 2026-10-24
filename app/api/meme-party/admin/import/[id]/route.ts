import { NextRequest } from 'next/server'
import { fail, ok, requireAdmin } from '@/lib/meme-party/api'
import { getContentStore } from '@/lib/meme-party/content-store'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const job = await getContentStore().getJob(params.id)
  if (!job) return fail('Không tìm thấy lượt import', 404, 'not_found')
  const { records: _r, files: _f, ...rest } = job
  void _r
  void _f
  return ok(rest)
}
