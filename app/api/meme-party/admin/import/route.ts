import { NextRequest } from 'next/server'
import { fail, ok, requireAdmin } from '@/lib/meme-party/api'
import { getContentStore } from '@/lib/meme-party/content-store'

export const dynamic = 'force-dynamic'

const summarize = (j: { records: unknown; files: unknown; items: unknown } & Record<string, unknown>) => {
  const { records: _r, files: _f, items: _i, ...rest } = j
  void _r
  void _f
  void _i
  return rest
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    const jobs = await getContentStore().listJobs(50)
    return ok(jobs.map((j) => summarize(j as never)))
  } catch (e) {
    return fail('Lỗi máy chủ: ' + (e instanceof Error ? e.message : 'unknown'), 500, 'server_error')
  }
}
