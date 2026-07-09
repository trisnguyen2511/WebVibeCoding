'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { LogOut, Pin, Reply, SmilePlus, Clock, Image as ImageIcon, Type, Send, MessageCircle, BookOpen, X, Plus, Lock } from 'lucide-react'
import { ToolShell } from '@/components/tool-shell'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

const SESSION_KEY = 'wv-chat-session'
const DEVICE_KEY = 'wv-chat-device-id'

type Session = {
  pin: string
  roomId: string
  roomName: string
  nickname: string
  roomType: 'group' | 'solo'
  anniversaryDate?: string | null
}

type Reaction = { device_id: string; emoji: string }
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
  reply_to_id?: string | null
  reply_to_nickname?: string | null
  reply_to_content?: string | null
  reveal_at?: string | null
  locked?: boolean
  chat_message_reactions?: Reaction[]
  created_at: string
  clientId?: string
  pending?: boolean
  failed?: boolean
}

type PinnedMessage = { id: string; device_id: string; nickname: string; content: string | null; image_url?: string | null }

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

const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🎉']

const MOOD_OPTIONS: { id: string; emoji: string; label: string; color: string }[] = [
  { id: 'happy', emoji: '😄', label: 'Vui', color: '#FBBF24' },
  { id: 'love', emoji: '🥰', label: 'Yêu đời', color: '#F472B6' },
  { id: 'calm', emoji: '😌', label: 'Bình yên', color: '#34D399' },
  { id: 'tired', emoji: '😴', label: 'Mệt', color: '#60A5FA' },
  { id: 'sad', emoji: '😢', label: 'Buồn', color: '#818CF8' },
  { id: 'angry', emoji: '😤', label: 'Bực', color: '#F87171' },
]

const GESTURE_OPTIONS: { id: string; emoji: string; label: string }[] = [
  { id: 'hug', emoji: '🤗', label: 'Ôm' },
  { id: 'pat', emoji: '👊', label: 'Đấm lưng' },
  { id: 'wave', emoji: '👋', label: 'Vẫy tay' },
  { id: 'kiss', emoji: '😘', label: 'Hôn' },
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
  if (!publicKey) {
    console.warn('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set at build time — push disabled')
    return
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[push] this browser does not support service workers / Push API')
    return
  }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.warn(`[push] notification permission is "${permission}", not requesting a subscription`)
      return
    }
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      console.log('[push] created new push subscription')
    } else {
      console.log('[push] reusing existing push subscription')
    }
    const res = await fetch('/api/chat/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, deviceId, subscription }),
    })
    if (!res.ok) {
      console.error('[push] failed to save subscription on server', await res.text())
    } else {
      console.log('[push] subscription saved for this room')
    }
  } catch (err) {
    console.error('[push] subscribe flow failed', err)
  }
}

