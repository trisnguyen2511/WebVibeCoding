'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LAST_TOOL_KEY } from '@/components/tool-shell'

// Opening the app once per tab session jumps straight into whichever tool
// was last used instead of the tool picker. A session flag makes sure the
// explicit "Back" link inside ToolShell still works — after that first
// redirect, returning to "/" in the same tab stays on the picker.
const REDIRECTED_KEY = 'wv-last-tool-redirected'

export function LastToolRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (sessionStorage.getItem(REDIRECTED_KEY)) return
    sessionStorage.setItem(REDIRECTED_KEY, '1')
    const lastTool = localStorage.getItem(LAST_TOOL_KEY)
    if (lastTool && lastTool !== '/') router.replace(lastTool)
  }, [router])

  return null
}
