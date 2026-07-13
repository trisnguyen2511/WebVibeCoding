export type LinkPreview = {
  url: string
  title: string
  description: string | null
  image: string | null
  siteName: string | null
}

const FETCH_TIMEOUT_MS = 4000
const MAX_HTML_BYTES = 500_000

function extractMeta(html: string, ...keys: string[]): string | null {
  for (const key of keys) {
    // Matches <meta property="og:title" content="..."> in either attribute order.
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i')
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, 'i')
    const match = html.match(re1) || html.match(re2)
    if (match) return match[1]
  }
  return null
}

// Only ever called server-side, best-effort — a failed/slow fetch must never
// block or fail the message send it's attached to.
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebVibeLinkPreview/1.0)' },
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return null

    const reader = res.body?.getReader()
    let html = ''
    if (reader) {
      const decoder = new TextDecoder()
      while (html.length < MAX_HTML_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        html += decoder.decode(value, { stream: true })
      }
      reader.cancel().catch(() => {})
    } else {
      html = await res.text()
    }

    const title = extractMeta(html, 'og:title') || html.match(/<title>([^<]*)<\/title>/i)?.[1] || url.hostname
    const description = extractMeta(html, 'og:description', 'description')
    const image = extractMeta(html, 'og:image')
    const siteName = extractMeta(html, 'og:site_name') || url.hostname

    return {
      url: url.toString(),
      title: title.trim().slice(0, 200),
      description: description ? description.trim().slice(0, 300) : null,
      image: image ? new URL(image, url).toString() : null,
      siteName,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const URL_RE = /https?:\/\/[^\s]+/i

export function findFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(URL_RE)
  return match ? match[0].replace(/[),.!?]+$/, '') : null
}
