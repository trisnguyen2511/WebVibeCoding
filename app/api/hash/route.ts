import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

const VALID_ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512'] as const
type Algorithm = typeof VALID_ALGORITHMS[number]

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { text, algorithm } = body

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ result: null, error: 'text is required' }, { status: 400 })
  }
  if (!VALID_ALGORITHMS.includes(algorithm as Algorithm)) {
    return NextResponse.json({ result: null, error: 'invalid algorithm' }, { status: 400 })
  }

  const result = createHash(algorithm).update(text, 'utf8').digest('hex')
  return NextResponse.json({ result, error: null })
}
