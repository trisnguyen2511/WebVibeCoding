'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ToolShell } from '@/components/tool-shell'
import { RoleCard } from '@/components/werewolf/role-card'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { getPlayerDeviceId, loadPlayerSession, savePlayerSession, clearPlayerSession } from '@/lib/werewolf/online-storage'
import { roomChannelName, type RoomStatus } from '@/lib/werewolf/online-types'
import type { RoleDef } from '@/lib/werewolf/types'

interface JoinedState {
  roomId: string
  code: string
  playerId: string
  name: string
  seat: number | null
  status: RoomStatus
  roleIds: string[]
  roles: RoleDef[]
  realtimeEnabled: boolean
  gameEndedAt: string | null
}

function WerewolfPlayInner() {
  const searchParams = useSearchParams()
  const [codeInput, setCodeInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState<JoinedState | null>(null)
  const [dissolved, setDissolved] = useState(false)
  const deviceIdRef = useRef('')
  const joinedRef = useRef<JoinedState | null>(null)
  joinedRef.current = joined

  useEffect(() => {
    deviceIdRef.current = getPlayerDeviceId()
    const codeFromUrl = searchParams.get('code')
    const session = loadPlayerSession()
    if (codeFromUrl) setCodeInput(codeFromUrl)
    else if (session) setCodeInput(session.code)
    if (session) {
      setNameInput(session.name)
      void attemptJoin(session.code, session.name, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!joined) return
    const supabase = getSupabaseBrowser()
    const channel = supabase.channel(roomChannelName(joined.roomId))
    channel.on('broadcast', { event: 'room_locked' }, () => {
      setJoined((s) => (s ? { ...s, status: 'locked' } : s))
    })
    channel.on('broadcast', { event: 'room_reopened' }, () => {
      setJoined((s) => (s ? { ...s, status: 'lobby' } : s))
    })
    channel.on('broadcast', { event: 'game_started' }, (msg) => {
      const payload = msg.payload as { roles: RoleDef[]; players: { playerId: string; seat: number | null; roleIds: string[] }[] }
      const self = payload.players.find((p) => p.playerId === joinedRef.current?.playerId)
      setJoined((s) => (s && self ? { ...s, status: 'in_game', roles: payload.roles, seat: self.seat, roleIds: self.roleIds } : s))
    })
    channel.on('broadcast', { event: 'role_assigned' }, (msg) => {
      const payload = msg.payload as { playerId: string; roleIds: string[] }
      if (payload.playerId !== joinedRef.current?.playerId) return
      setJoined((s) => (s ? { ...s, roleIds: payload.roleIds } : s))
    })
    channel.on('broadcast', { event: 'realtime_toggled' }, (msg) => {
      const { enabled } = msg.payload as { enabled: boolean }
      setJoined((s) => (s ? { ...s, realtimeEnabled: enabled } : s))
    })
    channel.on('broadcast', { event: 'game_ended' }, () => {
      setJoined((s) => (s ? { ...s, status: 'lobby', roleIds: [], gameEndedAt: new Date().toISOString() } : s))
    })
    channel.on('broadcast', { event: 'room_dissolved' }, () => {
      clearPlayerSession()
      setDissolved(true)
      setJoined(null)
    })
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [joined?.roomId])

  async function attemptJoin(code: string, name: string, silent: boolean) {
    const trimmedCode = code.trim()
    if (!trimmedCode) return
    setJoining(true)
    if (!silent) setError('')
    try {
      const res = await fetch('/api/werewolf/room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmedCode, deviceId: deviceIdRef.current, name: name.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        clearPlayerSession()
        if (!silent) setError(data.error ?? 'Không vào được phòng')
        return
      }
      setDissolved(false)
      setJoined({
        roomId: data.roomId,
        code: data.code,
        playerId: data.playerId,
        name: data.name,
        seat: data.seat,
        status: data.status,
        roleIds: data.roleIds,
        roles: data.roles,
        realtimeEnabled: data.realtimeEnabled,
        gameEndedAt: data.gameEndedAt,
      })
      savePlayerSession({ roomId: data.roomId, code: data.code, name: data.name })
    } catch {
      if (!silent) setError('Lỗi kết nối')
    } finally {
      setJoining(false)
    }
  }

  async function handleLeave() {
    if (joined) {
      try {
        await fetch('/api/werewolf/room/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: joined.roomId, deviceId: deviceIdRef.current }),
        })
      } catch {
        // best-effort
      }
    }
    clearPlayerSession()
    setJoined(null)
    setCodeInput('')
    setNameInput('')
  }

  if (dissolved) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
        <p className="text-2xl">👋</p>
        <p className="text-sm text-muted">Quản trò đã giải tán phòng này.</p>
        <button
          type="button"
          onClick={() => setDissolved(false)}
          className="mx-auto rounded-xl border border-border px-4 py-2 text-sm text-fg"
        >
          Vào phòng khác
        </button>
      </div>
    )
  }

  if (!joined) {
    return (
      <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm font-medium text-fg">Vào phòng Werewolf</p>
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Mã phòng 6 số..."
          inputMode="numeric"
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-fg outline-none focus:border-accent"
        />
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void attemptJoin(codeInput, nameInput, false)
          }}
          placeholder="Tên của bạn..."
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={() => void attemptJoin(codeInput, nameInput, false)}
          disabled={joining || codeInput.trim().length !== 6 || !nameInput.trim()}
          className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-fg transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          {joining ? 'Đang vào phòng...' : 'Vào phòng'}
        </button>
      </div>
    )
  }

  const roleDefs = joined.roleIds.map((id) => joined.roles.find((r) => r.id === id)).filter((r): r is RoleDef => !!r)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-muted">
        <span>
          Phòng <span className="font-mono text-fg">{joined.code}</span> · {joined.name}
          {joined.seat !== null && <> · Vị trí #{joined.seat + 1}</>}
        </span>
        <button type="button" onClick={handleLeave} className="underline underline-offset-2 hover:text-fg">
          Rời phòng
        </button>
      </div>

      {!joined.realtimeEnabled && joined.status === 'in_game' && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-xs text-amber-300">
          📡 Quản trò đã tắt đồng bộ trực tuyến — vai trò của bạn vẫn hiển thị bên dưới, chơi bình thường ngoài đời.
        </div>
      )}

      {joined.status === 'in_game' && roleDefs.length > 0 ? (
        <div className="space-y-3">
          {roleDefs.map((role) => (
            <RoleCard key={role.id} role={role} />
          ))}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
          <p className="text-2xl">⏳</p>
          <p className="text-sm text-muted">
            {joined.gameEndedAt && joined.status === 'lobby'
              ? 'Ván trước đã kết thúc — đang chờ quản trò bắt đầu ván mới.'
              : joined.status === 'lobby'
                ? 'Đã vào phòng — đang chờ quản trò khoá phòng và chia vai.'
                : 'Đang chờ quản trò phát vai...'}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void attemptJoin(joined.code, joined.name, false)}
        className="w-full rounded-xl border border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-fg"
      >
        🔄 Chơi lại / Vào lại phòng
      </button>
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  )
}

export default function WerewolfPlayPage() {
  return (
    <ToolShell name="Werewolf — Vào phòng" icon="🐺" description="Quét QR hoặc nhập mã để vào phòng của quản trò">
      <Suspense fallback={null}>
        <WerewolfPlayInner />
      </Suspense>
    </ToolShell>
  )
}