function daysSince(dateStr: string): number {
  const start = new Date(dateStr + 'T00:00:00')
  const diff = Date.now() - start.getTime()
  return Math.max(1, Math.floor(diff / 86400000) + 1)
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatDayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(date, today)) return 'Hôm nay'
  if (sameDay(date, yesterday)) return 'Hôm qua'
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
        anniversaryDate: data.anniversaryDate ?? null,
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
      <div className="relative mx-auto w-full max-w-sm">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-accent/[0.18] blur-3xl" />

        <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8 backdrop-blur-xl">
          <div className="mb-7 flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/[0.12] shadow-[0_0_28px_rgba(124,58,237,0.35)]">
              <Lock size={22} className="text-accent-soft" />
            </div>
            <div className="text-center">
              <h2 className="font-display text-xl font-bold text-white">Private Chat</h2>
              <p className="mt-1 text-sm text-muted">Nhập mã PIN để tham gia đoạn chat</p>
            </div>
          </div>

          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') checkPin() }}
            inputMode="numeric"
            placeholder="• • • • • •"
            className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4 text-center font-mono text-2xl tracking-[0.5em] text-white outline-none transition-all placeholder-white/20 focus:border-accent/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-accent/20"
          />

          {error && (
            <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-center text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={checkPin}
            disabled={loading || !pin.trim()}
            className="mt-4 w-full rounded-2xl bg-accent py-3.5 font-display font-semibold text-white shadow-[0_4px_24px_rgba(124,58,237,0.4)] transition-all hover:bg-accent/90 hover:shadow-[0_6px_32px_rgba(124,58,237,0.55)] active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? 'Đang kiểm tra...' : 'Tiếp tục →'}
          </button>

          <p className="mt-5 text-center text-xs text-muted">
            <Link href="/tools/private-chat/admin" className="transition-colors hover:text-accent-soft">
              Quản lý phòng (admin)
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-accent/[0.18] blur-3xl" />

      <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8 backdrop-blur-xl">
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/[0.12] shadow-[0_0_28px_rgba(124,58,237,0.35)]">
            <MessageCircle size={22} className="text-accent-soft" />
          </div>
          <div className="text-center">
            <h2 className="font-display text-xl font-bold text-white">{room.name}</h2>
            <p className="mt-1 text-sm text-muted">Nhập tên hiển thị của bạn</p>
          </div>
        </div>

        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') join() }}
          placeholder="Tên hiển thị"
          className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 text-base text-white outline-none transition-all placeholder-muted focus:border-accent/60 focus:bg-white/[0.06] focus:ring-2 focus:ring-accent/20"
        />

        {error && (
          <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-center text-xs text-red-400">
            {error}
          </p>
        )}

        <button
          onClick={join}
          disabled={loading || !nickname.trim()}
          className="mt-4 w-full rounded-2xl bg-accent py-3.5 font-display font-semibold text-white shadow-[0_4px_24px_rgba(124,58,237,0.4)] transition-all hover:bg-accent/90 hover:shadow-[0_6px_32px_rgba(124,58,237,0.55)] active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          {loading ? 'Đang vào...' : 'Vào đoạn chat →'}
        </button>

        <button
          onClick={() => { setRoom(null); setError('') }}
          className="mt-3 w-full text-center text-xs text-muted transition-colors hover:text-white"
        >
          ← Nhập PIN khác
        </button>
      </div>
    </div>
  )
}

