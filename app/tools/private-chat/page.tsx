'use client'
import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import Link from 'next/link'
import { LogOut, Pin, Reply, SmilePlus, Clock, Image as ImageIcon, Type, Send, MessageCircle, BookOpen, X, Plus, Lock, Paperclip, FileIcon, Search, Images, ExternalLink, ArrowLeft } from 'lucide-react'
import { ToolShell } from '@/components/tool-shell'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { CHAT_MAX_FILE_SIZE_BYTES, CHAT_MAX_FILE_SIZE_MB, CHAT_OVERSIZE_DISMISS_DAYS } from '@/lib/chat-limits'
import { loadCachedMessages, saveCachedMessages } from '@/lib/chat-cache'
import { DEFAULT_MOOD_OPTIONS, DEFAULT_REACTION_EMOJIS, FONT_CATALOG, WALLPAPER_PRESETS, type MoodOption, type FontId, type FontOption } from '@/lib/chat-defaults'
import { Dancing_Script, Baloo_2, Noto_Serif, Pacifico, Anton, Mali, Lobster } from 'next/font/google'

// Scoped to this page only (not the global layout) so other tools' bundles
// stay untouched. All support the Vietnamese subset.
const dancingScript = Dancing_Script({ subsets: ['vietnamese', 'latin'], weight: '700', variable: '--font-dancing-script' })
const baloo2 = Baloo_2({ subsets: ['vietnamese', 'latin'], weight: '600', variable: '--font-baloo-2' })
const notoSerif = Noto_Serif({ subsets: ['vietnamese', 'latin'], weight: ['400', '700'], variable: '--font-noto-serif' })
const pacifico = Pacifico({ subsets: ['vietnamese', 'latin'], weight: '400', variable: '--font-pacifico' })
const anton = Anton({ subsets: ['vietnamese', 'latin'], weight: '400', variable: '--font-anton' })
const mali = Mali({ subsets: ['vietnamese', 'latin'], weight: '600', variable: '--font-mali' })
const lobster = Lobster({ subsets: ['vietnamese', 'latin'], weight: '400', variable: '--font-lobster' })

const OVERSIZE_DISMISS_KEY = 'wv-chat-oversize-dismissed-at'

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${Math.ceil(bytes / 1024)}KB`
}

const SESSION_KEY = 'wv-chat-session'
const DEVICE_KEY = 'wv-chat-device-id'

type Session = {
  pin: string
  roomId: string
  roomName: string
  nickname: string
  roomType: 'group' | 'solo'
  anniversaryDate?: string | null
  roomIconUrl?: string | null
  moodOptions?: MoodOption[] | null
  reactionEmojis?: string[] | null
  fontOptions?: FontOption[] | null
  wallpaperPreset?: string | null
  wallpaperUrl?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  tertiaryColor?: string | null
  quaternaryColor?: string | null
  themeFont?: FontId | null
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
  file_url?: string | null
  file_bytes?: number | null
  file_name?: string | null
  file_resource_type?: string | null
  link_preview?: { url: string; title: string; description: string | null; image: string | null; siteName: string | null } | null
}

type PinnedMessage = { id: string; device_id: string; nickname: string; content: string | null; image_url?: string | null }

type MessageStyle = { color: string | null; font: FontId | null; bold: boolean; italic: boolean }

const STYLE_KEY = 'wv-chat-style'
const DEFAULT_STYLE: MessageStyle = { color: null, font: null, bold: false, italic: false }

const COLOR_PRESETS = [
  '#FAFAFA', // mặc định
  '#F87171', // đỏ
  '#FB923C', // cam
  '#FBBF24', // hổ phách
  '#A3E635', // chanh
  '#34D399', // ngọc lục bảo
  '#2DD4BF', // ngọc lam
  '#22D3EE', // xanh biển
  '#60A5FA', // xanh dương
  '#818CF8', // chàm
  '#A78BFA', // tím
  '#E879F9', // hồng tím
  '#F472B6', // hồng
  '#FB7185', // hồng cam
  '#94A3B8', // xám
]

const GESTURE_OPTIONS: { id: string; emoji: string; label: string }[] = [
  { id: 'hug', emoji: '🤗', label: 'Ôm' },
  { id: 'pat', emoji: '👊', label: 'Đấm lưng' },
  { id: 'wave', emoji: '👋', label: 'Vẫy tay' },
  { id: 'kiss', emoji: '😘', label: 'Hôn' },
]

// A separate, larger set of expressive icons that only ever get inserted
// inline into typed text (":laugh:" etc, via renderMessageContent) — unlike
// GESTURE_OPTIONS, these have no standalone fly-over send.
const STICKER_OPTIONS: { id: string; emoji: string; label: string }[] = [
  { id: 'laugh', emoji: '😆', label: 'Cười ngoác' },
  { id: 'lol', emoji: '😂', label: 'Cười ra lệ' },
  { id: 'sob', emoji: '😭', label: 'Khóc to' },
  { id: 'kiss-closed', emoji: '😚', label: 'Hôn mắt nhắm' },
  { id: 'blow-kiss', emoji: '😘', label: 'Hôn gió' },
  { id: 'love', emoji: '🥰', label: 'Yêu' },
  { id: 'party', emoji: '🥳', label: 'Tiệc tùng' },
  { id: 'melting', emoji: '🫠', label: 'Tan chảy' },
  { id: 'smile-tear', emoji: '🥲', label: 'Cười rưng rưng' },
  { id: 'holding-tears', emoji: '🥹', label: 'Kìm nước mắt' },
  { id: 'smirk', emoji: '😏', label: 'Nhếch mép' },
  { id: 'goofy', emoji: '🤪', label: 'Tưng tửng' },
  { id: 'wink-tongue', emoji: '😜', label: 'Nháy mắt lè lưỡi' },
  { id: 'tongue-eyes-closed', emoji: '😝', label: 'Lè lưỡi nhắm mắt' },
  { id: 'blank', emoji: '😑', label: 'Vô cảm' },
  { id: 'thinking', emoji: '🤔', label: 'Suy nghĩ' },
  { id: 'giggle', emoji: '🤭', label: 'Che miệng cười' },
  { id: 'peek', emoji: '🫣', label: 'Nhìn qua kẽ tay' },
  { id: 'scream', emoji: '😱', label: 'Hét sợ' },
  { id: 'cursing', emoji: '🤬', label: 'Chửi' },
  { id: 'angry', emoji: '😡', label: 'Giận dữ' },
  { id: 'sweat', emoji: '😓', label: 'Toát mồ hôi' },
  { id: 'angel', emoji: '😇', label: 'Thiên thần' },
  { id: 'fire', emoji: '🔥', label: 'Lửa' },
  { id: 'lips', emoji: '💋', label: 'Dấu môi hôn' },
  { id: 'confetti', emoji: '🎉', label: 'Ăn mừng' },
  { id: 'eyes', emoji: '👀', label: 'Nhìn' },
  { id: 'poop', emoji: '💩', label: 'Xui xẻo' },
  { id: 'vomit', emoji: '🤮', label: 'Buồn nôn' },
  { id: 'unamused', emoji: '😒', label: 'Chán' },
  { id: 'heart-eyes', emoji: '😍', label: 'Mắt trái tim' },
  { id: 'grin', emoji: '😄', label: 'Cười tươi' },
]

// Fixed mapping of every font id that can ever be stored on a message — kept
// separate from FONT_CATALOG (which is just id+label metadata a room can
// pick a subset of) so old messages always render correctly regardless of
// the room's *current* picker configuration.
function fontStyleFor(font?: string | null): React.CSSProperties {
  switch (font) {
    case 'display':
      return { fontFamily: 'var(--font-space-grotesk), sans-serif' }
    case 'mono':
      return { fontFamily: 'var(--font-jetbrains-mono), monospace' }
    case 'cursive':
      return { fontFamily: 'var(--font-dancing-script), cursive' }
    case 'rounded':
      return { fontFamily: 'var(--font-baloo-2), sans-serif' }
    case 'serif':
      return { fontFamily: 'var(--font-noto-serif), serif' }
    case 'script':
      return { fontFamily: 'var(--font-pacifico), cursive' }
    case 'impact':
      return { fontFamily: 'var(--font-anton), sans-serif' }
    case 'cute':
      return { fontFamily: 'var(--font-mali), sans-serif' }
    case 'funky':
      return { fontFamily: 'var(--font-lobster), cursive' }
    default:
      // Explicit (not just "unset") so message text never inherits a
      // room's chrome theme font — only the sender's own per-message choice.
      return { fontFamily: 'var(--font-inter), sans-serif' }
  }
}

// One SVG per theme-provided icon set, stored as static assets (not
// generated at runtime) — see public/icons/<slug>/*.svg. Falls back to
// whatever lucide icon the caller renders as children when no set applies.
function ThemedIcon({ set, name, size, className }: { set: string; name: string; size: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/icons/${set}/${name}.svg`} width={size} height={size} className={className} alt="" />
  )
}

// Lets a message mix typed text with an inline themed icon (e.g. "Nhớ em
// quá :hug:") — the gesture picker inserts these tokens into the input
// instead of only ever sending a whole canned gesture message. Falls back to
// the gesture's own emoji when the room has no custom icon set, so a token
// never renders as literal ":hug:" text.
// Every id from both option lists can appear as an inline ":id:" token —
// gestures via the empty-input-fallback path too, stickers only ever this way.
const ICON_TOKEN_OPTIONS = [
  ...GESTURE_OPTIONS.map((g) => ({ ...g, assetName: `gesture-${g.id}` })),
  ...STICKER_OPTIONS.map((s) => ({ ...s, assetName: `sticker-${s.id}` })),
]
const ICON_TOKEN_RE = new RegExp(`(${ICON_TOKEN_OPTIONS.map((o) => `:${o.id}:`).join('|')})`, 'g')

// Not every icon set has drawn the full 32-sticker pack yet (it's the bulk
// of the work) — themes not listed here still get their gesture-* icons,
// they just fall back to the plain emoji for sticker-* until drawn.
const ICON_SETS_WITH_STICKERS = new Set(['mosaic', 'burrow'])

function renderMessageContent(content: string, iconSet: string | null): React.ReactNode {
  const parts = content.split(ICON_TOKEN_RE)
  if (parts.length === 1) return content
  return parts.map((part, i) => {
    const id = part.startsWith(':') ? part.slice(1, -1) : null
    const option = id ? ICON_TOKEN_OPTIONS.find((o) => o.id === id) : null
    if (!option) return <Fragment key={i}>{part}</Fragment>
    const themed = iconSet && (!option.assetName.startsWith('sticker-') || ICON_SETS_WITH_STICKERS.has(iconSet))
    return themed ? (
      <ThemedIcon key={i} set={iconSet as string} name={option.assetName} size={20} className="mx-0.5 inline-block align-text-bottom" />
    ) : (
      <span key={i} className="mx-0.5">{option.emoji}</span>
    )
  })
}

