'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
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

function daysSince(dateStr: string): number {
  const start = new Date(dateStr + 'T00:00:00')
  const diff = Date.now() - start.getTime()
  return Math.max(1, Math.floor(diff / 86400000) + 1)
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
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

  const deviceId = useRef(getDeviceId())
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialLoadDone = useRef(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowser>['channel']> | null>(null)
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const lastTypingSentRef = useRef(0)
  const unlockTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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

  // Schedule an unlock check for a time-capsule message so its real content
  // is fetched the moment reveal_at passes, without polling.
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
        // best-effort — user can reload the page to unlock manually
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
      setMessages((prev) => [...prev, message])
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
    const reply = replyingTo
    const revealAt = capsuleAt ? new Date(capsuleAt).toISOString() : undefined
    setPendingImage(null)
    setReplyingTo(null)
    setCapsuleAt('')
    setShowCapsulePicker(false)
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
          replyTo: reply ? { id: reply.id, nickname: reply.nickname, content: reply.preview } : undefined,
          revealAt,
        }),
      })
    } finally {
      setSending(false)
    }
  }, [input, pendingImage, style, replyingTo, capsuleAt, session.roomId])

  const sendGesture = async (gestureId: string) => {
    setShowGesturePicker(false)
    await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, deviceId: deviceId.current, gesture: gestureId }),
    })
  }

  const toggleReaction = async (messageId: string, emoji: string) => {
    setReactionPickerFor(null)
    await fetch('/api/chat/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, messageId, deviceId: deviceId.current, emoji }),
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
    <div className="mx-auto flex max-w-xl flex-col" style={{ height: '70vh' }}>
      {gestureOverlay && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
          <span className="animate-bounce text-7xl">{gestureOverlay.emoji}</span>
          <p className="text-lg font-display font-semibold text-white">
            {gestureOverlay.nickname} đã gửi {gestureOverlay.label.toLowerCase()}!
          </p>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="font-display font-semibold text-white">{session.roomName}</p>
          {session.anniversaryDate && (
            <p className="text-xs text-accent-soft">💞 Yêu nhau được {daysSince(session.anniversaryDate)} ngày</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowMoodPicker((v) => !v)} title="Trạng thái cảm xúc" className="text-lg">
            {MOOD_OPTIONS.find((m) => m.id === ownMood)?.emoji ?? '🙂'}
          </button>
          <button onClick={leave} className="text-xs text-muted hover:text-white">Rời phòng</button>
        </div>
      </div>

      {showMoodPicker && (
        <div className="mb-2 flex flex-wrap gap-1.5 rounded-xl border border-border bg-surface p-2">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.id}
              onClick={() => changeMood(ownMood === m.id ? null : m.id)}
              title={m.label}
              className={`rounded-lg border px-2 py-1 text-lg transition-colors ${
                ownMood === m.id ? 'border-accent bg-accent/20' : 'border-transparent hover:border-border'
              }`}
            >
              {m.emoji}
            </button>
          ))}
        </div>
      )}

      {pinnedMessage && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs">
          <span>📌</span>
          <span className="flex-1 truncate text-accent-soft">
            <b>{pinnedMessage.nickname}:</b> {pinnedMessage.content ?? '[Hình ảnh]'}
          </span>
          <button onClick={() => pinMessage(null)} className="text-muted hover:text-white">✕</button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-2 overflow-y-auto rounded-xl border border-border bg-surface p-4 transition-colors"
        style={otherMoodColor ? { boxShadow: `inset 0 0 60px ${otherMoodColor}22` } : undefined}
      >
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
          const reactions = m.chat_message_reactions ?? []
          const reactionGroups = new Map<string, number>()
          reactions.forEach((r) => reactionGroups.set(r.emoji, (reactionGroups.get(r.emoji) ?? 0) + 1))
          const myReaction = reactions.find((r) => r.device_id === deviceId.current)?.emoji

          return (
            <div key={m.id} className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {!mine && <span className="mb-0.5 text-[10px] text-muted">{m.nickname}</span>}

              {m.reply_to_id && (
                <div className={`mb-1 max-w-[75%] rounded-lg border-l-2 border-accent/50 bg-background/50 px-2 py-1 text-xs text-muted ${mine ? 'text-right' : ''}`}>
                  <b className="text-accent-soft">{m.reply_to_nickname}</b>: {m.reply_to_content}
                </div>
              )}

              {m.locked ? (
                <span className="max-w-[75%] rounded-2xl border border-dashed border-border bg-background px-3.5 py-2 text-sm text-muted">
                  🔒 Tin nhắn hẹn giờ, mở lúc {m.reveal_at ? formatTime(m.reveal_at) : '...'}
                </span>
              ) : (
                <>
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
                </>
              )}

              {reactionGroups.size > 0 && (
                <div className="mt-1 flex gap-1">
                  {Array.from(reactionGroups.entries()).map(([emoji, count]) => (
                    <button
                      key={emoji}
                      onClick={() => toggleReaction(m.id, emoji)}
                      className={`rounded-full border px-1.5 py-0.5 text-xs ${
                        myReaction === emoji ? 'border-accent bg-accent/20' : 'border-border bg-background'
                      }`}
                    >
                      {emoji} {count > 1 ? count : ''}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-0.5 hidden gap-2 group-hover:flex">
                <button
                  onClick={() => setReactionPickerFor(reactionPickerFor === m.id ? null : m.id)}
                  className="text-[10px] text-muted hover:text-white"
                >
                  😊
                </button>
                {!m.locked && (
                  <button
                    onClick={() => setReplyingTo({ id: m.id, nickname: m.nickname, preview: m.content ?? '[Hình ảnh]' })}
                    className="text-[10px] text-muted hover:text-white"
                  >
                    ↩ Trả lời
                  </button>
                )}
                <button onClick={() => pinMessage(m.id)} className="text-[10px] text-muted hover:text-white">
                  📌 Ghim
                </button>
              </div>

              {reactionPickerFor === m.id && (
                <div className="mt-1 flex gap-1 rounded-full border border-border bg-background px-2 py-1">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button key={emoji} onClick={() => toggleReaction(m.id, emoji)} className="text-sm hover:scale-125 transition-transform">
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {mine && m.id === lastMineId && seenAt && (
                <span className="mt-0.5 text-[10px] text-muted">Đã xem lúc {formatTime(seenAt)}</span>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {replyingTo && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-surface p-2 text-xs">
          <span className="flex-1 truncate text-muted">
            Trả lời <b className="text-accent-soft">{replyingTo.nickname}</b>: {replyingTo.preview}
          </span>
          <button onClick={() => setReplyingTo(null)} className="text-muted hover:text-white">✕</button>
        </div>
      )}

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

      {showCapsulePicker && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
          <span className="text-xs text-muted">🕰️ Mở lúc</span>
          <input
            type="datetime-local"
            value={capsuleAt}
            onChange={(e) => setCapsuleAt(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-white outline-none focus:border-accent"
          />
          <button onClick={() => { setCapsuleAt(''); setShowCapsulePicker(false) }} className="text-xs text-muted hover:text-white">Huỷ</button>
        </div>
      )}

      {showGesturePicker && (
        <div className="mt-3 flex gap-2 rounded-xl border border-border bg-surface p-3">
          {GESTURE_OPTIONS.map((g) => (
            <button
              key={g.id}
              onClick={() => sendGesture(g.id)}
              className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-border bg-background py-2 text-xs text-muted transition-colors hover:border-accent hover:text-white"
            >
              <span className="text-xl">{g.emoji}</span>
              {g.label}
            </button>
          ))}
        </div>
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
        <button
          onClick={() => setShowCapsulePicker((v) => !v)}
          title="Tin nhắn hẹn giờ"
          className={`rounded-xl border px-3 py-2.5 transition-colors ${
            showCapsulePicker || capsuleAt ? 'border-accent bg-accent/20' : 'border-border bg-surface text-muted hover:text-white'
          }`}
        >
          🕰️
        </button>
        <button
          onClick={() => setShowGesturePicker((v) => !v)}
          title="Gửi cử chỉ"
          className={`rounded-xl border px-3 py-2.5 transition-colors ${
            showGesturePicker ? 'border-accent bg-accent/20' : 'border-border bg-surface text-muted hover:text-white'
          }`}
        >
          🤗
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
