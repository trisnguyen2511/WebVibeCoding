'use client'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { QRCodeSVG } from 'qrcode.react'
import { ToolShell } from '@/components/tool-shell'
import { createRoom, InputMessage, PlayerInfo, RoomHandle } from '@/lib/webrtc'
import { MAX_WIND_COUNT, MIN_WIND_COUNT, UntangleProgressMessage } from '@/lib/games/untangle-physics'
import type { RawOrientation } from '@/components/games/untangle-chest-scene'

// Three.js/WebGL only exists client-side — keep it out of the SSR bundle.
const UntangleChestScene = dynamic(
  () => import('@/components/games/untangle-chest-scene').then((m) => m.UntangleChestScene),
  { ssr: false }
)

const MAX_PLAYERS = 4
const PLAYER_BADGE_COLORS = ['#A78BFA', '#60A5FA', '#4ADE80', '#FBBF24']

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function gridClass(count: number) {
  if (count <= 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  return 'grid-cols-2 grid-rows-2'
}

interface CellState {
  progress: number
  won: boolean
  elapsed: number
}

function formatTimer(seconds: number) {
  return seconds.toFixed(2)
}

// Split-screen grid: each connected phone gets its own cell showing only
// its own chest — created only once the host presses "Mở phòng" so the
// wind-count difficulty can't change mid-session.
function GameGrid({ roomId, windCount }: { roomId: string; windCount: number }) {
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [cellStates, setCellStates] = useState<Record<string, CellState>>({})
  const handleRef = useRef<RoomHandle | null>(null)
  const rawOrientationRef = useRef<Record<string, RawOrientation>>({})

  useEffect(() => {
    let cancelled = false
    createRoom(
      roomId,
      (msg: InputMessage) => {
        if (msg.type !== 'orientation') return
        rawOrientationRef.current[msg.peerId] = { alpha: msg.alpha, beta: msg.beta }
      },
      (newPlayers) => { if (!cancelled) setPlayers(newPlayers.slice(0, MAX_PLAYERS)) }
    ).then((handle) => {
      if (cancelled) handle.cleanup()
      else handleRef.current = handle
    })
    return () => {
      cancelled = true
      handleRef.current?.cleanup()
      handleRef.current = null
    }
  }, [roomId])

  const handleProgress = (peerId: string, progress: number, won: boolean, elapsed: number) => {
    setCellStates((prev) => ({ ...prev, [peerId]: { progress, won, elapsed } }))
    handleRef.current?.sendToPlayer<UntangleProgressMessage>(peerId, { type: 'untangle-progress', progress, won })
  }

  if (players.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
        Đang chờ người chơi quét QR để vào phòng...
      </div>
    )
  }

  return (
    <div className={`grid h-[60vh] gap-3 ${gridClass(players.length)}`}>
      {players.map((p, i) => {
        const cell = cellStates[p.peerId]
        const color = PLAYER_BADGE_COLORS[i % PLAYER_BADGE_COLORS.length]
        return (
          <div key={p.peerId} className="relative overflow-hidden rounded-xl border border-border bg-surface">
            <div
              className="absolute left-2 top-2 z-10 rounded-full border bg-background/80 px-2 py-0.5 font-mono text-xs font-bold"
              style={{ borderColor: color, color }}
            >
              P{i + 1} — {Math.round((cell?.progress ?? 0) * 100)}%{cell?.won ? ' 🎉' : ''}
            </div>
            <div className="absolute bottom-2 right-2 z-10 rounded-lg border border-border bg-background/80 px-2 py-1 font-mono text-lg font-bold text-fg">
              {formatTimer(cell?.elapsed ?? 0)}
            </div>
            <UntangleChestScene
              windCount={windCount}
              won={cell?.won ?? false}
              getRawOrientation={() => rawOrientationRef.current[p.peerId] ?? null}
              onProgress={(progress, won, elapsed) => handleProgress(p.peerId, progress, won, elapsed)}
            />
          </div>
        )
      })}
    </div>
  )
}

function UntangleChestHost() {
  // Generated client-side only — a useState initializer would run once
  // during server prerender and again on client hydration, producing two
  // different random codes and a text-mismatch hydration error.
  const [roomId, setRoomId] = useState<string | null>(null)
  const [windCount, setWindCount] = useState(3)
  const [started, setStarted] = useState(false)

  useEffect(() => { setRoomId(generateRoomId()) }, [])

  const controllerUrl =
    roomId ? `${window.location.origin}/tools/games/untangle-chest/controller?room=${roomId}` : ''

  return (
    <ToolShell name="Gỡ Rối Rương Xoay" icon="🔗" description="PC hiện màn hình — điện thoại xoay để gỡ dây" wide>
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_270px]">
          <div>
            {started && roomId ? (
              <GameGrid roomId={roomId} windCount={windCount} />
            ) : (
              <div className="flex h-[60vh] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
                Chọn độ khó rồi bấm &quot;Mở phòng&quot; để bắt đầu
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <p className="font-mono text-xs text-muted">Room code</p>
              <p className="font-mono text-2xl font-bold tracking-widest text-accent-soft">{roomId}</p>
              {controllerUrl && (
                <div className="flex flex-col items-center gap-2">
                  <div className="overflow-hidden rounded-xl bg-white p-2.5">
                    <QRCodeSVG value={controllerUrl} size={150} bgColor="#FFFFFF" fgColor="#08080E" />
                  </div>
                  <p className="text-center font-mono text-xs text-muted">Điện thoại quét QR để vào chơi</p>
                  <a
                    href={controllerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-center font-mono text-xs text-accent-soft underline underline-offset-2 hover:text-fg"
                  >
                    Mở link controller →
                  </a>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <p className="font-mono text-xs uppercase tracking-widest text-muted">Độ khó — số vòng xoắn</p>
              <input
                type="number"
                min={MIN_WIND_COUNT}
                max={MAX_WIND_COUNT}
                value={windCount}
                disabled={started}
                onChange={(e) =>
                  setWindCount(Math.max(MIN_WIND_COUNT, Math.min(MAX_WIND_COUNT, Number(e.target.value) || MIN_WIND_COUNT)))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-lg text-fg outline-none focus:border-accent/40 disabled:opacity-50"
              />
              <p className="text-xs text-muted">Càng nhiều vòng, dây càng cứng và càng dễ lắc quá tay.</p>
              {!started && (
                <button
                  onClick={() => setStarted(true)}
                  disabled={!roomId}
                  className="w-full rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent-soft transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mở phòng
                </button>
              )}
            </div>

            <div className="rounded-xl border border-border/50 bg-surface/60 p-3 space-y-1.5 text-xs text-muted">
              <p className="font-medium text-fg">Cách chơi</p>
              <p>→ Tối đa 4 người, mỗi người có ô riêng trên màn hình.</p>
              <p>→ Điện thoại lật ngửa, kết hợp xoay trái/phải VÀ nghiêng lên/xuống để gỡ dây — không cần render gì trên điện thoại.</p>
              <p>→ Chỉ xoay một chiều thôi sẽ không đủ — dây chỉ hết khi cả 2 chiều đều đúng cùng lúc.</p>
              <p>→ Xoay sai chiều/quá tay có thể làm dây quấn lại — cần xoay mượt.</p>
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  )
}

export default function UntangleChestPage() {
  return <UntangleChestHost />
}
