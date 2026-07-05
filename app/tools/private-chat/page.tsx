'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ToolShell } from '@/components/tool-shell'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

const SESSION_KEY = 'wv-chat-session'
const DEVICE_KEY = 'wv-chat-device-id'

type Session = { pin: string; roomId: string; roomName: string; nickname: string; roomType: 'group' | 'solo' }
type ChatMessage = {
  id: string
  device_id: string
  nickname: string
  content: string | null
  image_url?: string | null
  text_color?: string | null
  font_family?: string | null
  bold?: boolean
  italic?: boolean
  created_at: string
}

type FontId = 'sans' | 'display' | 'mono' | 'cursive'
type MessageStyle = { color: string | null; font: FontId | null; bold: boolean; italic: boolean }

const STYLE_KEY = 'wv-chat-style'
const DEFAULT_STYLE: MessageStyle = { color: null, font: null, bold: false, italic: false }

const COLOR_PRESETS = ['#FAFAFA', '#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6']
const FONT_OPTIONS: { id: FontId; label: string; style: React.CSSProperties }[] = [
  { id: 'sans', label: 'Mặc định', style: {} },
  { id: 'display', label: 'Tiêu đề', style: { fontFamily: 'var(--font-space-grotesk), sans-serif' } },
  { id: 'mono', label: 'Mono', style: { fontFamily: 'var(--font-jetbrains-mono), monospace' } },
  { id: 'cursive', label: 'Viết tay', style: { fontFamily: 'cursive' } },
]

function fontStyleFor(font?: string | null): React.CSSProperties {
  return FONT_OPTIONS.find((f) => f.id === font)?.style ?? {}
}

