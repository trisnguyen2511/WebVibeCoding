'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { recordNavigation, startNavSession } from '@/lib/nav-history'

// Mounted once in the root layout — records every in-app page change into
// the per-tab navigation stack used by the Back buttons (see nav-history.ts).
// Rendered before {children} so its effect runs before page effects
// (e.g. LastToolRedirect reads the stack on the first load).
export function NavTracker() {
  const pathname = usePathname()
  const started = useRef(false)
  useEffect(() => {
    if (!pathname) return
    if (!started.current) {
      started.current = true
      startNavSession(pathname)
      return
    }
    recordNavigation(pathname)
  }, [pathname])
  return null
}
