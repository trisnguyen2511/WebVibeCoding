'use client'
import { useEffect } from 'react'

// next-pwa auto-injects its registration script into `_document.js`, which
// only exists under the Pages Router. This app uses the App Router, so that
// injection never happens and public/sw.js — even though it's built — was
// never actually registered by any browser. Register it manually instead.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('[sw] registration failed', err)
    })
  }, [])

  return null
}
