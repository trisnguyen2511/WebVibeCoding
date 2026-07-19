'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { joinRoom } from '@/lib/webrtc'
import { UntangleProgressMessage } from '@/lib/games/untangle-physics'

// iOS 13+ gates motion/orientation sensors behind a permission prompt that
// must be triggered from a user gesture — this is the documented shape of
// that API (absent on browsers that don't need it, e.g. Android Chrome).
interface DeviceOrientationEventiOS {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

type Status = 'idle' | 'connecting' | 'playing' | 'disconnected'

function isProgressMessage(data: unknown): data is UntangleProgressMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'untangle-progress'
}

function UntangleControllerInner() {
  const roomId = useSearchParams().get('room') ?? ''
  const [status, setStatus] = useState<Status>('idle')
  const [playerNum, setPlayerNum] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [won, setWon] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const connRef = useRef<{ sendInput: (msg: { type: 'orientation'; alpha: number; beta: number; ts: number }) => void; disconnect: () => void } | null>(null)
  const wonRef = useRef(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  // The lock is auto-released whenever the tab/screen goes hidden (e.g. the
  // OS blanks the display right before our own request lands) — re-acquire
  // it whenever the page becomes visible again while a game is in progress.
  const requestWakeLock = async () => {
    try {
      wakeLockRef.current = await navigator.wakeLock?.request('screen')
    } catch {
      // Not supported or denied — game still works, screen may just sleep.
    }
  }

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && status === 'playing') void requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [status])

  useEffect(() => () => {
    connRef.current?.disconnect()
    wakeLockRef.current?.release().catch(() => {})
  }, [])

  const start = async () => {
    if (!roomId) { setError('Thiếu mã phòng — quay lại quét QR từ màn hình PC.'); return }
    setError(null)

    const DOE = DeviceOrientationEvent as unknown as DeviceOrientationEventiOS
    if (typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission()
        if (result !== 'granted') { setError('Cần cấp quyền cảm biến xoay để chơi.'); return }
      } catch {
        setError('Không lấy được quyền cảm biến — thử lại.')
        return
      }
    }

    setStatus('connecting')
    try {
      const conn = await joinRoom(
        roomId,
        (idx) => { setPlayerNum(idx + 1); setStatus('playing'); void requestWakeLock() },
        () => { setStatus('disconnected'); wakeLockRef.current?.release().catch(() => {}) },
        (data) => {
          if (!isProgressMessage(data)) return
          setProgress(data.progress)
          if (data.won && !wonRef.current) {
            wonRef.current = true
            setWon(true)
            navigator.vibrate?.(200)
          } else if (!data.won) {
            wonRef.current = false
            setWon(false)
          }
        }
      )
      connRef.current = conn

      const lastRef = { current: 0 }
      window.addEventListener('deviceorientation', (e) => {
        if (e.alpha === null) return
        const now = Date.now()
        if (now - lastRef.current < 16) return
        lastRef.current = now
        conn.sendInput({ type: 'orientation', alpha: e.alpha, beta: e.beta ?? 0, ts: now })
      })
    } catch {
      setError('Không kết nối được phòng — kiểm tra lại mã phòng.')
      setStatus('idle')
    }
  }

  if (status === 'playing' || status === 'disconnected') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        {status === 'disconnected' ? (
          <p className="text-sm text-muted">Mất kết nối với PC — quay lại quét QR để vào lại.</p>
        ) : (
          <>
            <p className="font-mono text-xs uppercase tracking-widest text-muted">Người chơi {playerNum}</p>
            <p className={`font-mono text-6xl font-bold ${won ? 'text-green-400' : 'text-accent-soft'}`}>
              {Math.round(progress * 100)}%
            </p>
            <p className="text-sm text-muted">{won ? '🎉 Đã gỡ xong!' : 'Xoay điện thoại để gỡ dây'}</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <div className="space-y-2">
        <p className="text-4xl">📱</p>
        <h1 className="font-display text-lg font-semibold text-fg">Lật ngửa điện thoại lên</h1>
        <p className="max-w-xs text-sm text-muted">
          Đặt điện thoại nằm ngửa trên bàn/tay, rồi bấm bắt đầu — sau đó vừa xoay trái/phải vừa nghiêng lên/xuống điện thoại để gỡ dây quấn rương trên màn hình PC. Cần đúng cả 2 chiều cùng lúc mới gỡ được.
        </p>
      </div>
      <button
        onClick={() => void start()}
        disabled={status === 'connecting'}
        className="rounded-xl border border-accent/40 bg-accent/10 px-6 py-3 text-sm font-medium text-accent-soft transition-colors hover:bg-accent/20 disabled:opacity-50"
      >
        {status === 'connecting' ? 'Đang kết nối...' : 'Bắt đầu'}
      </button>
      {error && <p className="max-w-xs text-xs text-red-400">{error}</p>}
    </div>
  )
}

export default function UntangleControllerPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-background" />}>
      <UntangleControllerInner />
    </Suspense>
  )
}
