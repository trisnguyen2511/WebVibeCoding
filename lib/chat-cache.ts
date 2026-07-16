// Local cache of a room's most recent messages, used so re-opening the chat
// can render instantly instead of waiting on a network round-trip. The
// server is still always queried on load (for anything newer than the cache)
// — this is a fast-first-paint layer, not a replacement for sync.

const CACHE_PREFIX = 'wv-chat-cache-'
export const CACHE_MAX_MESSAGES = 100

type Cacheable = { id: string; created_at: string; pending?: boolean; failed?: boolean }

export function loadCachedMessages<T extends Cacheable>(roomId: string): T[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + roomId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as T[]) : null
  } catch {
    return null
  }
}

export function saveCachedMessages<T extends Cacheable>(roomId: string, messages: T[]): void {
  try {
    // Never persist in-flight/optimistic messages — if the app closes before
    // they're acknowledged, replaying them from cache on next load would show
    // a permanently stuck "pending"/"failed" bubble.
    const synced = messages.filter((m) => !m.pending && !m.failed)
    const trimmed = synced.slice(-CACHE_MAX_MESSAGES)
    localStorage.setItem(CACHE_PREFIX + roomId, JSON.stringify(trimmed))
  } catch {
    // best-effort — localStorage may be unavailable (private mode) or full
  }
}