function loadSavedStyle(): MessageStyle {
  try {
    const raw = localStorage.getItem(STYLE_KEY)
    if (!raw) return DEFAULT_STYLE
    return { ...DEFAULT_STYLE, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_STYLE
  }
}

const MAX_IMAGE_DIMENSION = 1600
const IMAGE_QUALITY = 0.75

function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        let { width, height } = img
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          const scale = MAX_IMAGE_DIMENSION / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas unsupported')); return }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

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
        roomType: data.roomType === 'solo' ? 'solo' : 'group',
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
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [imageError, setImageError] = useState('')
  const [style, setStyle] = useState<MessageStyle>(DEFAULT_STYLE)
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const deviceId = useRef(getDeviceId())
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialLoadDone = useRef(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowser>['channel']> | null>(null)
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const lastTypingSentRef = useRef(0)

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
    setStyle(loadSavedStyle())
  }, [])

  const updateStyle = (patch: Partial<MessageStyle>) => {
    setStyle((prev) => {
      const next = { ...prev, ...patch }
      localStorage.setItem(STYLE_KEY, JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    subscribeToPush(session.roomId, deviceId.current)
  }, [session.roomId])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    const channel = supabase.channel(`chat-room-${session.roomId}`)
    channel.on('broadcast', { event: 'message' }, (payload) => {
      setMessages((prev) => [...prev, payload.payload as ChatMessage])
    })
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const { deviceId: typingDeviceId, nickname } = payload.payload as { deviceId: string; nickname: string }
      if (typingDeviceId === deviceId.current) return
      const timers = typingTimersRef.current
      const existing = timers.get(typingDeviceId)
      if (existing) clearTimeout(existing)
      setTypingUsers((prev) => new Map(prev).set(typingDeviceId, nickname))
      timers.set(
        typingDeviceId,
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Map(prev)
            next.delete(typingDeviceId)
            return next
          })
          timers.delete(typingDeviceId)
        }, 3000)
      )
    })
    channel.subscribe()
    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      typingTimersRef.current.forEach(clearTimeout)
      typingTimersRef.current.clear()
      setTypingUsers(new Map())
    }
  }, [session.roomId])

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null
  const lastMessageIdRef = useRef<string | null>(null)
  const hasScrolledOnceRef = useRef(false)
  useEffect(() => {
    if (!initialLoadDone.current) return
    // Only autoscroll when a new message lands at the bottom — not when older
    // messages are prepended by scroll-up pagination.
    if (lastMessageId !== lastMessageIdRef.current) {
      const isFirstScroll = !hasScrolledOnceRef.current
      hasScrolledOnceRef.current = true
      // Jump instantly on the very first render (layout may still be settling),
      // then use a smooth scroll for every message that arrives after that.
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: isFirstScroll ? 'auto' : 'smooth' })
      })
    }
    lastMessageIdRef.current = lastMessageId
  }, [lastMessageId])

  const send = useCallback(async () => {
    const content = input.trim()
    if (!content && !pendingImage) return
    setSending(true)
    setInput('')
    const imageToSend = pendingImage
    setPendingImage(null)
    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: session.roomId,
          deviceId: deviceId.current,
          content,
          image: imageToSend ? { dataUrl: imageToSend.dataUrl } : undefined,
          style: { color: style.color, font: style.font, bold: style.bold, italic: style.italic },
        }),
      })
    } finally {
      setSending(false)
    }
  }, [input, pendingImage, style, session.roomId])

  const handleInputChange = (value: string) => {
    setInput(value)
    const now = Date.now()
    if (now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now
      channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { deviceId: deviceId.current, nickname: session.nickname },
      })
    }
  }

  const pickImage = () => fileInputRef.current?.click()

  const onImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImageError('')
    try {
      const dataUrl = await compressImageToDataUrl(file)
      setPendingImage({ dataUrl })
    } catch {
      setImageError('Không đọc được ảnh này — thử ảnh khác nhé')
    }
  }

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
          if (m.device_id === 'system') {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="max-w-[90%] rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-center text-xs text-amber-400">
                  {m.content}
                </span>
              </div>
            )
          }
          // Solo rooms have no "other person" — every bubble is treated as
          // the reader's own, regardless of which device actually sent it.
          const mine = session.roomType === 'solo' || m.device_id === deviceId.current
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {!mine && <span className="mb-0.5 text-[10px] text-muted">{m.nickname}</span>}
              {m.image_url && (
                <a href={m.image_url} target="_blank" rel="noreferrer" className="mb-1 block max-w-[75%]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.image_url} alt="" className="max-h-64 rounded-xl border border-border object-cover" />
                </a>
              )}
              {m.content && (
                <span
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine ? 'bg-accent text-white' : 'bg-background border border-border text-white'
                  }`}
                  style={{
                    ...fontStyleFor(m.font_family),
                    color: m.text_color ?? undefined,
                    fontWeight: m.bold ? 700 : undefined,
                    fontStyle: m.italic ? 'italic' : undefined,
                  }}
                >
                  {m.content}
                </span>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      {pendingImage && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage.dataUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
          <span className="flex-1 text-xs text-muted">Ảnh sẽ được gửi kèm tin nhắn</span>
          <button onClick={() => setPendingImage(null)} className="text-xs text-muted hover:text-white">✕</button>
        </div>
      )}
      {imageError && <p className="mt-2 text-xs text-red-400">{imageError}</p>}
      {typingUsers.size > 0 && (
        <p className="mt-2 text-xs italic text-muted">
          {Array.from(typingUsers.values()).join(', ')} đang nhập...
        </p>
      )}

      {showStylePicker && (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-muted">Màu chữ</span>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateStyle({ color: c === COLOR_PRESETS[0] ? null : c })}
                  title={c}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${
                    (style.color ?? COLOR_PRESETS[0]) === c ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-muted">Font chữ</span>
            <div className="flex flex-wrap gap-1.5">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => updateStyle({ font: f.id === 'sans' ? null : f.id })}
                  style={f.style}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    (style.font ?? 'sans') === f.id
                      ? 'border-accent bg-accent/20 text-accent-soft'
                      : 'border-border bg-background text-muted hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-muted">Kiểu chữ</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => updateStyle({ bold: !style.bold })}
                className={`h-7 w-7 rounded-lg border font-bold text-xs transition-colors ${
                  style.bold ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border bg-background text-muted hover:text-white'
                }`}
              >
                B
              </button>
              <button
                onClick={() => updateStyle({ italic: !style.italic })}
                className={`h-7 w-7 rounded-lg border text-xs italic transition-colors ${
                  style.italic ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border bg-background text-muted hover:text-white'
                }`}
              >
                I
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageSelected} className="hidden" />
        <button
          onClick={pickImage}
          title="Gửi ảnh"
          className="rounded-xl border border-border bg-surface px-3 py-2.5 text-muted hover:text-white transition-colors"
        >
          🖼️
        </button>
        <button
          onClick={() => setShowStylePicker((v) => !v)}
          title="Tùy chỉnh kiểu chữ"
          className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${
            showStylePicker ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border bg-surface text-muted hover:text-white'
          }`}
        >
          Aa
        </button>
        <input
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          placeholder="Nhắn gì đó..."
          style={{
            ...fontStyleFor(style.font),
            color: style.color ?? undefined,
            fontWeight: style.bold ? 700 : undefined,
            fontStyle: style.italic ? 'italic' : undefined,
          }}
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none placeholder-muted focus:border-accent"
        />
        <button
          onClick={send}
          disabled={sending || (!input.trim() && !pendingImage)}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
        >
          {sending ? '...' : 'Gửi'}
        </button>
      </div>
    </div>
  )
}

export default function PrivateChatPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) { setSession(null); return }
    const parsed = JSON.parse(raw)
    setSession({ roomType: 'group', ...parsed })
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
