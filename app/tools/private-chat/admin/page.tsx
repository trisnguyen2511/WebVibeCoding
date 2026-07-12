'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { compressImageToDataUrl } from '@/lib/compress-image'
import { DEFAULT_MOOD_OPTIONS, DEFAULT_REACTION_EMOJIS, type MoodOption } from '@/lib/chat-defaults'

type Room = {
  id: string
  pin: string
  name: string
  type: 'group' | 'solo'
  anniversary_date: string | null
  icon_url: string | null
  mood_options: MoodOption[] | null
  reaction_emojis: string[] | null
  created_at: string
  deviceCount: number
}

// Custom mood options are entered as one "emoji label" pair per line — the
// color is auto-assigned from a fixed palette so the admin doesn't have to
// pick hex codes for something this small.
const MOOD_COLOR_PALETTE = ['#FBBF24', '#F472B6', '#34D399', '#60A5FA', '#818CF8', '#F87171', '#A78BFA', '#FCA5A5']

function parseMoodOptionsInput(text: string): MoodOption[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const seen = new Set<string>()
  return lines.map((line, i) => {
    const spaceIdx = line.indexOf(' ')
    const emoji = spaceIdx === -1 ? line : line.slice(0, spaceIdx)
    const label = spaceIdx === -1 ? line : line.slice(spaceIdx + 1).trim()
    let id = (label || emoji)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `mood-${i}`
    while (seen.has(id)) id = `${id}-${i}`
    seen.add(id)
    return { id, emoji, label: label || emoji, color: MOOD_COLOR_PALETTE[i % MOOD_COLOR_PALETTE.length] }
  })
}

// Falls back to the app's built-in defaults when a room hasn't customized
// its own set yet, so the admin edits from a filled-in starting point
// instead of typing the whole list from scratch.
function moodOptionsToText(options: MoodOption[] | null): string {
  const source = options && options.length > 0 ? options : DEFAULT_MOOD_OPTIONS
  return source.map((m) => `${m.emoji} ${m.label}`).join('\n')
}

function reactionEmojisToText(emojis: string[] | null): string {
  const source = emojis && emojis.length > 0 ? emojis : DEFAULT_REACTION_EMOJIS
  return source.join(' ')
}

function parseReactionInput(text: string): string[] {
  return text.split(/\s+/).map((s) => s.trim()).filter(Boolean)
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/chat/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) onLoggedIn()
      else setError('Sai mật khẩu')
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') login() }}
        placeholder="Admin password"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-white outline-none placeholder-muted focus:border-accent sm:text-sm"
      />
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
      <button
        onClick={login}
        disabled={loading || !password}
        className="w-full rounded-xl bg-accent py-3 font-display font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
      >
        Đăng nhập
      </button>
    </div>
  )
}