function ChatScreen({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string } | null>(null)
  const [imageError, setImageError] = useState('')
  const [style, setStyle] = useState<MessageStyle>(DEFAULT_STYLE)
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const [replyingTo, setReplyingTo] = useState<{ id: string; nickname: string; preview: string } | null>(null)
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessage | null>(null)
  const [seenMap, setSeenMap] = useState<Map<string, string>>(new Map())
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  const [showCapsulePicker, setShowCapsulePicker] = useState(false)
  const [capsuleAt, setCapsuleAt] = useState('')
  const [ownMood, setOwnMood] = useState<string | null>(null)
  const [otherMood, setOtherMood] = useState<string | null>(null)
  const [showMoodPicker, setShowMoodPicker] = useState(false)
  const [showGesturePicker, setShowGesturePicker] = useState(false)
  const [gestureOverlay, setGestureOverlay] = useState<{ emoji: string; nickname: string; label: string } | null>(null)
  const [showToolsMenu, setShowToolsMenu] = useState(false)

  const deviceId = useRef(getDeviceId())
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialLoadDone = useRef(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowser>['channel']> | null>(null)
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const lastTypingSentRef = useRef(0)
  const unlockTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingPayloadsRef = useRef<Map<string, Record<string, unknown>>>(new Map())

  const markSeen = useCallback(() => {
    fetch('/api/chat/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, deviceId: deviceId.current }),
    }).catch(() => {})
  }, [session.roomId])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/chat/messages?roomId=${session.roomId}&deviceId=${deviceId.current}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.messages) return
        setMessages(data.messages)
        setHasMore(Boolean(data.hasMore))
        initialLoadDone.current = true
        markSeen()
      })
      .finally(() => { if (!cancelled) setInitialLoading(false) })
    fetch(`/api/chat/pin?roomId=${session.roomId}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setPinnedMessage(data.message ?? null) })
    return () => { cancelled = true }
  }, [session.roomId, markSeen])

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

  const scheduleUnlock = useCallback((message: ChatMessage) => {
    if (!message.locked || !message.reveal_at) return
    if (unlockTimersRef.current.has(message.id)) return
    const delay = Math.max(0, new Date(message.reveal_at).getTime() - Date.now())
    const timer = setTimeout(async () => {
      unlockTimersRef.current.delete(message.id)
      try {
        const res = await fetch(`/api/chat/message-unlock?id=${message.id}&deviceId=${deviceId.current}`)
        const data = await res.json()
        if (data.message && !data.message.locked) {
          setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, ...data.message } : m)))
        }
      } catch {
        // best-effort — user can reload to unlock manually
      }
    }, delay)
    unlockTimersRef.current.set(message.id, timer)
  }, [])

  useEffect(() => {
    messages.forEach(scheduleUnlock)
  }, [messages, scheduleUnlock])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    const channel = supabase.channel(`chat-room-${session.roomId}`, {
      config: { presence: { key: deviceId.current } },
    })
    channel.on('broadcast', { event: 'message' }, (payload) => {
      const message = payload.payload as ChatMessage
      setMessages((prev) => {
        const idx = message.clientId ? prev.findIndex((m) => m.clientId === message.clientId) : -1
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = message
          return next
        }
        return [...prev, message]
      })
      if (message.clientId) pendingPayloadsRef.current.delete(message.clientId)
      markSeen()
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
    channel.on('broadcast', { event: 'reaction' }, (payload) => {
      const { messageId, deviceId: reactorId, emoji } = payload.payload as {
        messageId: string
        deviceId: string
        emoji: string | null
      }
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m
          const others = (m.chat_message_reactions ?? []).filter((r) => r.device_id !== reactorId)
          return { ...m, chat_message_reactions: emoji ? [...others, { device_id: reactorId, emoji }] : others }
        })
      )
    })
    channel.on('broadcast', { event: 'pin' }, (payload) => {
      const { message } = payload.payload as { message: PinnedMessage | null }
      setPinnedMessage(message)
    })
    channel.on('broadcast', { event: 'seen' }, (payload) => {
      const { deviceId: seenDeviceId, lastReadAt } = payload.payload as { deviceId: string; lastReadAt: string }
      if (seenDeviceId === deviceId.current) return
      setSeenMap((prev) => new Map(prev).set(seenDeviceId, lastReadAt))
    })
    channel.on('broadcast', { event: 'gesture' }, (payload) => {
      const { deviceId: fromDeviceId, nickname, gesture } = payload.payload as {
        deviceId: string
        nickname: string
        gesture: string
      }
      if (fromDeviceId === deviceId.current) return
      const option = GESTURE_OPTIONS.find((g) => g.id === gesture)
      if (!option) return
      setGestureOverlay({ emoji: option.emoji, nickname, label: option.label })
      if ('vibrate' in navigator) navigator.vibrate([150, 80, 150])
      setTimeout(() => setGestureOverlay(null), 2500)
    })
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, { mood?: string }[]>
      let found: string | null = null
      for (const [key, entries] of Object.entries(state)) {
        if (key === deviceId.current) continue
        const mood = entries[0]?.mood
        if (mood) found = mood
      }
      setOtherMood(found)
    })
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ mood: ownMood })
      }
    })
    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
      typingTimersRef.current.forEach(clearTimeout)
      typingTimersRef.current.clear()
      unlockTimersRef.current.forEach(clearTimeout)
      unlockTimersRef.current.clear()
      setTypingUsers(new Map())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.roomId])

  useEffect(() => {
    channelRef.current?.track({ mood: ownMood })
  }, [ownMood])

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null
  const lastMessageIdRef = useRef<string | null>(null)
  const hasScrolledOnceRef = useRef(false)
  useEffect(() => {
    if (!initialLoadDone.current) return
    if (lastMessageId !== lastMessageIdRef.current) {
      const isFirstScroll = !hasScrolledOnceRef.current
      hasScrolledOnceRef.current = true
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: isFirstScroll ? 'auto' : 'smooth' })
      })
    }
    lastMessageIdRef.current = lastMessageId
  }, [lastMessageId])

  const performSend = useCallback(async (clientId: string, payload: Record<string, unknown>) => {
    setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, pending: true, failed: false } : m)))
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.message) throw new Error('send failed')
      pendingPayloadsRef.current.delete(clientId)
      setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...data.message, clientId, pending: false } : m)))
    } catch {
      setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)))
    }
  }, [])

  const retrySend = useCallback((clientId: string) => {
    const payload = pendingPayloadsRef.current.get(clientId)
    if (!payload) return
    performSend(clientId, payload)
  }, [performSend])

  const send = useCallback(() => {
    const content = input.trim()
    if (!content && !pendingImage) return
    const imageToSend = pendingImage
    const reply = replyingTo
    const revealAt = capsuleAt ? new Date(capsuleAt).toISOString() : undefined
    const sentStyle = style
    setInput('')
    setPendingImage(null)
    setReplyingTo(null)
    setCapsuleAt('')
    setShowCapsulePicker(false)

    const clientId = crypto.randomUUID()
    const payload = {
      roomId: session.roomId,
      deviceId: deviceId.current,
      content,
      image: imageToSend ? { dataUrl: imageToSend.dataUrl } : undefined,
      style: { color: sentStyle.color, font: sentStyle.font, bold: sentStyle.bold, italic: sentStyle.italic },
      replyTo: reply ? { id: reply.id, nickname: reply.nickname, content: reply.preview } : undefined,
      revealAt,
      clientId,
    }
    pendingPayloadsRef.current.set(clientId, payload)

    setMessages((prev) => [
      ...prev,
      {
        id: clientId,
        clientId,
        device_id: deviceId.current,
        nickname: session.nickname,
        content: content || null,
        image_url: imageToSend?.dataUrl ?? null,
        text_color: sentStyle.color,
        font_family: sentStyle.font,
        bold: sentStyle.bold,
        italic: sentStyle.italic,
        reply_to_id: reply?.id ?? null,
        reply_to_nickname: reply?.nickname ?? null,
        reply_to_content: reply?.preview ?? null,
        reveal_at: revealAt ?? null,
        locked: false,
        created_at: new Date().toISOString(),
        pending: true,
      },
    ])

    performSend(clientId, payload)
  }, [input, pendingImage, style, replyingTo, capsuleAt, session.roomId, session.nickname, performSend])

  const sendGesture = async (gestureId: string) => {
    setShowGesturePicker(false)
    await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, deviceId: deviceId.current, gesture: gestureId }),
    })
  }

  const toggleReaction = (messageId: string, emoji: string) => {
    setReactionPickerFor(null)

    let previousReactions: Reaction[] | undefined
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m
        previousReactions = m.chat_message_reactions
        const others = (m.chat_message_reactions ?? []).filter((r) => r.device_id !== deviceId.current)
        const alreadyHadThis = (m.chat_message_reactions ?? []).some(
          (r) => r.device_id === deviceId.current && r.emoji === emoji
        )
        return { ...m, chat_message_reactions: alreadyHadThis ? others : [...others, { device_id: deviceId.current, emoji }] }
      })
    )

    fetch('/api/chat/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, messageId, deviceId: deviceId.current, emoji }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('react failed')
      })
      .catch(() => {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, chat_message_reactions: previousReactions } : m)))
      })
  }

  const pinMessage = async (messageId: string | null) => {
    await fetch('/api/chat/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, deviceId: deviceId.current, messageId }),
    })
  }

  const changeMood = async (mood: string | null) => {
    setOwnMood(mood)
    setShowMoodPicker(false)
    await fetch('/api/chat/mood', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, deviceId: deviceId.current, mood }),
    })
  }

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

  const otherMoodColor = MOOD_OPTIONS.find((m) => m.id === otherMood)?.color
  const showSeenIndicator = session.roomType !== 'solo'
  const lastMineId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].device_id === deviceId.current) return messages[i].id
    }
    return null
  })()
  const seenAt = (() => {
    if (!showSeenIndicator || !lastMineId) return null
    const lastMine = messages.find((m) => m.id === lastMineId)
    if (!lastMine) return null
    let latest: string | null = null
    seenMap.forEach((ts) => {
      if (new Date(ts).getTime() >= new Date(lastMine.created_at).getTime()) {
        if (!latest || new Date(ts).getTime() > new Date(latest).getTime()) latest = ts
      }
    })
    return latest
  })()

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-4">

      {/* ── Gesture overlay ─────────────────────────────────────── */}
      {gestureOverlay && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-xl animate-[panel-in_0.15s_ease-out]">
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.05] px-10 py-8 backdrop-blur-xl">
            <span className="animate-gesture-burst text-8xl drop-shadow-[0_0_32px_rgba(124,58,237,0.7)]">
              {gestureOverlay.emoji}
            </span>
            <p className="font-display text-lg font-semibold text-white">
              {gestureOverlay.nickname} đã gửi {gestureOverlay.label.toLowerCase()}!
            </p>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-3 flex items-center gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/[0.10] shadow-[0_0_14px_rgba(124,58,237,0.2)]">
          {session.roomType === 'solo'
            ? <BookOpen size={17} className="text-accent-soft" />
            : <MessageCircle size={17} className="text-accent-soft" />
          }
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-semibold text-white">{session.roomName}</p>
          {session.anniversaryDate ? (
            <p className="mt-0.5 truncate text-xs font-medium text-accent-soft">
              💞 Yêu nhau được {daysSince(session.anniversaryDate)} ngày
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted">{session.roomType === 'solo' ? 'Độc thoại' : 'Nhóm'}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setShowMoodPicker((v) => !v)}
            title="Trạng thái cảm xúc"
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg transition-all hover:scale-110 ${
              showMoodPicker ? 'border border-accent/30 bg-accent/[0.12]' : 'hover:bg-white/[0.06]'
            }`}
          >
            {MOOD_OPTIONS.find((m) => m.id === ownMood)?.emoji ?? '🙂'}
          </button>
          <button
            onClick={leave}
            title="Rời phòng"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-all hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* ── Mood picker ─────────────────────────────────────────── */}
      {showMoodPicker && (
        <div className="mb-2 flex flex-wrap gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 backdrop-blur-xl animate-panel-in">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.id}
              onClick={() => changeMood(ownMood === m.id ? null : m.id)}
              title={m.label}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2 transition-all hover:scale-105 ${
                ownMood === m.id
                  ? 'border-accent bg-accent/[0.15]'
                  : 'border-white/[0.06] bg-white/[0.03] hover:border-white/[0.14]'
              }`}
            >
              <span className="text-xl">{m.emoji}</span>
              <span className="text-[10px] text-muted">{m.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Pinned message ──────────────────────────────────────── */}
      {pinnedMessage && (
        <div className="mb-2 flex items-center gap-2.5 rounded-2xl border border-accent/20 bg-accent/[0.07] px-3.5 py-2.5 animate-panel-in">
          <Pin size={11} className="shrink-0 text-accent-soft" />
          <span className="flex-1 truncate text-xs text-accent-soft">
            <b>{pinnedMessage.nickname}:</b> {pinnedMessage.content ?? '[Hình ảnh]'}
          </span>
          <button
            onClick={() => pinMessage(null)}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-white"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* ── Message list ────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-sm"
        style={otherMoodColor ? { boxShadow: `inset 0 0 80px ${otherMoodColor}18` } : undefined}
      >
        {initialLoading ? (
          <div className="space-y-4 p-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="h-9 animate-pulse rounded-2xl bg-white/[0.05]"
                  style={{ width: `${40 + (i * 37) % 35}%` }}
                />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.03]">
              <MessageCircle size={28} className="text-muted/60" />
            </div>
            <div>
              <p className="text-sm text-muted">Chưa có tin nhắn nào</p>
              <p className="mt-0.5 text-xs text-muted/60">Gửi lời chào đầu tiên đi!</p>
            </div>
          </div>
        ) : (
          <>
            {loadingMore && (
              <p className="text-center text-xs text-muted animate-pulse">Đang tải tin nhắn cũ...</p>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const showDayDivider = session.roomType === 'solo' && (!prev || formatDayLabel(prev.created_at) !== formatDayLabel(m.created_at))

              if (m.device_id === 'system') {
                return (
                  <div key={m.id}>
                    {showDayDivider && (
                      <div className="mb-3 flex items-center gap-3 text-[10px] font-medium uppercase tracking-widest text-muted">
                        <span className="h-px flex-1 bg-white/[0.06]" />
                        {formatDayLabel(m.created_at)}
                        <span className="h-px flex-1 bg-white/[0.06]" />
                      </div>
                    )}
                    <div className="flex justify-center animate-msg-in">
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-3.5 py-1 text-center text-xs text-amber-400">
                        {m.content}
                      </span>
                    </div>
                  </div>
                )
              }

              const isJournal = session.roomType === 'solo'
              const mine = !isJournal && m.device_id === deviceId.current
              const reactions = m.chat_message_reactions ?? []
              const reactionGroups = new Map<string, number>()
              reactions.forEach((r) => reactionGroups.set(r.emoji, (reactionGroups.get(r.emoji) ?? 0) + 1))
              const myReaction = reactions.find((r) => r.device_id === deviceId.current)?.emoji
              const bubbleMaxWidth = isJournal ? 'max-w-full' : 'max-w-[75%]'
              const tailClass = isJournal ? '' : mine ? 'rounded-br-md' : 'rounded-bl-md'

              return (
                <div key={m.id}>
                  {showDayDivider && (
                    <div className="mb-3 flex items-center gap-3 text-[10px] font-medium uppercase tracking-widest text-muted">
                      <span className="h-px flex-1 bg-white/[0.06]" />
                      {formatDayLabel(m.created_at)}
                      <span className="h-px flex-1 bg-white/[0.06]" />
                    </div>
                  )}
                  <div
                    className={`group flex animate-msg-in flex-col ${isJournal ? 'w-full items-start' : mine ? 'items-end' : 'items-start'}`}
                  >
                    {!mine && !isJournal && (
                      <span className="mb-1 text-[10px] font-medium text-muted">{m.nickname}</span>
                    )}

                    {m.reply_to_id && (
                      <div className={`mb-1.5 ${bubbleMaxWidth} flex items-start gap-1.5 rounded-xl border-l-2 border-accent/40 bg-white/[0.04] px-2.5 py-1.5 text-xs text-muted backdrop-blur-sm ${mine ? 'text-right' : ''}`}>
                        <Reply size={10} className="mt-0.5 shrink-0 text-accent-soft/70" />
                        <span className="min-w-0 truncate">
                          <b className="text-accent-soft">{m.reply_to_nickname}</b>: {m.reply_to_content}
                        </span>
                      </div>
                    )}

                    <div className={`flex flex-col ${isJournal ? 'w-full items-start' : mine ? 'items-end' : 'items-start'} ${m.pending || m.failed ? 'opacity-50' : ''} transition-opacity`}>
                      {m.locked ? (
                        <span className={`${bubbleMaxWidth} flex items-center gap-2 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-sm text-muted`}>
                          <Lock size={13} className="shrink-0" />
                          Tin nhắn hẹn giờ, mở lúc {m.reveal_at ? formatTime(m.reveal_at) : '...'}
                        </span>
                      ) : isJournal ? (
                        <div className="w-full border-l-2 border-accent/40 py-1 pl-4">
                          {m.image_url && (
                            <a href={m.image_url} target="_blank" rel="noreferrer" className="mb-2 block max-w-md">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.image_url} alt="" className="rounded-xl border border-white/[0.08] object-cover" />
                            </a>
                          )}
                          {m.content && (
                            <p
                              className="text-[15px] leading-relaxed text-white"
                              style={{
                                ...fontStyleFor(m.font_family),
                                color: m.text_color ?? undefined,
                                fontWeight: m.bold ? 700 : undefined,
                                fontStyle: m.italic ? 'italic' : undefined,
                              }}
                            >
                              {m.content}
                            </p>
                          )}
                          <span className="mt-1 block text-[10px] text-muted/70">{formatTime(m.created_at)}</span>
                        </div>
                      ) : (
                        <>
                          {m.image_url && (
                            <a href={m.image_url} target="_blank" rel="noreferrer" className="mb-1 block max-w-[75%]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.image_url} alt="" className="max-h-64 rounded-xl border border-white/[0.08] object-cover shadow-lg" />
                            </a>
                          )}
                          {m.content && (
                            <span
                              className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${tailClass} ${
                                mine
                                  ? 'bg-gradient-to-br from-accent to-[#5b21b6] text-white shadow-[0_2px_16px_rgba(124,58,237,0.35)]'
                                  : 'border border-white/[0.08] bg-white/[0.06] text-white backdrop-blur-sm'
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
                        </>
                      )}
                    </div>

                    {m.failed && (
                      <button
                        onClick={() => retrySend(m.clientId!)}
                        className="mt-0.5 text-[10px] text-red-400 hover:underline"
                      >
                        Tin chưa được gửi · Nhắn lại
                      </button>
                    )}

                    {reactionGroups.size > 0 && (
                      <div className={`mt-1.5 flex gap-1 ${isJournal ? 'pl-4' : ''}`}>
                        {Array.from(reactionGroups.entries()).map(([emoji, count]) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(m.id, emoji)}
                            className={`animate-pop-in rounded-full border px-1.5 py-0.5 text-xs transition-transform hover:scale-110 ${
                              myReaction === emoji
                                ? 'border-accent/40 bg-accent/[0.15]'
                                : 'border-white/[0.08] bg-white/[0.04]'
                            }`}
                          >
                            {emoji} {count > 1 ? count : ''}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={`mt-1 hidden items-center gap-1 group-hover:flex ${isJournal ? 'pl-4' : ''}`}>
                      <button
                        onClick={() => setReactionPickerFor(reactionPickerFor === m.id ? null : m.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-lg text-muted transition-all hover:bg-white/[0.07] hover:text-white"
                      >
                        <SmilePlus size={11} />
                      </button>
                      {!m.locked && (
                        <button
                          onClick={() => setReplyingTo({ id: m.id, nickname: m.nickname, preview: m.content ?? '[Hình ảnh]' })}
                          className="flex h-6 items-center gap-1 rounded-lg px-1.5 text-[10px] text-muted transition-all hover:bg-white/[0.07] hover:text-white"
                        >
                          <Reply size={10} />
                          Trả lời
                        </button>
                      )}
                      <button
                        onClick={() => pinMessage(m.id)}
                        className="flex h-6 items-center gap-1 rounded-lg px-1.5 text-[10px] text-muted transition-all hover:bg-white/[0.07] hover:text-white"
                      >
                        <Pin size={10} />
                        Ghim
                      </button>
                    </div>

                    {reactionPickerFor === m.id && (
                      <div className={`mt-1.5 flex animate-panel-in gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 shadow-xl backdrop-blur-xl ${isJournal ? 'ml-4' : ''}`}>
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(m.id, emoji)}
                            className="text-base transition-transform hover:scale-125"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    {!isJournal && mine && m.id === lastMineId && seenAt && (
                      <span className="mt-0.5 text-[10px] text-muted/70">Đã xem lúc {formatTime(seenAt)}</span>
                    )}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* ── Reply bar ───────────────────────────────────────────── */}
      {replyingTo && (
        <div className="mt-2 flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-xs animate-panel-in">
          <Reply size={12} className="shrink-0 text-accent-soft" />
          <span className="flex-1 truncate text-muted">
            Trả lời <b className="text-accent-soft">{replyingTo.nickname}</b>: {replyingTo.preview}
          </span>
          <button
            onClick={() => setReplyingTo(null)}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-white"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* ── Pending image preview ───────────────────────────────── */}
      {pendingImage && (
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage.dataUrl} alt="" className="h-12 w-12 rounded-xl border border-white/[0.08] object-cover" />
          <span className="flex-1 text-xs text-muted">Ảnh sẽ được gửi kèm tin nhắn</span>
          <button
            onClick={() => setPendingImage(null)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:text-white"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {imageError && <p className="mt-2 text-xs text-red-400">{imageError}</p>}

      {/* ── Typing indicator ────────────────────────────────────── */}
      {typingUsers.size > 0 && (
        <div className="mt-2 flex w-fit items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-muted animate-panel-in">
          <span>{Array.from(typingUsers.values()).join(', ')} đang nhập</span>
          <span className="flex items-center gap-0.5">
            <span className="h-1 w-1 animate-typing-dot rounded-full bg-muted" style={{ animationDelay: '0ms' }} />
            <span className="h-1 w-1 animate-typing-dot rounded-full bg-muted" style={{ animationDelay: '150ms' }} />
            <span className="h-1 w-1 animate-typing-dot rounded-full bg-muted" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}

      {/* ── Time capsule picker ─────────────────────────────────── */}
      {showCapsulePicker && (
        <div className="mt-2 flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 backdrop-blur-xl animate-panel-in">
          <Clock size={14} className="shrink-0 text-accent-soft" />
          <span className="text-xs text-muted">Mở lúc</span>
          <input
            type="datetime-local"
            value={capsuleAt}
            onChange={(e) => setCapsuleAt(e.target.value)}
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent/60"
          />
          <button
            onClick={() => { setCapsuleAt(''); setShowCapsulePicker(false) }}
            className="text-xs text-muted transition-colors hover:text-white"
          >
            Huỷ
          </button>
        </div>
      )}

      {/* ── Gesture picker ──────────────────────────────────────── */}
      {showGesturePicker && (
        <div className="mt-2 grid grid-cols-4 gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 backdrop-blur-xl animate-panel-in">
          {GESTURE_OPTIONS.map((g) => (
            <button
              key={g.id}
              onClick={() => sendGesture(g.id)}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] py-2.5 text-xs text-muted transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:bg-accent/[0.07] hover:text-white"
            >
              <span className="text-xl">{g.emoji}</span>
              {g.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Style picker ────────────────────────────────────────── */}
      {showStylePicker && (
        <div className="mt-2 space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur-xl animate-panel-in">
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted">Màu chữ</span>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateStyle({ color: c === COLOR_PRESETS[0] ? null : c })}
                  title={c}
                  className={`h-7 w-7 rounded-full border-2 transition-all hover:scale-110 ${
                    (style.color ?? COLOR_PRESETS[0]) === c
                      ? 'border-white scale-110 shadow-lg'
                      : 'border-transparent hover:border-white/40'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted">Font chữ</span>
            <div className="flex flex-wrap gap-1.5">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => updateStyle({ font: f.id === 'sans' ? null : f.id })}
                  style={f.style}
                  className={`rounded-xl border px-3 py-1 text-xs transition-all ${
                    (style.font ?? 'sans') === f.id
                      ? 'border-accent bg-accent/[0.15] text-accent-soft shadow-[0_0_12px_rgba(124,58,237,0.2)]'
                      : 'border-white/[0.08] bg-white/[0.03] text-muted hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted">Kiểu chữ</span>
            <div className="flex gap-2">
              <button
                onClick={() => updateStyle({ bold: !style.bold })}
                className={`h-8 w-8 rounded-xl border font-bold text-sm transition-all ${
                  style.bold
                    ? 'border-accent bg-accent/[0.15] text-accent-soft'
                    : 'border-white/[0.08] bg-white/[0.03] text-muted hover:text-white'
                }`}
              >
                B
              </button>
              <button
                onClick={() => updateStyle({ italic: !style.italic })}
                className={`h-8 w-8 rounded-xl border text-sm italic transition-all ${
                  style.italic
                    ? 'border-accent bg-accent/[0.15] text-accent-soft'
                    : 'border-white/[0.08] bg-white/[0.03] text-muted hover:text-white'
                }`}
              >
                I
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Input bar ───────────────────────────────────────────── */}
      <div className="relative mt-3 flex items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onImageSelected} className="hidden" />

        <button
          onClick={() => setShowToolsMenu((v) => !v)}
          title="Thêm"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
            showToolsMenu || showStylePicker || showCapsulePicker || showGesturePicker
              ? 'border-accent/40 bg-accent/[0.15] text-accent-soft rotate-45'
              : 'border-white/[0.08] bg-white/[0.03] text-muted hover:border-white/[0.14] hover:text-white'
          }`}
        >
          <Plus size={18} />
        </button>

        {showToolsMenu && (
          <div className="absolute bottom-full left-0 mb-2 flex animate-panel-in gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.06] p-2 shadow-2xl backdrop-blur-xl">
            <button
              onClick={() => { pickImage(); setShowToolsMenu(false) }}
              title="Gửi ảnh"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-all hover:-translate-y-0.5 hover:bg-white/[0.08] hover:text-white"
            >
              <ImageIcon size={17} />
            </button>
            <button
              onClick={() => { setShowStylePicker((v) => !v); setShowToolsMenu(false) }}
              title="Tùy chỉnh kiểu chữ"
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 ${
                showStylePicker ? 'bg-accent/[0.15] text-accent-soft' : 'text-muted hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <Type size={15} />
            </button>
            <button
              onClick={() => { setShowCapsulePicker((v) => !v); setShowToolsMenu(false) }}
              title="Tin nhắn hẹn giờ"
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 ${
                showCapsulePicker || capsuleAt ? 'bg-accent/[0.15] text-accent-soft' : 'text-muted hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <Clock size={15} />
            </button>
            <button
              onClick={() => { setShowGesturePicker((v) => !v); setShowToolsMenu(false) }}
              title="Gửi cử chỉ"
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 ${
                showGesturePicker ? 'bg-accent/[0.15] text-accent-soft' : 'text-muted hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <span className="text-base">🤗</span>
            </button>
          </div>
        )}

        <input
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          onFocus={() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 300)}
          placeholder="Nhắn gì đó..."
          style={{
            ...fontStyleFor(style.font),
            color: style.color ?? undefined,
            fontWeight: style.bold ? 700 : undefined,
            fontStyle: style.italic ? 'italic' : undefined,
          }}
          className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-base text-white outline-none transition-all placeholder-muted focus:border-accent/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-accent/20 sm:text-sm"
        />

        <button
          onClick={send}
          disabled={!input.trim() && !pendingImage}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-[0_4px_16px_rgba(124,58,237,0.4)] transition-all hover:bg-accent/90 hover:shadow-[0_6px_24px_rgba(124,58,237,0.55)] active:scale-95 disabled:opacity-40 disabled:shadow-none"
        >
          <Send size={16} />
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
    <ToolShell name="Private Chat" icon="💬" description="Đoạn chat riêng tư bằng mã PIN" fullBleed>
      {session === undefined ? null : session ? (
        <ChatScreen session={session} onLeave={() => setSession(null)} />
      ) : (
        <div className="flex h-full items-center justify-center overflow-y-auto p-4">
          <JoinScreen onJoined={setSession} />
        </div>
      )}
    </ToolShell>
  )
}
