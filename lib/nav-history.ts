// In-app navigation stack for the current tab, kept in sessionStorage so it
// survives reloads (just like the browser's own history does).
//
// Why: `router.back()` alone is not a safe "Back" button —
//   • Deep link / new tab / shared URL → there is no previous in-app page, so
//     back() either does nothing or throws the user out to another site.
//   • A `router.replace()` (e.g. the auto-enter-last-tool redirect) removes the
//     previous entry, so back() skips past the app entirely.
// The stack lets the Back button know whether the previous history entry is
// really one of our pages; if not, it navigates "up" to the parent route.

export const NAV_STACK_KEY = 'wv-nav-stack'
const MAX_STACK = 50

function read(): string[] {
  try {
    const raw = sessionStorage.getItem(NAV_STACK_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

function write(stack: string[]): void {
  try {
    sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack.slice(-MAX_STACK)))
  } catch {
    /* storage unavailable (private mode / quota) — Back falls back to parent */
  }
}

export function getNavStack(): string[] {
  return read()
}

/**
 * Pure reducer: given the current stack and the path the tab just landed on,
 * return the new stack. A visit to the entry right below the top is treated
 * as a "back" (pop) — covers both our Back button and the browser/OS back
 * gesture. Same path as the top (reload, query-only change) is a no-op.
 */
export function reduceNavStack(stack: string[], path: string): string[] {
  const top = stack[stack.length - 1]
  if (top === path) return stack
  if (stack.length >= 2 && stack[stack.length - 2] === path) return stack.slice(0, -1)
  return [...stack, path]
}

// First page of the current document load + how many client-side navigations
// happened since. Module state (not storage) on purpose: it describes this
// page load only.
let documentEntryPath: string | null = null
let clientNavigations = 0

export function recordNavigation(path: string): void {
  const stack = read()
  if (stack[stack.length - 1] !== path) clientNavigations++
  write(reduceNavStack(stack, path))
}

export type DocumentNavigationType = 'navigate' | 'reload' | 'back_forward' | 'prerender' | string

/**
 * First page of a full document load. A fresh 'navigate' load (typed URL,
 * shared link, bookmark, link from another site) means the browser entry
 * before this one is NOT ours, even if this tab's sessionStorage still holds an
 * older stack — so start over. Reload / back_forward keep the stack, because
 * the browser history around this entry is unchanged.
 */
export function reduceOnDocumentLoad(stack: string[], path: string, navType: DocumentNavigationType): string[] {
  if (navType === 'reload' || navType === 'back_forward') return reduceNavStack(stack, path)
  return [path]
}

export function startNavSession(path: string): void {
  let navType: DocumentNavigationType = 'navigate'
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (entry?.type) navType = entry.type
  } catch {
    /* old browser — treat as fresh entry */
  }
  documentEntryPath = path
  clientNavigations = 0
  write(reduceOnDocumentLoad(read(), path, navType))
}

/** Replace the top of the stack — use right before a `router.replace()`. */
export function replaceTopNavigation(path: string): void {
  clientNavigations++
  const stack = read()
  write(stack.length ? [...stack.slice(0, -1), path] : [path])
}

/** The in-app page the user came from, or null if they entered on this page. */
export function getPreviousInAppPath(currentPath: string): string | null {
  const stack = read()
  if (stack.length < 2) return null
  // Tracker may not have recorded the current page yet (child effects run
  // before the layout's), so accept either "current is top" or "not yet pushed".
  if (stack[stack.length - 1] === currentPath) return stack[stack.length - 2]
  return null
}

/**
 * "Up" target used when there is no in-app history:
 *   /tools/timeline/abc        → /tools/timeline
 *   /tools/games/x/controller  → /tools/games/x
 *   /tools/hash                → /
 *   /settings                  → /
 */
export function getParentPath(path: string): string {
  const segments = path.split('?')[0].split('/').filter(Boolean)
  if (segments.length <= 2) return '/'
  return '/' + segments.slice(0, -1).join('/')
}

/**
 * True only when `path` is the page this document was loaded on and the user
 * has not navigated anywhere yet — i.e. they opened the app at `path`
 * directly, not arrived there via a Back button / link inside the app.
 */
export function isEntryPage(path: string): boolean {
  if (documentEntryPath !== null) return documentEntryPath === path && clientNavigations === 0
  const stack = read()
  return stack.length === 0 || (stack.length === 1 && stack[0] === path)
}

/** Test helper — resets the per-document module state. */
export function __resetDocumentStateForTests(): void {
  documentEntryPath = null
  clientNavigations = 0
}
