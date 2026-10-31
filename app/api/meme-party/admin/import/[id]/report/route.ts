import { NextRequest, NextResponse } from 'next/server'
import { fail, requireAdmin } from '@/lib/meme-party/api'
import { getContentStore } from '@/lib/meme-party/content-store'
import { errorReportCsv } from '@/lib/meme-party/import-service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const job = await getContentStore().getJob(params.id)
  if (!job) return fail('Không tìm thấy lượt import', 404, 'not_found')
  return new NextResponse(errorReportCsv(job), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="meme-import-${job.id.slice(0, 8)}-errors.csv"` },
  })
}
