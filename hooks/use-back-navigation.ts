'use client'
import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getParentPath, getPreviousInAppPath, replaceTopNavigation } from '@/lib/nav-history'

/**
 * Safe Back/Up navigation for every page.
 *
 * goBack():
 *   – came from another page of this app → real history back (keeps scroll
 *     position & state, same as the browser back gesture)
 *   – deep link / new tab / after a replace-redirect → go "up" to the parent
 *     route (or `fallback`) with replace, so browser-back afterwards does not
 *     bounce the user back into the page they just left.
 *
 * goUp(target): for explicit "← Projects" / "← Về game" style links — if
 * `target` is literally the previous page, pop history instead of pushing a
 * duplicate entry (avoids A → B → A → B ping-pong history).
 */
export function useBackNavigation() {
  const router = useRouter()
  const pathname = usePathname() ?? '/'

  const goBack = useCallback((fallback?: string) => {
    if (getPreviousInAppPath(pathname)) {
      router.back()
      return
    }
    const target = fallback ?? getParentPath(pathname)
    replaceTopNavigation(target)
    router.replace(target)
  }, [pathname, router])

  const goUp = useCallback((target: string) => {
    if (getPreviousInAppPath(pathname) === target) router.back()
    else router.push(target)
  }, [pathname, router])

  return { goBack, goUp, parentPath: getParentPath(pathname) }
}
