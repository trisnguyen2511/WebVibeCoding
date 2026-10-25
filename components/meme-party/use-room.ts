'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, sendCommand } from '@/lib/meme-party/client'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import type { Command, RoomView } from '@/lib/meme-party/types'

const POLL_MS = 1500

/**
 * Keeps an authoritative RoomView in sync. Polling is the source of truth;
 * Supabase broadcast (when configured) only nudges clients to refetch
 * immediately and never carries game data. Older versions are ignored.
 */
export function useRoom(code: string | null, token: string | null) {
  const [view, setView] = useState<RoomView | null>(null)
  const [online, setOnline] = useState(true)
  const [fatal, setFatal] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const versionRef = useRef(0)
  const fetching = useRef(false)

  const refresh = useCallback(async () => {
    if (!code || fetching.current) return
    fetching.current = true
    const res = await api<{ unchanged: boolean; view?: RoomView }>(
      `/api/meme-party/rooms/${code}/state?since=${versionRef.current}&lite=1`,
      { token },
    )
    fetching.current = false
    if (!res.ok) {
      if (res.code === 'network') setOnline(false)
      else if (res.status === 403 || res.status === 404) setFatal(res.error)
      return
    }
    setOnline(true)
    const next = res.result.view
    if (next && next.stateVersion >= versionRef.current) {
      versionRef.current = next.stateVersion
      setView(next)
    }
  }, [code, token])

  useEffect(() => {
    if (!code || fatal) return
    refresh()
    const id = setInterval(refresh, POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refresh)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
    }
  }, [code, fatal, refresh])

  useEffect(() => {
    if (!code || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return
    try {
      const channel = getSupabaseBrowser().channel(`meme-party-${code}`)
      channel.on('broadcast', { event: 'changed' }, () => refresh()).subscribe()
      return () => {
        channel.unsubscribe()
      }
    } catch {
      return undefined
    }
  }, [code, refresh])

  const run = useCallback(
    async (command: Command) => {
      if (!code || !token || pending) return false
      setPending(true)
      setNotice(null)
      const res = await sendCommand(code, token, command)
      setPending(false)
      if (!res.ok) {
        setNotice(res.error)
        await refresh()
        return false
      }
      await refresh()
      try {
        if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
          void getSupabaseBrowser().channel(`meme-party-${code}`).send({ type: 'broadcast', event: 'changed', payload: { v: res.result.stateVersion } })
        }
      } catch {
        // nudge is best-effort
      }
      return true
    },
    [code, token, pending, refresh],
  )

  return { view, online, fatal, pending, notice, setNotice, run, refresh }
}
