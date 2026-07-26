import { NextRequest, NextResponse } from 'next/server'

const AGNES_ENDPOINT = 'https://apihub.agnes-ai.com/v1/images/generations'
const VALID_MODELS = ['agnes-image-2.0-flash', 'agnes-image-2.1-flash'] as const
type AgnesModel = typeof VALID_MODELS[number]
const VALID_SIZES = ['512x512', '1024x1024', '1024x1792', '1792x1024'] as const
type AgnesSize = typeof VALID_SIZES[number]

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { prompt, model = 'agnes-image-2.0-flash', size = '1024x1024', apiKey, referenceImage } = body

  const key = (typeof apiKey === 'string' && apiKey.trim()) || process.env.AGNES_AI_API_KEY
  if (!key) {
    return NextResponse.json({ result: null, error: 'No Agnes AI API key configured' }, { status: 500 })
  }
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return NextResponse.json({ result: null, error: 'prompt is required' }, { status: 400 })
  }
  if (!VALID_MODELS.includes(model as AgnesModel)) {
    return NextResponse.json({ result: null, error: 'invalid model' }, { status: 400 })
  }
  if (!VALID_SIZES.includes(size as AgnesSize)) {
    return NextResponse.json({ result: null, error: 'invalid size' }, { status: 400 })
  }

  const requestBody: Record<string, unknown> = { model, prompt, n: 1, size }
  if (typeof referenceImage === 'string' && referenceImage.trim()) {
    requestBody.extra_body = { image: referenceImage.trim() }
  }

  let upstream: Response
  try {
    upstream = await fetch(AGNES_ENDPOINT, {
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
  const image = data?.data?.[0]
  const imageUrl: string | undefined = image?.url ?? (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : undefined)

  if (!imageUrl) {
    return NextResponse.json({ result: null, error: 'Agnes AI returned no image' }, { status: 502 })
  }

  return NextResponse.json({ result: imageUrl, error: null })
}