// Deterministic 0-1 pseudo-random value from a string seed (e.g. a message
// id) — same message always gets the same "random" look on every render,
// instead of the grain/leaf jittering around every time React re-renders.
function seededRandom(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return (h % 1000) / 1000
}

// The burrow theme's message bubbles look like text sitting on a wood
// plank — built from layered CSS gradients (not an SVG/image asset) so the
// grain stretches correctly to fit each message's own width/height instead
// of a fixed-size texture repeating oddly on short vs. long messages.
function woodPlankStyle(seed: string): React.CSSProperties {
  const r1 = seededRandom(seed)
  const r2 = seededRandom(`${seed}-b`)
  const angle = 88 + r1 * 4 // near-vertical grain, varies slightly per message
  const stripe = 9 + r2 * 10
  return {
    backgroundImage: [
      `repeating-linear-gradient(${angle}deg, rgba(122,75,38,0.32) 0px, rgba(122,75,38,0.32) 1.5px, transparent 1.5px, transparent ${stripe}px)`,
      `repeating-linear-gradient(${angle}deg, rgba(74,46,24,0.22) 0px, transparent 2.5px, transparent ${stripe * 1.7}px)`,
      'linear-gradient(155deg, #CBA06B, #9C6B3E)',
    ].join(', '),
  }
}

// A few light, randomly-placed leaf sprigs decorating each burrow-theme
// bubble — position/rotation seeded per message so it's stable, not
// re-randomized on every render.
// Fixed, well-spread anchor slots (corners + mid-edges) — picking distinct
// slots out of this fixed set guarantees leaves never land too close to
// each other, regardless of how the seeded shuffle picks them.
const LEAF_ANCHORS: React.CSSProperties[] = [
  { top: 3, left: 4 },
  { top: 3, right: 4 },
  { bottom: 3, left: 4 },
  { bottom: 3, right: 4 },
  { top: '45%', left: 2 },
  { top: '45%', right: 2 },
]

// Seeded Fisher-Yates pick of `count` distinct anchors — stable per message
// (same shuffle every render), not just per-bubble-random each time.
function pickLeafAnchors(seed: string, count: number): React.CSSProperties[] {
  const indices = LEAF_ANCHORS.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(`${seed}-shuffle-${i}`) * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices.slice(0, count).map((idx) => LEAF_ANCHORS[idx])
}

function LeafSprig({ seed, anchor }: { seed: string; anchor: React.CSSProperties }) {
  const r = seededRandom(`${seed}-leaf`)
  const rotate = -20 + r * 40
  return (
    <svg
      viewBox="0 0 24 24"
      width={15}
      height={15}
      className="pointer-events-none absolute opacity-70"
      style={{ ...anchor, transform: `rotate(${rotate}deg)` }}
      aria-hidden="true"
    >
      <path d="M12 3c4 2 6 6 5 11-4 1-8-1-9-5-1-3 .5-5 4-6Z" fill="#3E5C3A" stroke="#2B1F16" strokeWidth="1" />
      <path d="M12 4c1 3 1.5 6 .5 9" stroke="#2B1F16" strokeWidth="0.7" fill="none" />
    </svg>
  )
}

