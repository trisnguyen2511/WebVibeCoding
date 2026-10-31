/** Static (no network) checks for a direct image URL. The browser probes actual loading. */
export interface UrlCheck {
  ok: boolean
  url: string
  reason?: string
  /** Soft warning, e.g. the path does not look like an image file. */
  warning?: string
}

const IMAGE_EXT = /\.(jpe?g|png|webp)(?:$|[?#])/i

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

export function checkImageUrl(raw: string): UrlCheck {
  const value = raw.trim()
  if (!value) return { ok: false, url: value, reason: 'URL trống' }
  if (value.length > 2048) return { ok: false, url: value, reason: 'URL quá dài' }
  // Root-relative paths are allowed for assets shipped with the app (starter pack, managed storage).
  if (value.startsWith('/') && !value.startsWith('//')) {
    return /\.(jpe?g|png|webp|svg)$/i.test(value) || value.startsWith('/api/meme-party/file/')
      ? { ok: true, url: value }
      : { ok: false, url: value, reason: 'Đường dẫn nội bộ không trỏ tới file ảnh' }
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, url: value, reason: 'URL không hợp lệ' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, url: value, reason: 'Chỉ chấp nhận http hoặc https' }
  }
  if (parsed.username || parsed.password) return { ok: false, url: value, reason: 'URL không được chứa tài khoản/mật khẩu' }
  if (isPrivateHost(parsed.hostname)) return { ok: false, url: value, reason: 'Không chấp nhận địa chỉ nội bộ' }
  const warning = IMAGE_EXT.test(parsed.pathname + parsed.search) ? undefined : 'Đường dẫn không có đuôi ảnh — có thể là trang web chứ không phải link ảnh trực tiếp'
  return { ok: true, url: parsed.toString(), warning }
}
