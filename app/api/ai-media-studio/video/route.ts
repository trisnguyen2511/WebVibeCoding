import { NextRequest, NextResponse } from 'next/server'

const AGNES_VIDEO_ENDPOINT = 'https://apihub.agnes-ai.com/v1/videos'
const MODEL = 'agnes-video-v2.0'
const VALID_SIZES = ['1280x720', '720x1280', '1024x1024'] as const
type VideoSize = typeof VALID_SIZES[number]

function resolveKey(body: { apiKey?: unknown }) {
  return (typeof body.apiKey === 'string' && body.apiKey.trim()) || process.env.AGNES_AI_API_KEY
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { prompt, size = '1280x720', referenceImage, apiKey } = body

  const key = resolveKey({ apiKey })
  if (!key) {
    return NextResponse.json({ result: null, error: 'No Agnes AI API key configured' }, { status: 500 })
  }
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return NextResponse.json({ result: null, error: 'prompt is required' }, { status: 400 })
  }
  if (!VALID_SIZES.includes(size as VideoSize)) {
    return NextResponse.json({ result: null, error: 'invalid size' }, { status: 400 })
  }

  const [width, height] = (size as VideoSize).split('x').map(Number)
  const requestBody: Record<string, unknown> = { model: MODEL, prompt, width, height }
  if (typeof referenceImage === 'string' && referenceImage.trim()) {
    requestBody.extra_body = { image: referenceImage.trim() }
  }

  let upstream: Response
  try {
    upstream = await fetch(AGNES_VIDEO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(requestBody),
    })
  } catch {
    return NextResponse.json({ result: null, error: 'Failed to reach Agnes AI' }, { status: 502 })
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return NextResponse.json({ result: null, error: `Agnes AI error (${upstream.status}): ${text.slice(0, 300)}` }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null)
  const taskId: string | undefined = data?.id ?? data?.video_id ?? data?.task_id

  if (!taskId) {
    return NextResponse.json({ result: null, error: 'Agnes AI returned no task id' }, { status: 502 })
  }

  return NextResponse.json({ result: { taskId }, error: null })
}

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId')
  const apiKeyParam = req.nextUrl.searchParams.get('apiKey')

  const key = resolveKey({ apiKey: apiKeyParam })
  if (!key) {
    return NextResponse.json({ result: null, error: 'No Agnes AI API key configured' }, { status: 500 })
  }
  if (!taskId) {
    return NextResponse.json({ result: null, error: 'taskId is required' }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${AGNES_VIDEO_ENDPOINT}/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
  } catch {
    return NextResponse.json({ result: null, error: 'Failed to reach Agnes AI' }, { status: 502 })
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return NextResponse.json({ result: null, error: `Agnes AI error (${upstream.status}): ${text.slice(0, 300)}` }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null)
  const status: string = data?.status ?? 'unknown'
  const videoUrl: string | undefined = data?.video?.url ?? data?.url

  return NextResponse.json({ result: { status, videoUrl: videoUrl ?? null }, error: null })
}