function hexAlpha(hex: string, alphaHex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alphaHex}` : hex
}

// The header bar (behind the "Private Chat" title) gets a soft multi-color
// wash derived from the room's own theme colors — a small, contained echo of
// the room's palette instead of stopping dead at the flat app header. Kept
// low-opacity and horizontal since the header is a shallow bar, not a full
// canvas for radial blobs.
function headerAccentStyle(
  primary?: string | null,
  secondary?: string | null,
  quaternary?: string | null
): React.CSSProperties | undefined {
  if (!primary && !secondary) return undefined
  const a = primary || secondary!
  const b = secondary || primary!
  // Both colors blended evenly across the whole bar (not one side pure a /
  // other side pure b) so the header reads as one continuous wash matching
  // the blurred wallpaper glow below it, instead of a distinct two-tone strip.
  const stops = [`linear-gradient(90deg, ${hexAlpha(a, '22')} 0%, ${hexAlpha(b, '22')} 50%, ${hexAlpha(a, '22')} 100%)`]
  if (quaternary) {
    stops.push(`radial-gradient(ellipse 60% 160% at 50% 50%, ${hexAlpha(quaternary, '16')} 0%, transparent 70%)`)
  }
  return { backgroundImage: stops.join(', ') }
}

// The outer frame behind the chat card takes on the room's own wallpaper,
// scaled up and heavily blurred so only its ambient color/mood bleeds out —
// like a blurred edge-glow behind an album cover — instead of a literal
// second copy of the artwork. Renders as an empty layer (no children), so
// the blur can never affect real content sitting on top of it.
function ambientWallpaperStyle(css?: string | null): React.CSSProperties | undefined {
  if (!css) return undefined
  return {
    backgroundImage: css,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: 'rgb(var(--color-bg))',
    transform: 'scale(1.3)',
    filter: 'blur(64px) saturate(1.3)',
    opacity: 0.55,
  }
}

function resolveWallpaperCss(info: { wallpaperUrl?: string | null; wallpaperPreset?: string | null }): string | undefined {
  if (info.wallpaperUrl) return `url(${info.wallpaperUrl})`
  return WALLPAPER_PRESETS.find((w) => w.id === info.wallpaperPreset)?.css || undefined
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

const SWIPE_REPLY_MAX = 56
const SWIPE_REPLY_THRESHOLD = 40

// Drag a message bubble rightward to reply to it — the standard mobile chat
// gesture (Zalo/Messenger/Telegram), since the hover-only reply button below
// each bubble is unreachable on touch devices.
function SwipeToReply({ onReply, disabled, children }: { onReply: () => void; disabled?: boolean; children: React.ReactNode }) {
  const [dragX, setDragX] = useState(0)
  const startXRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const triggeredRef = useRef(false)

  const endDrag = () => {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (triggeredRef.current) onReply()
    setDragX(0)
    startXRef.current = null
    triggeredRef.current = false
  }

  return (
    <div
      onPointerDown={(e) => {
        if (disabled) return
        startXRef.current = e.clientX
        draggingRef.current = true
        triggeredRef.current = false
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current || startXRef.current === null) return
        const delta = Math.max(0, Math.min(e.clientX - startXRef.current, SWIPE_REPLY_MAX))
        setDragX(delta)
        if (delta > SWIPE_REPLY_THRESHOLD && !triggeredRef.current) {
          triggeredRef.current = true
          if ('vibrate' in navigator) navigator.vibrate(10)
        }
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      className="relative"
      style={{ touchAction: 'pan-y' }}
    >
      <Reply
        size={16}
        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-accent-soft"
        style={{ opacity: dragX / SWIPE_REPLY_MAX }}
      />
      <div style={{ transform: `translateX(${dragX}px)`, transition: draggingRef.current ? 'none' : 'transform 150ms ease-out' }}>
        {children}
      </div>
    </div>
  )
}

function LinkPreviewCard({
  message,
  opaque,
  accentColor,
}: {
  message: ChatMessage
  opaque?: boolean
  accentColor?: string | null
}) {
  const preview = message.link_preview
  if (!preview) return null
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer"
      className={`mb-1.5 flex max-w-[75%] items-center gap-3 overflow-hidden rounded-xl border border-overlay/[0.08] backdrop-blur-md transition-colors ${
        opaque ? 'bg-background/60 hover:bg-background/70' : 'bg-overlay/[0.04] hover:bg-overlay/[0.07]'
      }`}
    >
      {preview.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.image} alt="" className="h-16 w-16 shrink-0 object-cover" />
      )}
      <div className={`min-w-0 flex-1 py-2 pr-3 ${preview.image ? '' : 'pl-3'}`}>
        <p className="truncate text-sm font-medium text-fg">{preview.title}</p>
        {preview.description && <p className="line-clamp-2 text-xs text-muted">{preview.description}</p>}
        <span className={`mt-0.5 flex items-center gap-1 text-[10px] ${accentColor ? '' : 'text-accent-soft'}`} style={accentColor ? { color: accentColor } : undefined}>
          <ExternalLink size={9} /> {preview.siteName}
        </span>
      </div>
    </a>
  )
}

function FileAttachment({ message }: { message: ChatMessage }) {
  // image_url is the legacy column from before image/video/file uploads were
  // unified onto one direct-to-Cloudinary path — old messages still use it.
  const url = message.file_url ?? message.image_url ?? null
  if (!url) return null
  const resourceType = message.file_url ? message.file_resource_type : 'image'

  if (resourceType === 'video') {
    return (
      <video
        controls
        src={url}
        className="mb-1.5 max-h-64 max-w-full rounded-xl border border-overlay/[0.08] shadow-lg"
      />
    )
  }
  if (resourceType === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mb-1.5 block max-w-[75%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="max-h-64 rounded-xl border border-overlay/[0.08] object-cover shadow-lg" />
      </a>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={message.file_name ?? undefined}
      className="mb-1.5 flex max-w-[75%] items-center gap-2.5 rounded-xl border border-overlay/[0.08] bg-overlay/[0.04] px-3.5 py-2.5 text-sm text-fg transition-colors hover:bg-overlay/[0.08]"
    >
      <FileIcon size={18} className="shrink-0 text-accent-soft" />
      <span className="min-w-0 flex-1 truncate">{message.file_name ?? 'File'}</span>
      {typeof message.file_bytes === 'number' && (
        <span className="shrink-0 text-xs text-muted">{formatFileSize(message.file_bytes)}</span>
      )}
    </a>
  )
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
        roomIconUrl: data.roomIconUrl ?? null,
        moodOptions: data.moodOptions ?? null,
        reactionEmojis: data.reactionEmojis ?? null,
        fontOptions: data.fontOptions ?? null,
        wallpaperPreset: data.wallpaperPreset ?? null,
        wallpaperUrl: data.wallpaperUrl ?? null,
        primaryColor: data.primaryColor ?? null,
        secondaryColor: data.secondaryColor ?? null,
        tertiaryColor: data.tertiaryColor ?? null,
        quaternaryColor: data.quaternaryColor ?? null,
        themeFont: data.themeFont ?? null,
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

        <div className="relative rounded-3xl border border-overlay/[0.08] bg-overlay/[0.03] p-8 backdrop-blur-xl">
          <div className="mb-7 flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/[0.12] shadow-[0_0_28px_rgba(124,58,237,0.35)]">
              <Lock size={22} className="text-accent-soft" />
            </div>
            <div className="text-center">
              <h2 className="font-display text-xl font-bold text-fg">Private Chat</h2>
              <p className="mt-1 text-sm text-muted">Nhập mã PIN để tham gia đoạn chat</p>
            </div>
          </div>

          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') checkPin() }}
            inputMode="numeric"
            placeholder="• • • • • •"
            className="w-full rounded-2xl border border-overlay/[0.08] bg-overlay/[0.04] px-4 py-4 text-center font-mono text-2xl tracking-[0.5em] text-fg outline-none transition-all placeholder-fg/20 focus:border-accent/60 focus:bg-overlay/[0.06] focus:ring-2 focus:ring-accent/20"
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

      <div className="relative rounded-3xl border border-overlay/[0.08] bg-overlay/[0.03] p-8 backdrop-blur-xl">
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/[0.12] shadow-[0_0_28px_rgba(124,58,237,0.35)]">
            <MessageCircle size={22} className="text-accent-soft" />
          </div>
          <div className="text-center">
            <h2 className="font-display text-xl font-bold text-fg">{room.name}</h2>
            <p className="mt-1 text-sm text-muted">Nhập tên hiển thị của bạn</p>
          </div>
        </div>

        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') join() }}
          placeholder="Tên hiển thị"
          className="w-full rounded-2xl border border-overlay/[0.08] bg-overlay/[0.04] px-4 py-3.5 text-base text-fg outline-none transition-all placeholder-fg/40 focus:border-accent/60 focus:bg-overlay/[0.06] focus:ring-2 focus:ring-accent/20"
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
          className="mt-3 w-full text-center text-xs text-muted transition-colors hover:text-fg"
        >
          ← Nhập PIN khác
        </button>
      </div>
    </div>
  )
}

function ChatScreen({
  session,
  onLeave,
  onThemeChange,
  onOverlayChange,
}: {
  session: Session
  onLeave: () => void
  onThemeChange: (
    primary?: string | null,
    secondary?: string | null,
    tertiary?: string | null,
    quaternary?: string | null,
    wallpaperCss?: string
  ) => void
  onOverlayChange: (open: boolean) => void
}) {
  // Room customization (mood/reaction/font options, wallpaper, bubble
  // colors, theme font, name, icon, anniversary) is only ever set on the
  // session object at join time — a device that joined before an admin
  // changed any of it would otherwise show stale data forever until the
  // user manually left and rejoined. Refreshed from the server on mount.
  const [roomInfo, setRoomInfo] = useState(session)
  useEffect(() => {
    onThemeChange(
      session.primaryColor,
      session.secondaryColor,
      session.tertiaryColor,
      session.quaternaryColor,
      resolveWallpaperCss(session)
    )
    let cancelled = false
    fetch(`/api/chat/room-info?roomId=${session.roomId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || data.error) return
        setRoomInfo((prev) => {
          const next = { ...prev, ...data }
          try {
            const raw = localStorage.getItem(SESSION_KEY)
            if (raw) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...JSON.parse(raw), ...data }))
          } catch {
            // best-effort cache fixup
          }
          onThemeChange(next.primaryColor, next.secondaryColor, next.tertiaryColor, next.quaternaryColor, resolveWallpaperCss(next))
          return next
        })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.roomId])

  const moodOptions = roomInfo.moodOptions && roomInfo.moodOptions.length > 0 ? roomInfo.moodOptions : DEFAULT_MOOD_OPTIONS
  const reactionEmojis = roomInfo.reactionEmojis && roomInfo.reactionEmojis.length > 0 ? roomInfo.reactionEmojis : DEFAULT_REACTION_EMOJIS
  const fontOptions = roomInfo.fontOptions && roomInfo.fontOptions.length > 0 ? roomInfo.fontOptions : FONT_CATALOG
  const wallpaperCss = roomInfo.wallpaperUrl ? undefined : resolveWallpaperCss(roomInfo)
  const hasWallpaper = Boolean(roomInfo.wallpaperUrl || wallpaperCss)
  // Themes with their own hand-drawn icon set (see public/icons/<slug>/) —
  // swapped in only for a room actually using that wallpaper preset, never
  // touching the app's default lucide icons for any other room.
  const ICON_SET_SLUGS = ['mosaic', 'burrow']
  const iconSet = ICON_SET_SLUGS.includes(roomInfo.wallpaperPreset ?? '') ? (roomInfo.wallpaperPreset as string) : null
  const hasStickerSet = iconSet !== null && ICON_SETS_WITH_STICKERS.has(iconSet)
  // Burrow's bubbles get a wood-plank look instead of the usual theme-color
  // fill — a dark cocoa ink for text so it reads over the light tan wood.
  const isBurrow = roomInfo.wallpaperPreset === 'burrow'
  const burrowInk = '#2B1F16'
  const themeColor = roomInfo.primaryColor
  // Informational highlight color (pinned message, link previews, chosen
  // reactions) and a quieter secondary accent (outer aurora's extra blob) —
  // fall back to the fixed app accent/muted styling when a room hasn't set them.
  const tertiaryColor = roomInfo.tertiaryColor
  const quaternaryColor = roomInfo.quaternaryColor
  // Applied to the screen's own chrome text (room name, labels, empty
  // states) — never message content, which always sets its own explicit
  // font (see fontStyleFor's default case) and so never inherits this.
  const chromeFontStyle = roomInfo.themeFont ? fontStyleFor(roomInfo.themeFont) : undefined

  // A locally-cached session (from an older app version, or corrupted) can
  // have a stale/wrong roomType — the mood endpoint always returns the
  // server's actual room type, which corrects this in-memory and in the
  // cached session going forward.
  const [roomType, setRoomType] = useState(session.roomType)
  const roomTypeRef = useRef(roomType)
  useEffect(() => { roomTypeRef.current = roomType }, [roomType])

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const hasText = Boolean(input.trim())
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [style, setStyle] = useState<MessageStyle>(DEFAULT_STYLE)
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const [replyingTo, setReplyingTo] = useState<{ id: string; nickname: string; preview: string } | null>(null)
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessage | null>(null)
  const [seenMap, setSeenMap] = useState<Map<string, string>>(new Map())
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  const [activeActionsFor, setActiveActionsFor] = useState<string | null>(null)
  const [showCapsulePicker, setShowCapsulePicker] = useState(false)
  const [capsuleAt, setCapsuleAt] = useState('')
  const [ownMood, setOwnMood] = useState<string | null>(null)
  const [otherMood, setOtherMood] = useState<string | null>(null)
  const [showMoodPicker, setShowMoodPicker] = useState(false)
  const [showGesturePicker, setShowGesturePicker] = useState(false)
  const [showStickerPicker, setShowStickerPicker] = useState(false)
  const [gestureOverlay, setGestureOverlay] = useState<{ emoji: string; nickname: string; label: string } | null>(null)
  const [showToolsMenu, setShowToolsMenu] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; nickname: string; content: string | null; created_at: string }[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  useEffect(() => {
    onOverlayChange(showSearch || showGallery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSearch, showGallery])
  const [galleryItems, setGalleryItems] = useState<
    { id: string; nickname: string; image_url: string | null; file_url: string | null; file_name: string | null; file_resource_type: string | null; created_at: string }[]
  >([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryHasMore, setGalleryHasMore] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<{ url: string; resourceType: string | null } | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [fileUploadStatus, setFileUploadStatus] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [fileError, setFileError] = useState('')
  const [oversizePassword, setOversizePassword] = useState('')
  const [oversizePasswordError, setOversizePasswordError] = useState('')
  const [verifyingPassword, setVerifyingPassword] = useState(false)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)

  // Closes any open popover (tools menu + its style/capsule/gesture panels,
  // mood picker, per-message reaction/actions) when tapping/clicking outside
  // it — elements belonging to a popover are tagged with
  // data-popover-group so clicks inside them don't close their own group.
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as Element
      if (!target.closest('[data-popover-group="tools"]')) {
        setShowToolsMenu(false)
        setShowStylePicker(false)
        setShowCapsulePicker(false)
        setShowGesturePicker(false)
        setShowStickerPicker(false)
      }
      if (!target.closest('[data-popover-group="mood"]')) setShowMoodPicker(false)
      if (!target.closest('[data-popover-group="actions"]')) {
        setReactionPickerFor(null)
        setActiveActionsFor(null)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  const deviceId = useRef(getDeviceId())
  const nearBottomRef = useRef(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
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

    // Render instantly from the last locally-cached snapshot, then quietly
    // ask the server only for what arrived since — avoids blocking the UI on
    // a full refetch every time the room is opened, while still always
    // reconciling with the server on load.
    const cached = loadCachedMessages<ChatMessage>(session.roomId)
    if (cached) {
      setMessages(cached)
      setHasMore(true)
      initialLoadDone.current = true
      setInitialLoading(false)
      markSeen()
    }
    const since = cached ? cached[cached.length - 1].created_at : undefined
    const url = since
      ? `/api/chat/messages?roomId=${session.roomId}&deviceId=${deviceId.current}&after=${encodeURIComponent(since)}`
      : `/api/chat/messages?roomId=${session.roomId}&deviceId=${deviceId.current}`

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.messages) return
        if (since) {
          if (data.messages.length > 0) {
            setMessages((prev) => {
              const known = new Set(prev.map((m: ChatMessage) => m.id))
              const fresh = (data.messages as ChatMessage[]).filter((m) => !known.has(m.id))
              return fresh.length > 0 ? [...prev, ...fresh] : prev
            })
          }
        } else {
          setMessages(data.messages)
          setHasMore(Boolean(data.hasMore))
        }
        initialLoadDone.current = true
        markSeen()
      })
      .finally(() => { if (!cancelled) setInitialLoading(false) })
    fetch(`/api/chat/pin?roomId=${session.roomId}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setPinnedMessage(data.message ?? null) })
    fetch(`/api/chat/mood?roomId=${session.roomId}&deviceId=${deviceId.current}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const serverRoomType: 'group' | 'solo' = data.roomType === 'solo' ? 'solo' : 'group'
        if (serverRoomType !== roomType) {
          setRoomType(serverRoomType)
          try {
            const raw = localStorage.getItem(SESSION_KEY)
            if (raw) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...JSON.parse(raw), roomType: serverRoomType }))
          } catch {
            // best-effort cache fixup — not worth failing the mood load over
          }
        }
        if (serverRoomType === 'solo') {
          // Solo rooms are one person across possibly several devices — there
          // is no "yours vs theirs", just whichever device set a mood most
          // recently (not necessarily this device's own row).
          setOwnMood(data.sharedMood ?? null)
        } else {
          setOwnMood(data.ownMood ?? null)
          setOtherMood(data.otherMood ?? null)
        }
      })
    return () => { cancelled = true }
  }, [session.roomId, markSeen])

  useEffect(() => {
    if (!initialLoadDone.current) return
    saveCachedMessages(session.roomId, messages)
  }, [messages, session.roomId])

  // Jumps to a message currently in the loaded/rendered window and briefly
  // flashes it — used both for the notification deep-link and for tapping a
  // reply preview to find the message it quotes. No-ops if the message isn't
  // loaded (e.g. further back than the current pagination window).
  const scrollToMessage = useCallback((id: string) => {
    const el = scrollRef.current?.querySelector(`[data-message-id="${id}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightMessageId(id)
    setTimeout(() => setHighlightMessageId(null), 2000)
  }, [])

  // A notification click deep-links to the message it was about
  // (?messageId=...) — jump straight to it so it's obvious which one just
  // arrived, instead of dropping the user at the bottom to hunt for it.
  useEffect(() => {
    if (!initialLoadDone.current) return
    const targetId = new URLSearchParams(window.location.search).get('messageId')
    if (!targetId) return
    const el = scrollRef.current?.querySelector(`[data-message-id="${targetId}"]`)
    if (!el) return
    scrollToMessage(targetId)
    window.history.replaceState(null, '', window.location.pathname)
  }, [messages, scrollToMessage])

  // Debounced search-as-you-type — waits for a pause in typing before
  // hitting the server, so every keystroke doesn't fire a request.
  useEffect(() => {
    if (!showSearch) return
    const q = searchQuery.trim()
    if (!q) { setSearchResults(null); return }
    setSearchLoading(true)
    const timer = setTimeout(() => {
      fetch(`/api/chat/search?roomId=${session.roomId}&deviceId=${deviceId.current}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => setSearchResults(data.results ?? []))
        .finally(() => setSearchLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, showSearch, session.roomId])

  const jumpToSearchResult = useCallback(async (id: string, createdAt: string) => {
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults(null)
    if (!scrollRef.current?.querySelector(`[data-message-id="${id}"]`)) {
      const res = await fetch(
        `/api/chat/messages?roomId=${session.roomId}&deviceId=${deviceId.current}&around=${encodeURIComponent(createdAt)}`
      )
      const data = await res.json()
      if (data.messages) {
        setMessages((prev) => {
          const known = new Set(prev.map((m: ChatMessage) => m.id))
          const fresh = (data.messages as ChatMessage[]).filter((m) => !known.has(m.id))
          return [...fresh, ...prev].sort((a, b) => a.created_at.localeCompare(b.created_at))
        })
      }
    }
    requestAnimationFrame(() => scrollToMessage(id))
  }, [session.roomId, scrollToMessage])

  const loadGallery = useCallback(async (before?: string) => {
    setGalleryLoading(true)
    try {
      const url = `/api/chat/media?roomId=${session.roomId}&deviceId=${deviceId.current}${before ? `&before=${encodeURIComponent(before)}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.items) {
        setGalleryItems((prev) => (before ? [...prev, ...data.items] : data.items))
        setGalleryHasMore(Boolean(data.hasMore))
      }
    } finally {
      setGalleryLoading(false)
    }
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
    // Fire well before the user hits the actual top, so older messages are
    // already in by the time they'd notice the edge — feels endless instead
    // of "scroll, wait, see a spinner, scroll again".
    if (container.scrollTop < 350) loadMore()

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const nearBottom = distanceFromBottom < 150
    nearBottomRef.current = nearBottom
    if (nearBottom) setNewMessageCount(0)
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
    const channel = supabase.channel(`chat-room-${session.roomId}`)
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
    channel.on('broadcast', { event: 'mood' }, (payload) => {
      const { deviceId: fromDeviceId, mood } = payload.payload as { deviceId: string; mood: string | null }
      if (fromDeviceId === deviceId.current) return
      if (roomTypeRef.current === 'solo') setOwnMood(mood)
      else setOtherMood(mood)
    })
    channel.subscribe()
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


  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
  const lastMessageId = lastMessage?.id ?? null
  const lastMessageIdRef = useRef<string | null>(null)
  const hasScrolledOnceRef = useRef(false)
  useEffect(() => {
    if (!initialLoadDone.current) return
    if (lastMessageId !== lastMessageIdRef.current) {
      const isFirstScroll = !hasScrolledOnceRef.current
      hasScrolledOnceRef.current = true
      const isOwnMessage = lastMessage?.device_id === deviceId.current
      // Always jump to your own outgoing message. Otherwise, only auto-scroll
      // if the user was already near the bottom — if they're reading back
      // through older messages, an incoming message shouldn't yank them away.
      if (isFirstScroll || isOwnMessage || nearBottomRef.current) {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: isFirstScroll ? 'auto' : 'smooth' })
        })
        setNewMessageCount(0)
      } else {
        setNewMessageCount((n) => n + 1)
      }
    }
    lastMessageIdRef.current = lastMessageId
  }, [lastMessageId, lastMessage])

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
    if (!content) return
    const reply = replyingTo
    const revealAt = capsuleAt ? new Date(capsuleAt).toISOString() : undefined
    const sentStyle = style
    setInput('')
    if (messageInputRef.current) messageInputRef.current.style.height = 'auto'
    setReplyingTo(null)
    setCapsuleAt('')
    setShowCapsulePicker(false)

    const clientId = crypto.randomUUID()
    const payload = {
      roomId: session.roomId,
      deviceId: deviceId.current,
      content,
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
    // Keep the textarea focused (and the on-screen keyboard open) after
    // sending — tapping the Send button would otherwise steal focus.
    messageInputRef.current?.focus()
  }, [input, style, replyingTo, capsuleAt, session.roomId, session.nickname, performSend])

  const sendGesture = async (gestureId: string) => {
    setShowGesturePicker(false)
    await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, deviceId: deviceId.current, gesture: gestureId }),
    })
  }

  // Inserts an ":id:" token at the end of whatever's already typed, so a
  // sticker/gesture icon becomes part of the same message as regular text.
  const insertIconToken = (id: string) => {
    handleInputChange(`${input}${input.endsWith(' ') || !input ? '' : ' '}:${id}: `)
    messageInputRef.current?.focus()
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
    channelRef.current?.send({ type: 'broadcast', event: 'mood', payload: { deviceId: deviceId.current, mood } })
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

  const pickMedia = () => mediaInputRef.current?.click()
  const pickAttachment = () => attachmentInputRef.current?.click()

  const isOversizeRecentlyDismissed = () => {
    const raw = localStorage.getItem(OVERSIZE_DISMISS_KEY)
    if (!raw) return false
    const elapsedMs = Date.now() - new Date(raw).getTime()
    return elapsedMs < CHAT_OVERSIZE_DISMISS_DAYS * 24 * 60 * 60 * 1000
  }

  const uploadAndSendFile = async (file: File, adminPassword?: string) => {
    setFileUploadStatus('uploading')
    setFileError('')
    const caption = input.trim()

    let signature: string, timestamp: number, apiKey: string, cloudName: string, folder: string
    try {
      const signRes = await fetch('/api/chat/upload-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: session.roomId, deviceId: deviceId.current }),
      })
      const signData = await signRes.json().catch(() => ({}))
      if (!signRes.ok) throw new Error(signData.error || 'sign failed')
      ;({ signature, timestamp, apiKey, cloudName, folder } = signData)
      if (!signature || !cloudName || !apiKey) throw new Error('sign response missing fields')
    } catch (err) {
      console.error('[chat upload] sign step failed', err)
      setFileUploadStatus('error')
      setFileError(`Không thể chuẩn bị tải lên: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    let uploaded: { secure_url?: string; public_id?: string; bytes?: number; resource_type?: string; error?: { message?: string } }
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('api_key', apiKey)
      form.append('timestamp', String(timestamp))
      form.append('signature', signature)
      form.append('folder', folder)

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: 'POST',
        body: form,
      })
      uploaded = await uploadRes.json()
      if (!uploadRes.ok || !uploaded.secure_url) throw new Error(uploaded.error?.message || `upload failed (${uploadRes.status})`)
    } catch (err) {
      console.error('[chat upload] cloudinary upload failed', err)
      setFileUploadStatus('error')
      setFileError(`Tải file lên Cloudinary thất bại: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: session.roomId,
          deviceId: deviceId.current,
          content: caption || undefined,
          file: {
            url: uploaded.secure_url,
            publicId: uploaded.public_id,
            bytes: uploaded.bytes,
            name: file.name,
            resourceType: uploaded.resource_type,
          },
          adminPassword,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'send failed')
      }
      setInput('')
      if (messageInputRef.current) messageInputRef.current.style.height = 'auto'
      setFileUploadStatus('idle')
    } catch (err) {
      console.error('[chat upload] send step failed', err)
      setFileUploadStatus('error')
      setFileError(`Đã tải file lên nhưng gửi tin nhắn thất bại: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const onAttachmentSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileError('')

    if (file.size <= CHAT_MAX_FILE_SIZE_BYTES) {
      uploadAndSendFile(file)
      return
    }

    if (isOversizeRecentlyDismissed()) {
      setFileError(`Vượt quá giới hạn ${CHAT_MAX_FILE_SIZE_MB}MB, không thể tải lên.`)
      return
    }

    setPendingFile(file)
    setOversizePassword('')
    setOversizePasswordError('')
  }

  const confirmOversizePassword = async () => {
    if (!pendingFile || !oversizePassword) return
    setVerifyingPassword(true)
    setOversizePasswordError('')
    try {
      const res = await fetch('/api/chat/verify-admin-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: oversizePassword }),
      })
      const data = await res.json()
      if (!data.ok) {
        setOversizePasswordError('Sai mật khẩu')
        return
      }
      const file = pendingFile
      const password = oversizePassword
      setPendingFile(null)
      setOversizePassword('')
      uploadAndSendFile(file, password)
    } catch {
      setOversizePasswordError('Lỗi kết nối — thử lại nhé')
    } finally {
      setVerifyingPassword(false)
    }
  }

  const dismissOversizePrompt = () => {
    localStorage.setItem(OVERSIZE_DISMISS_KEY, new Date().toISOString())
    setPendingFile(null)
    setFileError(`Vượt quá giới hạn ${CHAT_MAX_FILE_SIZE_MB}MB, không thể tải lên.`)
  }

  const leave = () => {
    // keepalive lets the browser finish this request even if the tab/app is
    // closed right after tapping "Rời phòng" (a very common sequence on
    // mobile) — without it, a fire-and-forget fetch can get cancelled
    // mid-flight, leaving push_subscription un-cleared server-side so the
    // device keeps getting notified for a room it thinks it already left.
    fetch('/api/chat/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: session.roomId, deviceId: deviceId.current }),
      keepalive: true,
    }).catch(() => {})
    localStorage.removeItem(SESSION_KEY)
    onLeave()
  }

  const otherMoodColor = moodOptions.find((m) => m.id === otherMood)?.color
  const showSeenIndicator = roomType !== 'solo'
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
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-4" style={chromeFontStyle}>

      {/* ── Gesture overlay ─────────────────────────────────────── */}
      {gestureOverlay && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-xl animate-[panel-in_0.15s_ease-out]">
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-overlay/[0.08] bg-overlay/[0.05] px-10 py-8 backdrop-blur-xl">
            <span className="animate-gesture-burst text-8xl drop-shadow-[0_0_32px_rgba(124,58,237,0.7)]">
              {gestureOverlay.emoji}
            </span>
            <p className="font-display text-lg font-semibold text-fg">
              {gestureOverlay.nickname} đã gửi {gestureOverlay.label.toLowerCase()}!
            </p>
          </div>
        </div>
      )}

      {/* ── Search overlay ──────────────────────────────────────── */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background animate-[panel-in_0.15s_ease-out]">
          <div className="flex items-center gap-2 border-b border-overlay/[0.08] p-3">
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults(null) }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-overlay/[0.06] hover:text-fg"
            >
              <ArrowLeft size={17} />
            </button>
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tin nhắn..."
                className="w-full rounded-xl border border-overlay/[0.08] bg-overlay/[0.04] py-2 pl-9 pr-3 text-base text-fg outline-none placeholder-fg/40 focus:border-accent/60 sm:text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {searchLoading && (
              <p className="p-4 text-center text-xs text-muted">Đang tìm...</p>
            )}
            {!searchLoading && searchResults && searchResults.length === 0 && (
              <p className="p-4 text-center text-xs text-muted">Không tìm thấy tin nhắn nào</p>
            )}
            {!searchLoading && searchResults?.map((r) => (
              <button
                key={r.id}
                onClick={() => jumpToSearchResult(r.id, r.created_at)}
                className="flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-overlay/[0.06]"
              >
                <span className="flex w-full items-center justify-between gap-2 text-xs text-muted">
                  <span className="font-medium text-accent-soft">{r.nickname}</span>
                  <span className="shrink-0">{formatTime(r.created_at)}</span>
                </span>
                <span className="line-clamp-2 text-sm text-fg">{r.content}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Media gallery overlay ───────────────────────────────── */}
      {showGallery && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background animate-[panel-in_0.15s_ease-out]">
          <div className="flex items-center gap-2 border-b border-overlay/[0.08] p-3">
            <button
              onClick={() => setShowGallery(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-overlay/[0.06] hover:text-fg"
            >
              <ArrowLeft size={17} />
            </button>
            <h2 className="font-display text-sm font-semibold text-fg">Ảnh & file đã gửi</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {galleryItems.length === 0 && !galleryLoading && (
              <p className="p-8 text-center text-xs text-muted">Chưa có ảnh hay file nào</p>
            )}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {galleryItems.map((item) => {
                const url = item.file_url ?? item.image_url
                if (!url) return null
                const resourceType = item.file_url ? item.file_resource_type : 'image'
                if (resourceType === 'image' || resourceType === 'video') {
                  return (
                    <button
                      key={item.id}
                      onClick={() => setLightboxUrl({ url, resourceType })}
                      className="group relative aspect-square overflow-hidden rounded-lg bg-overlay/[0.04]"
                    >
                      {resourceType === 'video' ? (
                        <video src={url} className="h-full w-full object-cover" muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      )}
                      {resourceType === 'video' && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">▶</span>
                      )}
                    </button>
                  )
                }
                return (
                  <a
                    key={item.id}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    download={item.file_name ?? undefined}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg bg-overlay/[0.04] p-2 text-center transition-colors hover:bg-overlay/[0.08]"
                  >
                    <FileIcon size={20} className="text-accent-soft" />
                    <span className="line-clamp-2 text-[9px] text-muted">{item.file_name ?? 'File'}</span>
                  </a>
                )
              })}
            </div>
            {galleryHasMore && (
              <button
                onClick={() => loadGallery(galleryItems[galleryItems.length - 1]?.created_at)}
                disabled={galleryLoading}
                className="mx-auto mt-4 block rounded-xl border border-overlay/[0.08] px-4 py-2 text-xs text-muted transition-colors hover:text-fg disabled:opacity-40"
              >
                {galleryLoading ? 'Đang tải...' : 'Tải thêm'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Lightbox ─────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm animate-[panel-in_0.15s_ease-out]"
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X size={18} />
          </button>
          {lightboxUrl.resourceType === 'video' ? (
            <video src={lightboxUrl.url} controls autoPlay className="max-h-full max-w-full rounded-xl" onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightboxUrl.url} alt="" className="max-h-full max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-3 flex items-center gap-3 border-b border-overlay/[0.06] pb-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border shadow-[0_0_14px_rgba(124,58,237,0.2)] ${
            themeColor ? '' : 'border-accent/30 bg-accent/[0.10]'
          }`}
          style={themeColor ? { borderColor: `${themeColor}4D`, backgroundColor: `${themeColor}1A` } : undefined}
        >
          {roomInfo.roomIconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={roomInfo.roomIconUrl} alt="" className="h-full w-full object-cover" />
          ) : roomType === 'solo' ? (
            <BookOpen size={17} className={themeColor ? '' : 'text-accent-soft'} style={themeColor ? { color: themeColor } : undefined} />
          ) : (
            <MessageCircle size={17} className={themeColor ? '' : 'text-accent-soft'} style={themeColor ? { color: themeColor } : undefined} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-semibold text-fg" style={chromeFontStyle}>{roomInfo.roomName}</p>
          {roomInfo.anniversaryDate ? (
            <p className="mt-0.5 truncate text-xs font-medium text-accent-soft">
              💞 Yêu nhau được {daysSince(roomInfo.anniversaryDate)} ngày
            </p>
          ) : roomType !== 'solo' ? (
            <p className="mt-0.5 text-xs text-muted">Nhóm</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => { setShowGallery(true); loadGallery() }}
            title="Ảnh & file đã gửi"
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-overlay/[0.06] ${themeColor ? '' : 'text-muted hover:text-fg'}`}
            style={themeColor ? { color: themeColor } : undefined}
          >
            {iconSet ? <ThemedIcon set={iconSet} name="gallery" size={18} /> : <Images size={16} />}
          </button>
          <button
            onClick={() => setShowSearch(true)}
            title="Tìm tin nhắn"
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-overlay/[0.06] ${themeColor ? '' : 'text-muted hover:text-fg'}`}
            style={themeColor ? { color: themeColor } : undefined}
          >
            {iconSet ? <ThemedIcon set={iconSet} name="search" size={18} /> : <Search size={16} />}
          </button>
          {otherMood && (
            <span
              title={`Đối phương đang: ${moodOptions.find((m) => m.id === otherMood)?.label ?? ''}`}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-overlay/[0.08] bg-overlay/[0.04] text-lg"
            >
              {moodOptions.find((m) => m.id === otherMood)?.emoji}
            </span>
          )}
          <button
            data-popover-group="mood"
            onClick={() => setShowMoodPicker((v) => !v)}
            title="Trạng thái cảm xúc"
            className={`flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition-all hover:scale-110 ${
              showMoodPicker
                ? themeColor ? '' : 'border-accent/30 bg-accent/[0.12]'
                : themeColor ? '' : 'border-transparent hover:bg-overlay/[0.06]'
            }`}
            style={
              themeColor
                ? showMoodPicker
                  ? { borderColor: `${themeColor}4D`, backgroundColor: `${themeColor}1F` }
                  : { borderColor: `${themeColor}26` }
                : undefined
            }
          >
            {moodOptions.find((m) => m.id === ownMood)?.emoji ?? '🙂'}
          </button>
          <button
            onClick={leave}
            title="Rời phòng"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-all hover:bg-overlay/[0.06] hover:text-fg"
          >
            {iconSet ? <ThemedIcon set={iconSet} name="leave" size={17} /> : <LogOut size={15} />}
          </button>
        </div>
      </div>

      {/* ── Mood picker ─────────────────────────────────────────── */}
      {showMoodPicker && (
        <div data-popover-group="mood" className="mb-2 flex flex-wrap gap-1.5 rounded-2xl border border-overlay/[0.08] bg-overlay/[0.03] p-3 backdrop-blur-xl animate-panel-in">
          {moodOptions.map((m) => (
            <button
              key={m.id}
              onClick={() => changeMood(ownMood === m.id ? null : m.id)}
              title={m.label}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2 transition-all hover:scale-105 ${
                ownMood === m.id
                  ? themeColor ? '' : 'border-accent bg-accent/[0.15]'
                  : 'border-overlay/[0.06] bg-overlay/[0.03] hover:border-overlay/[0.14]'
              }`}
              style={ownMood === m.id && themeColor ? { borderColor: themeColor, backgroundColor: `${themeColor}26` } : undefined}
            >
              <span className="text-xl">{m.emoji}</span>
              <span className="text-[10px] text-muted">{m.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Pinned message ──────────────────────────────────────── */}
      {pinnedMessage && (
        <div
          className={`mb-2 flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 animate-panel-in ${
            tertiaryColor ? '' : 'border-accent/20 bg-accent/[0.07]'
          }`}
          style={tertiaryColor ? { borderColor: `${tertiaryColor}33`, backgroundColor: `${tertiaryColor}12` } : undefined}
        >
          {iconSet ? (
            <ThemedIcon set={iconSet} name="pin" size={13} className="shrink-0" />
          ) : (
            <Pin size={11} className={`shrink-0 ${tertiaryColor ? '' : 'text-accent-soft'}`} style={tertiaryColor ? { color: tertiaryColor } : undefined} />
          )}
          <span className={`flex-1 truncate text-xs ${tertiaryColor ? '' : 'text-accent-soft'}`} style={tertiaryColor ? { color: tertiaryColor } : undefined}>
            <b>{pinnedMessage.nickname}:</b> {pinnedMessage.content ?? '[Hình ảnh]'}
          </span>
          <button
            onClick={() => pinMessage(null)}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-fg"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {/* ── Message list ────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
      {/* Wallpaper stays put behind the scrolling content — doesn't scroll
          away with it. */}
      {(roomInfo.wallpaperUrl || wallpaperCss) && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl bg-cover bg-center"
          style={{ backgroundImage: roomInfo.wallpaperUrl ? `url(${roomInfo.wallpaperUrl})` : wallpaperCss }}
        />
      )}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`relative h-full space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-overlay/[0.06] bg-overlay/[0.02] p-4 ${
          roomInfo.wallpaperUrl || wallpaperCss ? '' : 'backdrop-blur-sm'
        }`}
        style={otherMoodColor ? { boxShadow: `inset 0 0 80px ${otherMoodColor}18` } : undefined}
      >
        {initialLoading ? (
          <div className="space-y-4 p-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="h-9 animate-pulse rounded-2xl bg-overlay/[0.05]"
                  style={{ width: `${40 + (i * 37) % 35}%` }}
                />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-overlay/[0.08] bg-overlay/[0.03]">
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
              <div className="mb-2 space-y-2" aria-hidden>
                {[68, 44, 56].map((w, i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className="h-9 animate-pulse rounded-2xl bg-overlay/[0.05]"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                ))}
              </div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const showDayDivider = roomType === 'solo' && (!prev || formatDayLabel(prev.created_at) !== formatDayLabel(m.created_at))

              if (m.device_id === 'system') {
                return (
                  <div key={m.id} data-message-id={m.id} className={highlightMessageId === m.id ? 'rounded-2xl transition-colors duration-1000 bg-accent/10' : 'rounded-2xl transition-colors duration-1000'}>
                    {showDayDivider && (
                      <div className="mb-3 flex items-center gap-3 text-[10px] font-medium uppercase tracking-widest text-muted">
                        <span className="h-px flex-1 bg-overlay/[0.06]" />
                        {formatDayLabel(m.created_at)}
                        <span className="h-px flex-1 bg-overlay/[0.06]" />
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

              const isJournal = roomType === 'solo'
              const mine = !isJournal && m.device_id === deviceId.current
              // Solo rooms can still span multiple devices for the same
              // person — alternate the theme color by which device actually
              // sent it instead of always using "mine".
              const isOwnDevice = m.device_id === deviceId.current
              const journalColor = isOwnDevice ? roomInfo.primaryColor : roomInfo.secondaryColor
              const reactions = m.chat_message_reactions ?? []
              const reactionGroups = new Map<string, number>()
              reactions.forEach((r) => reactionGroups.set(r.emoji, (reactionGroups.get(r.emoji) ?? 0) + 1))
              const myReaction = reactions.find((r) => r.device_id === deviceId.current)?.emoji
              const bubbleMaxWidth = isJournal ? 'max-w-full' : 'max-w-[75%]'
              const tailClass = isJournal ? '' : mine ? 'rounded-br-md' : 'rounded-bl-md'

              return (
                <div
                  key={m.id}
                  data-message-id={m.id}
                  className={`rounded-2xl transition-colors duration-1000 ${highlightMessageId === m.id ? 'bg-accent/10' : ''}`}
                >
                  {showDayDivider && (
                    <div className="mb-3 flex items-center gap-3 text-[10px] font-medium uppercase tracking-widest text-muted">
                      <span className="h-px flex-1 bg-overlay/[0.06]" />
                      {formatDayLabel(m.created_at)}
                      <span className="h-px flex-1 bg-overlay/[0.06]" />
                    </div>
                  )}
                  <div
                    className={`group flex animate-msg-in flex-col ${isJournal ? 'w-full items-start' : mine ? 'items-end' : 'items-start'} ${
                      m.reply_to_id ? (mine ? 'mr-3' : 'ml-3') : ''
                    }`}
                  >
                    {!mine && !isJournal && (
                      <span className="mb-1 text-[10px] font-medium text-muted">{m.nickname}</span>
                    )}

                    {m.reply_to_id && (
                      <div
                        onClick={() => scrollToMessage(m.reply_to_id!)}
                        className={`mb-1.5 ${bubbleMaxWidth} flex cursor-pointer items-start gap-1.5 rounded-xl border-l-2 ${
                          (isJournal ? journalColor : mine ? roomInfo.primaryColor : roomInfo.secondaryColor) ? '' : 'border-accent/40'
                        } bg-overlay/[0.04] px-2.5 py-1.5 text-xs text-muted backdrop-blur-sm transition-colors hover:bg-overlay/[0.07] ${mine ? 'text-right' : ''}`}
                        style={{
                          borderColor: (isJournal ? journalColor : mine ? roomInfo.primaryColor : roomInfo.secondaryColor) ?? undefined,
                        }}
                      >
                        {iconSet ? <ThemedIcon set={iconSet} name="reply" size={12} className="mt-0.5 shrink-0" /> : <Reply size={10} className="mt-0.5 shrink-0 text-accent-soft/70" />}
                        <span className="min-w-0 truncate">
                          <b className="text-accent-soft">{m.reply_to_nickname}</b>: {m.reply_to_content}
                        </span>
                      </div>
                    )}

                    <SwipeToReply
                      disabled={m.locked}
                      onReply={() => setReplyingTo({ id: m.id, nickname: m.nickname, preview: m.content ?? '[Hình ảnh]' })}
                    >
                    <div
                      data-popover-group="actions"
                      onClick={() => setActiveActionsFor((id) => (id === m.id ? null : m.id))}
                      className={`flex flex-col ${isJournal ? 'w-full items-start' : mine ? 'items-end' : 'items-start'} ${m.pending || m.failed ? 'opacity-50' : ''} transition-opacity`}
                    >
                      {m.locked ? (
                        <span className={`${bubbleMaxWidth} flex items-center gap-2 rounded-2xl border border-dashed border-overlay/[0.08] bg-overlay/[0.03] px-3.5 py-2.5 text-sm text-muted`}>
                          <Lock size={13} className="shrink-0" />
                          Tin nhắn hẹn giờ, mở lúc {m.reveal_at ? formatTime(m.reveal_at) : '...'}
                        </span>
                      ) : isJournal ? (
                        <div
                          className={`relative w-full overflow-x-auto border-l-2 ${
                            isBurrow ? '' : journalColor ? '' : 'border-accent/40'
                          } ${
                            isBurrow
                              ? 'rounded-r-xl py-2 pl-4 pr-3 shadow-inner'
                              : hasWallpaper
                                ? 'rounded-r-xl bg-background/60 py-2 pl-4 pr-3 backdrop-blur-md'
                                : journalColor
                                  ? 'rounded-r-xl py-2 pl-4 pr-3'
                                  : 'py-1 pl-4'
                          }`}
                          style={{
                            touchAction: 'pan-y',
                            ...(isBurrow
                              ? { borderColor: '#7A4B26', ...woodPlankStyle(m.id) }
                              : journalColor
                                ? { borderColor: journalColor }
                                : undefined),
                            // Tint each entry's own fill (not just the border) with
                            // its sender's theme color, so already-sent messages
                            // read as themed blocks — skipped over a wallpaper,
                            // where the translucent backing above already exists
                            // purely for text legibility and shouldn't be recolored.
                            ...(journalColor && !hasWallpaper && !isBurrow ? { backgroundColor: `${journalColor}22` } : undefined),
                          }}
                        >
                          {isBurrow &&
                            pickLeafAnchors(m.id, 3).map((anchor, i) => (
                              <LeafSprig key={i} seed={`${m.id}-${i}`} anchor={anchor} />
                            ))}
                          <LinkPreviewCard message={m} opaque={hasWallpaper} accentColor={tertiaryColor} />
                          <FileAttachment message={m} />
                          {m.content && (
                            <p
                              className="text-[15px] leading-relaxed text-fg"
                              style={{
                                ...fontStyleFor(m.font_family),
                                color: m.text_color ?? (isBurrow ? burrowInk : undefined),
                                fontWeight: m.bold ? 700 : undefined,
                                fontStyle: m.italic ? 'italic' : undefined,
                              }}
                            >
                              {renderMessageContent(m.content, iconSet)}
                            </p>
                          )}
                          {activeActionsFor === m.id && (
                            <span
                              className={`mt-1 block animate-panel-in text-[10px] ${hasWallpaper ? 'text-fg/80' : 'text-muted/70'}`}
                              style={hasWallpaper ? { textShadow: '0 1px 3px rgb(var(--color-bg) / 0.8)' } : undefined}
                            >
                              {formatTime(m.created_at)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
                          <LinkPreviewCard message={m} opaque={hasWallpaper} accentColor={tertiaryColor} />
                          <FileAttachment message={m} />
                          {m.content && (
                            <div
                              className={`relative max-w-[75%] overflow-x-auto rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${tailClass} ${
                                isBurrow
                                  ? 'border shadow-inner'
                                  : mine
                                    ? `text-white shadow-[0_2px_16px_rgba(124,58,237,0.35)] ${roomInfo.primaryColor ? '' : 'bg-gradient-to-br from-accent to-[#5b21b6]'}`
                                    : `text-fg backdrop-blur-sm ${roomInfo.secondaryColor ? 'border' : 'border border-overlay/[0.08] bg-overlay/[0.1]'}`
                              }`}
                              style={{
                                ...fontStyleFor(m.font_family),
                                ...(isBurrow
                                  ? { borderColor: '#7A4B26', ...woodPlankStyle(m.id) }
                                  : mine && roomInfo.primaryColor
                                    ? { backgroundColor: roomInfo.primaryColor }
                                    : !mine && roomInfo.secondaryColor
                                      ? { backgroundColor: `${roomInfo.secondaryColor}30`, borderColor: `${roomInfo.secondaryColor}55` }
                                      : undefined),
                                color: m.text_color ?? (isBurrow ? burrowInk : undefined),
                                fontWeight: m.bold ? 700 : undefined,
                                fontStyle: m.italic ? 'italic' : undefined,
                              }}
                            >
                              {isBurrow &&
                            pickLeafAnchors(m.id, 3).map((anchor, i) => (
                              <LeafSprig key={i} seed={`${m.id}-${i}`} anchor={anchor} />
                            ))}
                              {renderMessageContent(m.content, iconSet)}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    </SwipeToReply>

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
                                ? quaternaryColor ? '' : 'border-accent/40 bg-accent/[0.15]'
                                : 'border-overlay/[0.08] bg-overlay/[0.04]'
                            }`}
                            style={
                              myReaction === emoji && quaternaryColor
                                ? { borderColor: `${quaternaryColor}66`, backgroundColor: `${quaternaryColor}26` }
                                : undefined
                            }
                          >
                            {emoji} {count > 1 ? count : ''}
                          </button>
                        ))}
                      </div>
                    )}

                    <div
                      data-popover-group="actions"
                      className={`overflow-hidden transition-all duration-200 ease-out ${
                        activeActionsFor === m.id ? 'mt-1.5 max-h-10' : 'mt-0 max-h-0 group-hover:mt-1.5 group-hover:max-h-10'
                      }`}
                    >
                    <div
                      className={`flex items-center gap-0.5 rounded-full border border-overlay/[0.08] bg-overlay/[0.05] p-1 backdrop-blur-sm transition-opacity duration-150 ${isJournal ? 'ml-4' : ''} ${
                        activeActionsFor === m.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <button
                        title="Thả cảm xúc"
                        onClick={() => setReactionPickerFor(reactionPickerFor === m.id ? null : m.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-all hover:scale-110 hover:bg-overlay/[0.08] hover:text-fg"
                      >
                        {iconSet ? <ThemedIcon set={iconSet} name="reaction" size={16} /> : <SmilePlus size={13} />}
                      </button>
                      {!m.locked && (
                        <button
                          title="Trả lời"
                          onClick={() => {
                            setReplyingTo({ id: m.id, nickname: m.nickname, preview: m.content ?? '[Hình ảnh]' })
                            setActiveActionsFor(null)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-all hover:scale-110 hover:bg-overlay/[0.08] hover:text-fg"
                        >
                          {iconSet ? <ThemedIcon set={iconSet} name="reply" size={15} /> : <Reply size={13} />}
                        </button>
                      )}
                      <button
                        title="Ghim"
                        onClick={() => {
                          pinMessage(m.id)
                          setActiveActionsFor(null)
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-all hover:scale-110 hover:bg-overlay/[0.08] hover:text-fg"
                      >
                        {iconSet ? <ThemedIcon set={iconSet} name="pin" size={15} /> : <Pin size={13} />}
                      </button>
                    </div>
                    </div>

                    {reactionPickerFor === m.id && (
                      <div
                        data-popover-group="actions"
                        className={`mt-1.5 flex animate-panel-in gap-1.5 rounded-2xl border border-overlay/[0.08] bg-overlay/[0.06] px-3 py-2 shadow-xl backdrop-blur-xl ${isJournal ? 'ml-4' : ''}`}
                      >
                        {reactionEmojis.map((emoji) => (
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

      {newMessageCount > 0 && (
        <button
          onClick={() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
            setNewMessageCount(0)
          }}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-accent/30 bg-accent px-3.5 py-1.5 text-xs font-medium text-white shadow-lg shadow-accent/30 transition-transform hover:scale-105 animate-panel-in"
        >
          ↓ {newMessageCount} tin nhắn mới
        </button>
      )}
      </div>

      {/* ── Reply bar ───────────────────────────────────────────── */}
      {replyingTo && (
        <div className="mt-2 flex items-center gap-2.5 rounded-2xl border border-overlay/[0.08] bg-overlay/[0.03] px-3.5 py-2.5 text-xs animate-panel-in">
          {iconSet ? <ThemedIcon set={iconSet} name="reply" size={14} className="shrink-0" /> : <Reply size={12} className="shrink-0 text-accent-soft" />}
          <span className="flex-1 truncate text-muted">
            Trả lời <b className="text-accent-soft">{replyingTo.nickname}</b>: {replyingTo.preview}
          </span>
          <button
            onClick={() => setReplyingTo(null)}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-fg"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {fileUploadStatus === 'uploading' && (
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-overlay/[0.08] bg-overlay/[0.03] p-2.5 text-xs text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-transparent" />
          Đang tải file lên...
        </div>
      )}
      {fileError && <p className="mt-2 text-xs text-red-400">{fileError}</p>}

      {pendingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-overlay/[0.08] bg-[#111119] p-5 shadow-2xl">
            <p className="font-display font-semibold text-fg">File vượt quá {CHAT_MAX_FILE_SIZE_MB}MB</p>
            <p className="mt-1 text-xs text-muted">
              &quot;{pendingFile.name}&quot; ({formatFileSize(pendingFile.size)}) vượt giới hạn. Nhập mật khẩu admin để vẫn gửi.
            </p>
            <input
              type="password"
              value={oversizePassword}
              onChange={(e) => setOversizePassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmOversizePassword() }}
              placeholder="Mật khẩu admin"
              autoFocus
              className="mt-3 w-full rounded-xl border border-overlay/[0.08] bg-overlay/[0.03] px-4 py-2.5 text-base text-fg outline-none placeholder-fg/40 focus:border-accent/60 sm:text-sm"
            />
            {oversizePasswordError && <p className="mt-1.5 text-xs text-red-400">{oversizePasswordError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={dismissOversizePrompt}
                className="flex-1 rounded-xl border border-overlay/[0.08] bg-overlay/[0.03] py-2.5 text-sm text-muted transition-colors hover:text-fg"
              >
                Bỏ qua
              </button>
              <button
                onClick={confirmOversizePassword}
                disabled={verifyingPassword || !oversizePassword}
                className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
              >
                {verifyingPassword ? 'Đang kiểm tra...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Typing indicator ────────────────────────────────────── */}
      {typingUsers.size > 0 && (
        <div className="mt-2 flex w-fit items-center gap-2 rounded-full border border-overlay/[0.06] bg-overlay/[0.03] px-3 py-1.5 text-xs text-muted animate-panel-in">
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
        <div data-popover-group="tools" className="mt-2 flex items-center gap-2.5 rounded-2xl border border-overlay/[0.08] bg-overlay/[0.03] p-3 backdrop-blur-xl animate-panel-in">
          {iconSet ? <ThemedIcon set={iconSet} name="timer" size={16} className="shrink-0" /> : <Clock size={14} className="shrink-0 text-accent-soft" />}
          <span className="text-xs text-fg/70">Mở lúc</span>
          <input
            type="datetime-local"
            value={capsuleAt}
            onChange={(e) => setCapsuleAt(e.target.value)}
            className="flex-1 rounded-xl border border-overlay/[0.08] bg-overlay/[0.04] px-2.5 py-1.5 text-xs text-fg outline-none focus:border-accent/60"
          />
          <button
            onClick={() => { setCapsuleAt(''); setShowCapsulePicker(false) }}
            className="text-xs text-fg/70 transition-colors hover:text-fg"
          >
            Huỷ
          </button>
        </div>
      )}

      {/* ── Gesture picker ──────────────────────────────────────── */}
      {showGesturePicker && (
        <div data-popover-group="tools" className="mt-2 grid grid-cols-4 gap-2 rounded-2xl border border-overlay/[0.08] bg-overlay/[0.03] p-3 backdrop-blur-xl animate-panel-in">
          {GESTURE_OPTIONS.map((g) => (
            <button
              key={g.id}
              title={hasText ? `Chèn ${g.label.toLowerCase()} vào tin nhắn` : `Gửi ${g.label.toLowerCase()}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                // With text already typed, the icon becomes part of that
                // message instead of firing the old standalone fly-over
                // gesture — lets a message mix typed text and an icon.
                // Picker stays open after inserting so the user can tap
                // several icons in a row — it only closes on an outside tap
                // (handled by the shared popover-group click-away listener).
                if (hasText) {
                  insertIconToken(g.id)
                } else {
                  sendGesture(g.id)
                }
              }}
              className="flex flex-col items-center gap-1 rounded-xl border border-overlay/[0.06] bg-overlay/[0.03] py-2.5 text-xs text-muted transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:bg-accent/[0.07] hover:text-white"
            >
              {iconSet ? (
                <ThemedIcon set={iconSet} name={`gesture-${g.id}`} size={22} />
              ) : (
                <span className="text-xl">{g.emoji}</span>
              )}
              {g.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Sticker picker ──────────────────────────────────────── */}
      {showStickerPicker && (
        <div
          data-popover-group="tools"
          className="mt-2 grid max-h-56 grid-cols-5 gap-2 overflow-y-auto rounded-2xl border border-overlay/[0.08] bg-overlay/[0.03] p-3 backdrop-blur-xl animate-panel-in"
        >
          {STICKER_OPTIONS.map((s) => (
            <button
              key={s.id}
              title={`Chèn "${s.label.toLowerCase()}" vào tin nhắn`}
              onMouseDown={(e) => e.preventDefault()}
              // Stays open after inserting — tap several stickers in a row,
              // it only closes on an outside tap.
              onClick={() => insertIconToken(s.id)}
              className="flex flex-col items-center gap-1 rounded-xl border border-overlay/[0.06] bg-overlay/[0.03] py-2 text-[10px] text-muted transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:bg-accent/[0.07] hover:text-white"
            >
              {hasStickerSet ? (
                <ThemedIcon set={iconSet as string} name={`sticker-${s.id}`} size={22} />
              ) : (
                <span className="text-xl">{s.emoji}</span>
              )}
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Style picker ────────────────────────────────────────── */}
      {showStylePicker && (
        <div data-popover-group="tools" className="mt-2 space-y-3 rounded-2xl border border-overlay/[0.08] bg-overlay/[0.03] p-4 backdrop-blur-xl animate-panel-in">
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-fg/70">Màu chữ</span>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateStyle({ color: c === COLOR_PRESETS[0] ? null : c })}
                  title={c}
                  className={`h-7 w-7 rounded-full border-2 transition-all hover:scale-110 ${
                    (style.color ?? COLOR_PRESETS[0]) === c
                      ? 'border-white scale-110 shadow-lg'
                      : 'border-transparent hover:border-overlay/40'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-fg/70">Font chữ</span>
            <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
              {fontOptions.map((f) => (
                <button
                  key={f.id}
                  onClick={() => updateStyle({ font: f.id === 'sans' ? null : f.id })}
                  style={fontStyleFor(f.id)}
                  className={`shrink-0 rounded-xl border px-3 py-1 text-xs transition-all ${
                    (style.font ?? 'sans') === f.id
                      ? 'border-accent bg-accent/[0.15] text-accent-soft shadow-[0_0_12px_rgba(124,58,237,0.2)]'
                      : 'border-overlay/[0.08] bg-overlay/[0.03] text-fg/70 hover:text-fg'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-fg/70">Kiểu chữ</span>
            <div className="flex gap-2">
              <button
                onClick={() => updateStyle({ bold: !style.bold })}
                className={`h-8 w-8 rounded-xl border font-bold text-sm transition-all ${
                  style.bold
                    ? 'border-accent bg-accent/[0.15] text-accent-soft'
                    : 'border-overlay/[0.08] bg-overlay/[0.03] text-fg/70 hover:text-fg'
                }`}
              >
                B
              </button>
              <button
                onClick={() => updateStyle({ italic: !style.italic })}
                className={`h-8 w-8 rounded-xl border text-sm italic transition-all ${
                  style.italic
                    ? 'border-accent bg-accent/[0.15] text-accent-soft'
                    : 'border-overlay/[0.08] bg-overlay/[0.03] text-fg/70 hover:text-fg'
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
        <input ref={mediaInputRef} type="file" accept="image/*,video/*" onChange={onAttachmentSelected} className="hidden" />
        <input ref={attachmentInputRef} type="file" onChange={onAttachmentSelected} className="hidden" />

        <button
          data-popover-group="tools"
          // Keep the on-screen keyboard open when tapping "+" — a click would
          // otherwise move focus to this button and blur the textarea first.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const anyOpen = showToolsMenu || showStylePicker || showCapsulePicker || showGesturePicker || showStickerPicker
            if (anyOpen) {
              setShowToolsMenu(false)
              setShowStylePicker(false)
              setShowCapsulePicker(false)
              setShowGesturePicker(false)
              setShowStickerPicker(false)
            } else {
              setShowToolsMenu(true)
            }
          }}
          title="Thêm"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
            showToolsMenu || showStylePicker || showCapsulePicker || showGesturePicker || showStickerPicker
              ? `rotate-45 ${themeColor ? '' : 'border-accent/40 bg-accent/[0.15] text-accent-soft'}`
              : `border-overlay/[0.08] bg-overlay/[0.03] ${themeColor ? '' : 'text-muted hover:text-fg'}`
          }`}
          style={
            themeColor
              ? (showToolsMenu || showStylePicker || showCapsulePicker || showGesturePicker || showStickerPicker)
                ? { borderColor: `${themeColor}66`, backgroundColor: `${themeColor}26`, color: themeColor }
                : { color: themeColor }
              : undefined
          }
        >
          {iconSet ? <ThemedIcon set={iconSet} name="plus" size={20} /> : <Plus size={18} />}
        </button>

        {showToolsMenu && (
          <div data-popover-group="tools" className="absolute bottom-full left-0 mb-2 flex animate-panel-in gap-1.5 rounded-2xl border border-overlay/[0.08] bg-overlay/[0.06] p-2 shadow-2xl backdrop-blur-xl">
            {hasText && (
              <>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { pickMedia(); setShowToolsMenu(false) }}
                  title="Gửi ảnh/video"
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 hover:bg-overlay/[0.08] ${themeColor ? '' : 'text-muted hover:text-fg'}`}
                  style={themeColor ? { color: themeColor } : undefined}
                >
                  {iconSet ? <ThemedIcon set={iconSet} name="image" size={19} /> : <ImageIcon size={17} />}
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setShowStickerPicker((v) => !v); setShowToolsMenu(false) }}
                  title="Chèn biểu cảm"
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 ${
                    showStickerPicker ? (themeColor ? '' : 'bg-accent/[0.15] text-accent-soft') : 'text-muted hover:bg-overlay/[0.08] hover:text-fg'
                  }`}
                  style={showStickerPicker && themeColor ? { backgroundColor: `${themeColor}26`, color: themeColor } : undefined}
                >
                  {hasStickerSet ? <ThemedIcon set={iconSet as string} name="sticker-grin" size={19} /> : <span className="text-base">😄</span>}
                </button>
              </>
            )}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setShowGesturePicker((v) => !v); setShowToolsMenu(false) }}
              title="Gửi cử chỉ"
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 ${
                showGesturePicker ? (themeColor ? '' : 'bg-accent/[0.15] text-accent-soft') : themeColor ? '' : 'text-muted hover:bg-overlay/[0.08] hover:text-fg'
              }`}
              style={themeColor ? (showGesturePicker ? { backgroundColor: `${themeColor}26`, color: themeColor } : { color: themeColor }) : undefined}
            >
              <span className="text-base">🤗</span>
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setShowStylePicker((v) => !v); setShowToolsMenu(false) }}
              title="Tùy chỉnh kiểu chữ"
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 ${
                showStylePicker ? (themeColor ? '' : 'bg-accent/[0.15] text-accent-soft') : themeColor ? '' : 'text-muted hover:bg-overlay/[0.08] hover:text-fg'
              }`}
              style={themeColor ? (showStylePicker ? { backgroundColor: `${themeColor}26`, color: themeColor } : { color: themeColor }) : undefined}
            >
              {iconSet ? <ThemedIcon set={iconSet} name="font" size={17} /> : <Type size={15} />}
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setShowCapsulePicker((v) => !v); setShowToolsMenu(false) }}
              title="Tin nhắn hẹn giờ"
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 ${
                showCapsulePicker || capsuleAt ? (themeColor ? '' : 'bg-accent/[0.15] text-accent-soft') : themeColor ? '' : 'text-muted hover:bg-overlay/[0.08] hover:text-fg'
              }`}
              style={themeColor ? ((showCapsulePicker || capsuleAt) ? { backgroundColor: `${themeColor}26`, color: themeColor } : { color: themeColor }) : undefined}
            >
              {iconSet ? <ThemedIcon set={iconSet} name="timer" size={17} /> : <Clock size={15} />}
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { pickAttachment(); setShowToolsMenu(false) }}
              title={`Gửi file/video (tối đa ${CHAT_MAX_FILE_SIZE_MB}MB)`}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 hover:bg-overlay/[0.08] ${themeColor ? '' : 'text-muted hover:text-fg'}`}
              style={themeColor ? { color: themeColor } : undefined}
            >
              {iconSet ? <ThemedIcon set={iconSet} name="attachment" size={18} /> : <Paperclip size={16} />}
            </button>
          </div>
        )}

        <div
          className={`flex shrink-0 items-center gap-1.5 overflow-hidden transition-all duration-200 ${
            hasText ? 'w-0 opacity-0' : 'w-[92px] opacity-100'
          }`}
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={pickMedia}
            title="Gửi ảnh/video"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-overlay/[0.08] bg-overlay/[0.03] transition-all hover:bg-overlay/[0.08] ${themeColor ? '' : 'text-muted hover:text-fg'}`}
            style={themeColor ? { color: themeColor } : undefined}
          >
            {iconSet ? <ThemedIcon set={iconSet} name="image" size={19} /> : <ImageIcon size={17} />}
          </button>
          <button
            data-popover-group="tools"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowStickerPicker((v) => !v)}
            title="Chèn biểu cảm"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
              showStickerPicker
                ? themeColor ? '' : 'border-accent/40 bg-accent/[0.15]'
                : `border-overlay/[0.08] bg-overlay/[0.03] hover:bg-overlay/[0.08] ${themeColor ? '' : 'text-muted hover:text-fg'}`
            }`}
            style={
              themeColor
                ? showStickerPicker
                  ? { borderColor: `${themeColor}66`, backgroundColor: `${themeColor}26` }
                  : { color: themeColor }
                : undefined
            }
          >
            {hasStickerSet ? <ThemedIcon set={iconSet as string} name="sticker-grin" size={21} /> : <span className="text-base">😄</span>}
          </button>
        </div>

        <textarea
          ref={messageInputRef}
          value={input}
          onChange={(e) => {
            handleInputChange(e.target.value)
            const el = e.target
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey) return
            const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
            if (isCoarsePointer) return // let the keyboard insert a newline instead
            e.preventDefault()
            send()
          }}
          onFocus={() => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 300)}
          placeholder="Nhắn gì đó..."
          rows={1}
          style={{
            ...fontStyleFor(style.font),
            color: style.color ?? undefined,
            fontWeight: style.bold ? 700 : undefined,
            fontStyle: style.italic ? 'italic' : undefined,
          }}
          className="max-h-[120px] flex-1 resize-none overflow-y-auto rounded-xl border border-overlay/[0.08] bg-overlay/[0.03] px-4 py-2.5 text-base text-fg outline-none transition-all placeholder-fg/40 focus:border-accent/60 focus:bg-overlay/[0.05] focus:ring-2 focus:ring-accent/20 sm:text-sm"
        />

        <button
          // Keeps the on-screen keyboard open after sending — a click would
          // otherwise move focus to this button and blur the textarea first.
          onMouseDown={(e) => e.preventDefault()}
          onClick={send}
          disabled={!input.trim()}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_4px_16px_rgba(124,58,237,0.4)] transition-all hover:shadow-[0_6px_24px_rgba(124,58,237,0.55)] active:scale-95 disabled:opacity-40 disabled:shadow-none ${
            themeColor ? '' : 'bg-accent hover:bg-accent/90'
          }`}
          style={themeColor ? { backgroundColor: themeColor } : undefined}
        >
          {iconSet ? <ThemedIcon set={iconSet} name="send" size={18} /> : <Send size={16} />}
        </button>
      </div>
    </div>
  )
}

export default function PrivateChatPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [theme, setTheme] = useState<{
    primary?: string | null
    secondary?: string | null
    tertiary?: string | null
    quaternary?: string | null
    wallpaperCss?: string
  }>({})
  const [overlayOpen, setOverlayOpen] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) { setSession(null); return }
    const parsed = JSON.parse(raw)
    setSession({ roomType: 'group', ...parsed })
  }, [])

  return (
    <ToolShell
      name="Private Chat"
      icon="💬"
      description="Đoạn chat riêng tư bằng mã PIN"
      fullBleed
      hideHeader={overlayOpen}
      ambientBackgroundStyle={ambientWallpaperStyle(theme.wallpaperCss)}
      headerStyle={headerAccentStyle(theme.primary, theme.secondary, theme.quaternary)}
      headerTranslucent={Boolean(theme.wallpaperCss)}
    >
      <div
        className={`contents ${dancingScript.variable} ${baloo2.variable} ${notoSerif.variable} ${pacifico.variable} ${anton.variable} ${mali.variable} ${lobster.variable}`}
      >
        {session === undefined ? null : session ? (
          <ChatScreen
            session={session}
            onLeave={() => { setSession(null); setTheme({}) }}
            onThemeChange={(primary, secondary, tertiary, quaternary, wallpaperCss) =>
              setTheme({ primary, secondary, tertiary, quaternary, wallpaperCss })
            }
            onOverlayChange={setOverlayOpen}
          />
        ) : (
          <div className="flex h-full items-center justify-center overflow-y-auto p-4">
            <JoinScreen onJoined={setSession} />
          </div>
        )}
      </div>
    </ToolShell>
  )
}
