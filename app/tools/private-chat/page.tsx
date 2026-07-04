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

  const join = async () => {
    if (!pin.trim() || !nickname.trim()) return
    setLoading(true)
    setError('')
    try {
      const deviceId = getDeviceId()
      const res = await fetch('/api/chat/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim(), deviceId, nickname: nickname.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      const session: Session = { pin: pin.trim(), roomId: data.roomId, roomName: data.roomName, nickname: nickname.trim() }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      onJoined(session)
    } catch {
      setError('Lỗi kết nối — thử lại nhé')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <p className="text-center text-sm text-muted">Nhập mã PIN của đoạn chat để tham gia</p>
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        inputMode="numeric"
        placeholder="PIN code"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-center font-mono text-lg tracking-widest text-white outline-none placeholder-muted focus:border-accent"
      />
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Tên hiển thị của bạn"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-white outline-none placeholder-muted focus:border-accent"
      />
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
      <button
        onClick={join}
        disabled={loading || !pin.trim() || !nickname.trim()}
        className="w-full rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
      >
        {loading ? 'Đang vào...' : 'Vào đoạn chat'}
      </button>
      <p className="text-center text-xs text-muted">
        <Link href="/tools/private-chat/admin" className="hover:text-accent-soft">Quản lý phòng (admin)</Link>
      </p>
    </div>
  )
}

function ChatScreen({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const deviceId = useRef(getDeviceId())
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/chat/messages?roomId=${session.roomId}&deviceId=${deviceId.current}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.messages) setMessages(data.messages)
      })
    return () => { cancelled = true }
  }, [session.roomId])

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      <div className="flex-1 space-y-2 overflow-y-auto rounded-xl border border-border bg-surface p-4">
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
