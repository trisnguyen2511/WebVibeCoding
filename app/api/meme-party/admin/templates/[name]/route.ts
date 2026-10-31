import { NextRequest, NextResponse } from 'next/server'
import { fail, requireAdmin } from '@/lib/meme-party/api'
import { CSV_GUIDE, csvExample, csvTemplate, jsonExample, jsonTemplate } from '@/lib/meme-party/import-templates'

export const dynamic = 'force-dynamic'

const FILES: Record<string, { body: () => string; type: string }> = {
  'template.csv': { body: csvTemplate, type: 'text/csv; charset=utf-8' },
  'example.csv': { body: csvExample, type: 'text/csv; charset=utf-8' },
  'template.json': { body: jsonTemplate, type: 'application/json; charset=utf-8' },
  'example.json': { body: jsonExample, type: 'application/json; charset=utf-8' },
  'guide.txt': { body: () => CSV_GUIDE, type: 'text/plain; charset=utf-8' },
}

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const file = FILES[params.name]
  if (!file) return fail('Không có template này', 404, 'not_found')
  return new NextResponse(file.body(), {
    headers: { 'content-type': file.type, 'content-disposition': `attachment; filename="meme-party-${params.name}"` },
  })
}
