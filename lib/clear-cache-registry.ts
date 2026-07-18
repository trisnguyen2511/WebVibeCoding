/**
 * Danh sách các tool có lưu dữ liệu local (localStorage) và các key liên quan
 * — dùng cho tính năng "Xoá cache" trong Cài đặt để xoá đúng 1 tool mà không
 * đụng tới dữ liệu của tool khác.
 */
export interface CacheEntry {
  slug: string
  label: string
  /** Key chính xác hoặc tiền tố (kết thúc bằng '-') để match nhiều key cùng lúc. */
  keys: string[]
}

export const CLEARABLE_CACHES: CacheEntry[] = [
  { slug: 'werewolf-gm', label: 'Werewolf GM — ván đang chơi', keys: ['wv-werewolf-gm-state'] },
  { slug: 'markdown-editor', label: 'Markdown Editor — nội dung đã lưu', keys: ['wv-markdown-content'] },
  { slug: 'pomodoro', label: 'Pomodoro — danh sách việc cần làm', keys: ['wv-pomodoro-tasks'] },
  {
    slug: 'private-chat',
    label: 'Private Chat — phiên đăng nhập & tin nhắn đã cache',
    keys: ['wv-chat-session', 'wv-chat-device-id', 'wv-chat-style', 'wv-chat-oversize-dismissed-at', 'wv-chat-cache-'],
  },
]

function removeMatchingKeys(matchers: string[]) {
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (matchers.some((m) => (m.endsWith('-') ? key.startsWith(m) : key === m))) toRemove.push(key)
  }
  toRemove.forEach((key) => localStorage.removeItem(key))
  return toRemove.length
}

/** Xoá toàn bộ cache local của 1 tool theo slug — trả về số key đã xoá. */
export function clearToolCache(slug: string): number {
  const entry = CLEARABLE_CACHES.find((c) => c.slug === slug)
  if (!entry) return 0
  return removeMatchingKeys(entry.keys)
}
