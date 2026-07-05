'use client'
import { useState, useEffect, useCallback } from 'react'
import { ToolShell } from '@/components/tool-shell'

type Room = {
  id: string
  pin: string
  name: string
  type: 'group' | 'solo'
  anniversary_date: string | null
  created_at: string
  deviceCount: number
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
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-white outline-none placeholder-muted focus:border-accent"
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
            className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-white outline-none placeholder-muted focus:border-accent"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên phòng"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-white outline-none placeholder-muted focus:border-accent"
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
          <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
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
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-white outline-none focus:border-accent"
                />
              </div>
            </div>
            <button onClick={() => remove(r.id)} className="text-xs text-red-400 hover:text-red-300">Xóa</button>
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
