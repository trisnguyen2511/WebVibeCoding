import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return Response.json({ title: '' }, { status: 400 })

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebVibeCoding/1.0; +https://webvibecoding.vercel.app)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return Response.json({ title: '' })
    const html = await res.text()
    const ogTitle   = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"'<>]+)["']/i)?.[1]
                   ?? html.match(/<meta[^>]+content=["']([^"'<>]+)["'][^>]+property=["']og:title["']/i)?.[1]
    const titleTag  = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
    const title = (ogTitle ?? titleTag ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))).trim().slice(0, 120)
    return Response.json({ title })
  } catch {
    return Response.json({ title: '' })
  }
}
