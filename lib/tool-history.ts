// MRU (most-recently-used) history of visited tool pages, kept in
// localStorage — index 0 is always the most recent visit, index 1 the
// second most recent, etc. Used by LastToolRedirect to jump straight back
// into whichever tool was open, as long as that visit is still "fresh"
// (see NEXT_PUBLIC_LAST_TOOL_AUTO_ENTER_HOURS in last-tool-redirect.tsx).
export const TOOL_HISTORY_KEY = 'wv-tool-history'

const MAX_HISTORY = 20

export type ToolHistoryEntry = { path: string; visitedAt: number }

export function getToolHistory(): ToolHistoryEntry[] {
  try {
    const raw = localStorage.getItem(TOOL_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function recordToolVisit(path: string): void {
  const history = getToolHistory().filter((entry) => entry.path !== path)
  history.unshift({ path, visitedAt: Date.now() })
  localStorage.setItem(TOOL_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
}

export function getMostRecentTool(): ToolHistoryEntry | null {
  return getToolHistory()[0] ?? null
}

function pathToSlug(path: string): string | null {
  const match = path.match(/^\/tools\/([^/]+)/)
  return match ? match[1] : null
}

// MRU order of tool *slugs* (deduped — a tool visited via several of its own
// sub-pages, e.g. /tools/emulator then /tools/emulator/admin, still counts
// as one entry at its most recent position) — used to sort the home page's
// tool grid so the most recently used tool leads.
export function getSlugVisitOrder(): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const entry of getToolHistory()) {
    const slug = pathToSlug(entry.path)
    if (slug && !seen.has(slug)) {
      seen.add(slug)
      order.push(slug)
    }
  }
  return order
}
