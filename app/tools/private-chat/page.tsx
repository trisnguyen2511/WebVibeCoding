'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ToolShell } from '@/components/tool-shell'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

const SESSION_KEY = 'wv-chat-session'
const DEVICE_KEY = 'wv-chat-device-id'

type Session = { pin: string; roomId: string; roomName: string; nickname: string }
type ChatMessage = { id: string; device_id: string; nickname: string; content: string; created_at: string }

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const bytes = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i)
  return bytes
}

async function subscribeToPush(roomId: string, deviceId: string) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
    }
    await fetch('/api/chat/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, deviceId, subscription }),
    })
  } catch {
    // push not supported/denied — chat still works without it
  }
}

function JoinScreen({ onJoined }: { onJoined: (session: Session) => void }) {
  const [pin, setPin] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [room, setRoom] = useState<{ name: string; type: 'group' | 'solo' } | null>(null)

  const doJoin = async (pinValue: string, nicknameValue: string) => {
    setLoading(true)
    setError('')
    try {
      const deviceId = getDeviceId()
      const res = await fetch('/api/chat/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinValue, deviceId, nickname: nicknameValue.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      const session: Session = {
        pin: pinValue,
        roomId: data.roomId,
        roomName: data.roomName,
        nickname: nicknameValue.trim() || 'my pal',
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      onJoined(session)
    } catch {
      setError('Lỗi kết nối — thử lại nhé')
    } finally {
      setLoading(false)
    }
  }

  const checkPin = async () => {
    if (!pin.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/chat/room-info?pin=${pin.trim()}`)
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      if (data.type === 'solo') {
        // Solo rooms skip the nickname screen entirely — join immediately.
        await doJoin(pin.trim(), '')
        return
      }
      setRoom({ name: data.name, type: data.type })
    } catch {
      setError('Lỗi kết nối — thử lại nhé')
    } finally {
      setLoading(false)
    }
  }

  const join = () => {
    if (!room) return
    if (!nickname.trim()) return
    doJoin(pin.trim(), nickname)
  }

  if (!room) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <p className="text-center text-sm text-muted">Nhập mã PIN của đoạn chat để tham gia</p>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') checkPin() }}
          inputMode="numeric"
          placeholder="PIN code"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-center font-mono text-lg tracking-widest text-white outline-none placeholder-muted focus:border-accent"
        />
        {error && <p className="text-center text-xs text-red-400">{error}</p>}
        <button
          onClick={checkPin}
          disabled={loading || !pin.trim()}
          className="w-full rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
        >
          {loading ? 'Đang kiểm tra...' : 'Tiếp tục'}
        </button>
        <p className="text-center text-xs text-muted">
          <Link href="/tools/private-chat/admin" className="hover:text-accent-soft">Quản lý phòng (admin)</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <p className="text-center text-sm text-muted">
        Vào phòng <span className="text-white">{room.name}</span>
      </p>
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') join() }}
        placeholder="Tên hiển thị của bạn"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-white outline-none placeholder-muted focus:border-accent"
      />
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
      <button
        onClick={join}
        disabled={loading || !nickname.trim()}
        className="w-full rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
      >
        {loading ? 'Đang vào...' : 'Vào đoạn chat'}
      </button>
      <button onClick={() => { setRoom(null); setError('') }} className="w-full text-center text-xs text-muted hover:text-white">
        ← Nhập PIN khác
      </button>
    </div>
  )
}

function ChatScreen({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const deviceId = useRef(getDeviceId())
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const initialLoadDone = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/chat/messages?roomId=${session.roomId}&deviceId=${deviceId.current}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.messages) return
        setMessages(data.messages)
        setHasMore(Boolean(data.hasMore))
        initialLoadDone.current = true
      })
    return () => { cancelled = true }
  }, [session.roomId])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    const container = scrollRef.current
    const prevHeight = container?.scrollHeight ?? 0
    try {
      const oldest = messages[0].created_at
      const res = await fetch(
        `/api/chat/messages?roomId=${session.roomId}&deviceId=${deviceId.current}&before=${encodeURIComponent(oldest)}`
      )
      const data = await res.json()
      if (data.messages?.length) {
        setMessages((prev) => [...data.messages, ...prev])
        setHasMore(Boolean(data.hasMore))
        requestAnimationFrame(() => {
          if (container) container.scrollTop = container.scrollHeight - prevHeight
        })
      } else {
        setHasMore(false)
      }
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, messages, session.roomId])

  const onScroll = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    if (container.scrollTop < 80) loadMore()
  }, [loadMore])

  useEffect(() => {
    subscribeToPush(session.roomId, deviceId.current)
  }, [session.roomId])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    const channel = supabase.channel(`chat-room-${session.roomId}`)
    channel.on('broadcast', { event: 'message' }, (payload) => {
      setMessages((prev) => [...prev, payload.payload as ChatMessage])
    })
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session.roomId])

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null
  const lastMessageIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initialLoadDone.current) return
    // Only autoscroll when a new message lands at the bottom — not when older
    // messages are prepended by scroll-up pagination.
    if (lastMessageId !== lastMessageIdRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    lastMessageIdRef.current = lastMessageId
  }, [lastMessageId])

  const send = useCallback(async () => {
    const content = input.trim()
    if (!content) return
    setInput('')
    await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, deviceId: deviceId.current, content }),
    })
  }, [input, session.roomId])

  const leave = () => {
    localStorage.removeItem(SESSION_KEY)
    onLeave()
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col" style={{ height: '70vh' }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display font-semibold text-white">{session.roomName}</p>
        <button onClick={leave} className="text-xs text-muted hover:text-white">Rời phòng</button>
      </div>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-2 overflow-y-auto rounded-xl border border-border bg-surface p-4">
        {loadingMore && <p className="text-center text-xs text-muted">Đang tải tin nhắn cũ...</p>}
        {messages.map((m) => {
          const mine = m.device_id === deviceId.current
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {!mine && <span className="mb-0.5 text-[10px] text-muted">{m.nickname}</span>}
              <span
                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                  mine ? 'bg-accent text-white' : 'bg-background border border-border text-white'
                }`}
              >
                {m.content}
              </span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          placeholder="Nhắn gì đó..."
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none placeholder-muted focus:border-accent"
        />
        <button onClick={send} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent/80">
          Gửi
        </button>
      </div>
    </div>
  )
}

export default function PrivateChatPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY)
    setSession(raw ? JSON.parse(raw) : null)
  }, [])

  return (
    <ToolShell name="Private Chat" icon="💬" description="Đoạn chat riêng tư bằng mã PIN">
      {session === undefined ? null : session ? (
        <ChatScreen session={session} onLeave={() => setSession(null)} />
      ) : (
        <JoinScreen onJoined={setSession} />
      )}
    </ToolShell>
  )
}
