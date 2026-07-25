'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getMostRecentTool } from '@/lib/tool-history'

// Opening the app once per tab session jumps straight into whichever tool
// was last used instead of the tool picker — but only if that visit is
// still "fresh": if more than this many hours have passed since the last
// visit, the user has clearly moved on, so land on the picker instead of
// forcing them back into a stale tool. Configurable per-deploy via Vercel
// env (e.g. a longer window for a personal daily-driver deploy).
const DEFAULT_AUTO_ENTER_HOURS = 3
const AUTO_ENTER_HOURS = (() => {
  const parsed = Number(process.env.NEXT_PUBLIC_LAST_TOOL_AUTO_ENTER_HOURS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AUTO_ENTER_HOURS
})()

// A session flag makes sure the explicit "Back" link inside ToolShell still
// works — after the first redirect, returning to "/" in the same tab stays
// on the picker.
const REDIRECTED_KEY = 'wv-last-tool-redirected'

export function LastToolRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (sessionStorage.getItem(REDIRECTED_KEY)) return
    sessionStorage.setItem(REDIRECTED_KEY, '1')

    const mostRecent = getMostRecentTool()
    if (!mostRecent || mostRecent.path === '/') return

    const hoursSinceVisit = (Date.now() - mostRecent.visitedAt) / (1000 * 60 * 60)
    if (hoursSinceVisit <= AUTO_ENTER_HOURS) router.replace(mostRecent.path)
  }, [router])

  return null
}