function AdminPanel() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [pin, setPin] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<'group' | 'solo'>('group')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/chat/admin/rooms')
    const data = await res.json()
    if (data.rooms) setRooms(data.rooms)
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!pin.trim() || !name.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/chat/admin/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim(), name: name.trim(), type }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setPin(''); setName(''); setType('group')
      load()
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/chat/admin/rooms?id=${id}`, { method: 'DELETE' })
    load()
  }

  const setAnniversary = async (id: string, date: string) => {
    await fetch(`/api/chat/admin/rooms?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anniversaryDate: date || null }),
    })
    load()
  }

  const [uploadingIconFor, setUploadingIconFor] = useState<string | null>(null)
  const iconInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  const uploadIcon = async (id: string, file: File) => {
    setUploadingIconFor(id)
    try {
      const iconDataUrl = await compressImageToDataUrl(file, 256, 0.85)
      await fetch(`/api/chat/admin/rooms?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iconDataUrl }),
      })
      load()
    } finally {
      setUploadingIconFor(null)
    }
  }

  const removeIcon = async (id: string) => {
    await fetch(`/api/chat/admin/rooms?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeIcon: true }),
    })
    load()
  }

  const saveMoodOptions = async (id: string, text: string) => {
    const parsed = parseMoodOptionsInput(text)
    await fetch(`/api/chat/admin/rooms?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moodOptions: parsed.length > 0 ? parsed : null }),
    })
    load()
  }

  const saveReactionEmojis = async (id: string, text: string) => {
    const parsed = parseReactionInput(text)
    await fetch(`/api/chat/admin/rooms?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reactionEmojis: parsed.length > 0 ? parsed : null }),
    })
    load()
  }

  const logout = async () => {
    await fetch('/api/chat/admin/logout', { method: 'POST' })
    window.location.reload()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-display font-semibold text-white">Quản lý phòng chat</p>
        <button onClick={logout} className="text-xs text-muted hover:text-white">Đăng xuất</button>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-xs uppercase tracking-widest text-muted">Tạo phòng mới</p>
        <div className="flex gap-2">
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="PIN (4-10 số)"
            className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-base text-white outline-none placeholder-muted focus:border-accent sm:text-sm"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên phòng"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-base text-white outline-none placeholder-muted focus:border-accent sm:text-sm"
          />
          <button
            onClick={create}
            disabled={loading || !pin.trim() || !name.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
          >
            Tạo
          </button>
        </div>
        <div className="flex gap-2">
          {(['group', 'solo'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                type === t ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border bg-background text-muted hover:text-white'
              }`}
            >
              {t === 'group' ? 'Nhóm (bắt buộc tên)' : 'Độc thoại (không cần tên)'}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="space-y-2">
        {rooms.length === 0 && <p className="text-center text-sm text-muted">Chưa có phòng nào</p>}
        {rooms.map((r) => (
          <div key={r.id} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="shrink-0">
                <input
                  ref={(el) => { if (el) iconInputRefs.current.set(r.id, el) }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) uploadIcon(r.id, file)
                  }}
                />
                <button
                  onClick={() => iconInputRefs.current.get(r.id)?.click()}
                  title="Đổi icon phòng"
                  className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-border bg-background text-muted hover:border-accent/50 hover:text-white"
                >
                  {uploadingIconFor === r.id ? (
                    <span className="text-xs">...</span>
                  ) : r.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.icon_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg">🖼️</span>
                  )}
                </button>
                {r.icon_url && (
                  <button onClick={() => removeIcon(r.id)} className="mt-1 block w-full text-center text-[10px] text-muted hover:text-red-400">
                    Xóa icon
                  </button>
                )}
              </div>
              <div>
                <p className="font-medium text-white">
                  {r.name}
                  {r.type === 'solo' && (
                    <span className="ml-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-normal text-rose-400">độc thoại</span>
                  )}
                </p>
                <p className="font-mono text-xs text-muted">PIN: {r.pin} · {r.deviceCount} thiết bị</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted">💞 Ngày bắt đầu yêu:</span>
                  <input
                    type="date"
                    defaultValue={r.anniversary_date ?? ''}
                    onBlur={(e) => setAnniversary(r.id, e.target.value)}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-base text-white outline-none focus:border-accent sm:text-xs"
                  />
                </div>
              </div>
            </div>
            <button onClick={() => remove(r.id)} className="text-xs text-red-400 hover:text-red-300">Xóa</button>
          </div>

          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div>
              <span className="text-xs text-muted">😄 Trạng thái cảm xúc (mỗi dòng: emoji + tên, để trống = mặc định)</span>
              <textarea
                defaultValue={moodOptionsToText(r.mood_options)}
                onBlur={(e) => saveMoodOptions(r.id, e.target.value)}
                rows={3}
                placeholder={'😄 Vui\n🥰 Yêu đời\n😡 Bực'}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-base text-white outline-none placeholder-muted focus:border-accent sm:text-xs"
              />
            </div>
            <div>
              <span className="text-xs text-muted">👍 Emoji react nhanh (cách nhau bằng khoảng trắng, để trống = mặc định)</span>
              <input
                defaultValue={reactionEmojisToText(r.reaction_emojis)}
                onBlur={(e) => saveReactionEmojis(r.id, e.target.value)}
                placeholder="❤️ 👍 😂 😮 😢 😡 🎉"
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-base text-white outline-none placeholder-muted focus:border-accent sm:text-xs"
              />
            </div>
          </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PrivateChatAdminPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/chat/admin/rooms').then((res) => setLoggedIn(res.ok))
  }, [])

  return (
    <ToolShell name="Private Chat — Admin" icon="🛠️" description="Quản lý PIN và phòng chat">
      {loggedIn === null ? null : loggedIn ? <AdminPanel /> : <LoginScreen onLoggedIn={() => setLoggedIn(true)} />}
    </ToolShell>
  )
}
