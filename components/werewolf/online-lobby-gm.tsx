'use client'
import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { MIN_PLAYERS, type PlayerSetup } from '@/lib/werewolf/types'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { getGmDeviceId } from '@/lib/werewolf/online-storage'
import { roomChannelName, type RoomPlayer } from '@/lib/werewolf/online-types'

export interface OnlineRoomRef {
  roomId: string
  code: string
}

interface OnlineLobbyGMProps {
  room: OnlineRoomRef | null
  onRoomCreated: (room: OnlineRoomRef) => void
  players: PlayerSetup[]
  onPlayersChange: (players: PlayerSetup[]) => void
  onLocked: () => void
  onDissolved: () => void
}

async function kickPlayer(roomId: string, playerId: string): Promise<void> {
  await fetch('/api/werewolf/room/kick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, gmDeviceId: getGmDeviceId(), playerId }),
  })
}

function toPlayerSetup(p: RoomPlayer): PlayerSetup {
  return { id: p.id, name: p.name, roleIds: [] }
}

export function OnlineLobbyGM({ room, onRoomCreated, players, onPlayersChange, onLocked, onDissolved }: OnlineLobbyGMProps) {
  const [loading, setLoading] = useState(!!room)
  const [error, setError] = useState('')
  const [locking, setLocking] = useState(false)
  const playersRef = useRef(players)
  playersRef.current = players
  const hydratedForRef = useRef<string | null>(null)

  // Re-hydrate the roster whenever a (new or resumed) room shows up — covers
  // both a page refresh and coming back here after "Chơi lại" reopened the
  // same room server-side.
  useEffect(() => {
    if (!room || hydratedForRef.current === room.roomId) return
    hydratedForRef.current = room.roomId
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/werewolf/room/state?roomId=${room.roomId}&gmDeviceId=${getGmDeviceId()}`)
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? 'Không tải được phòng')
          return
        }
        onPlayersChange((data.players as RoomPlayer[]).map(toPlayerSetup))
        if (data.status === 'locked' || data.status === 'in_game') onLocked()
      } catch {
        setError('Lỗi kết nối')
      } finally {
        setLoading(false)
      }
    })()
  }, [room?.roomId])

  useEffect(() => {
    if (!room) return
    const supabase = getSupabaseBrowser()
    const channel = supabase.channel(roomChannelName(room.roomId))
    channel.on('broadcast', { event: 'player_joined' }, (msg) => {
      const player = msg.payload as RoomPlayer
      if (playersRef.current.some((p) => p.id === player.id)) return
      onPlayersChange([...playersRef.current, toPlayerSetup(player)])
    })
    channel.on('broadcast', { event: 'player_left' }, (msg) => {
      const { playerId } = msg.payload as { playerId: string }
      onPlayersChange(playersRef.current.filter((p) => p.id !== playerId))
    })
    channel.on('broadcast', { event: 'player_kicked' }, (msg) => {
      const { playerId } = msg.payload as { playerId: string }
      onPlayersChange(playersRef.current.filter((p) => p.id !== playerId))
    })
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [room?.roomId])

  async function createRoom() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/werewolf/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gmDeviceId: getGmDeviceId() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Không tạo được phòng')
        return
      }
      hydratedForRef.current = data.roomId
      onPlayersChange([])
      onRoomCreated({ roomId: data.roomId, code: data.code })
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  async function lockRoom() {
    if (!room) return
    setLocking(true)
    setError('')
    try {
      const res = await fetch('/api/werewolf/room/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: room.roomId, gmDeviceId: getGmDeviceId(), locked: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Không khoá được phòng')
        return
      }
      onLocked()
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLocking(false)
    }
  }

  async function dissolveRoom() {
    if (!room) return
    if (!window.confirm('Giải tán phòng? Toàn bộ người chơi sẽ bị ngắt kết nối.')) return
    try {
      await fetch('/api/werewolf/room/dissolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: room.roomId, gmDeviceId: getGmDeviceId() }),
      })
    } catch {
      // best-effort — the room may already be gone
    }
    onDissolved()
  }

  if (loading) return <p className="py-8 text-center text-sm text-muted">Đang tải...</p>

  if (!room) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
        <p className="text-2xl">📡</p>
        <p className="text-sm text-muted">Tạo phòng để người chơi vào bằng mã hoặc quét QR trên điện thoại.</p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={createRoom}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg transition-transform active:scale-[0.98]"
        >
          Tạo phòng online
        </button>
        <a
          href="/tools/werewolf-gm/play"
          className="block w-full rounded-xl border border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-fg"
        >
          🎴 Vào phòng với tư cách người chơi
        </a>
      </div>
    )
  }

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/tools/werewolf-gm/play?code=${room.code}` : ''

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-accent/40 bg-surface p-5">
        {joinUrl && (
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={joinUrl} size={168} />
          </div>
        )}
        <div className="text-center">
          <p className="text-xs text-muted">Mã phòng</p>
          <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-fg">{room.code}</p>
        </div>
        <p className="text-center text-xs text-muted">
          Người chơi quét QR hoặc vào werewolf-gm/play và nhập mã ở trên.
        </p>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="space-y-2">
        <p className="text-sm font-medium text-fg">Người chơi đã vào phòng ({players.length})</p>
        {players.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted">
            Chưa có ai vào phòng — chia sẻ mã hoặc QR ở trên.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {players.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-muted">
                  {i + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-fg">{p.name}</p>
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" title="Đã kết nối" />
                <button
                  type="button"
                  onClick={() => room && kickPlayer(room.roomId, p.id)}
                  className="shrink-0 rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/10"
                  title="Kick khỏi phòng"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={dissolveRoom}
          className="rounded-xl border border-red-500/30 px-4 py-3 text-sm text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/10"
        >
          Giải tán phòng
        </button>
        <button
          type="button"
          disabled={players.length < MIN_PLAYERS || locking}
          onClick={lockRoom}
          className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          🔒 Khoá phòng & tiếp tục
        </button>
      </div>
      {players.length > 0 && players.length < MIN_PLAYERS && (
        <p className="text-xs text-amber-400">Cần tối thiểu {MIN_PLAYERS} người chơi để khoá phòng.</p>
      )}
    </div>
  )
}
