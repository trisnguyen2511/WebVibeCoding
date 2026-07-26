'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { joinRoom } from '@/lib/webrtc'
import type { ControllerInput } from '@/lib/webrtc'

// ── RetroPad standard indices (EmulatorJS) ───────────────────────
const BTN = {
  B: 0, Y: 1, SELECT: 2, START: 3,
  UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7,
  A: 8, X: 9, L: 10, R: 11,
} as const

type BtnIdx = (typeof BTN)[keyof typeof BTN]
type ConnState = 'connecting' | 'connected' | 'disconnected'
const P_COLOR = ['#7C3AED', '#2563EB', '#059669', '#D97706']

// ── Shoulder button (L or R, full-width top strip) ───────────────
function ShoulderBtn({ btnIdx, label, side, press, release }: {
  btnIdx: BtnIdx; label: string; side: 'left' | 'right'
  press: (b: BtnIdx) => void; release: (b: BtnIdx) => void
}) {
  const [active, setActive] = useState(false)
  return (
    <div
      style={{
        position: 'absolute',
        top: '1vmin',
        [side]: '1vmin',
        width: '24vmin',
        height: '10vmin',
        borderRadius: side === 'left' ? '5vmin 3vmin 5vmin 7vmin' : '3vmin 5vmin 7vmin 5vmin',
        background: active ? '#7C3AED33' : '#0F0F1A',
        border: `2px solid ${active ? '#7C3AED' : '#1A1A2E'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'none', userSelect: 'none',
        transition: 'background 0.06s, border-color 0.06s',
      }}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setActive(true); press(btnIdx)
        if (navigator.vibrate) navigator.vibrate(18)
      }}
      onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); setActive(false); release(btnIdx) }}
      onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); setActive(false); release(btnIdx) }}
    >
      <span style={{ fontSize: '6vmin', fontWeight: 800, color: active ? '#A78BFA' : '#52525B', fontFamily: 'system-ui' }}>
        {label}
      </span>
    </div>
  )
}

// ── D-Pad: single touch zone, angle-based 8-way detection ────────
// User touches anywhere in the cross and slides — direction is
// detected from the angle relative to center. No need to look.
function DPad({ press, release, style }: {
  press: (b: BtnIdx) => void; release: (b: BtnIdx) => void
  style?: React.CSSProperties
}) {
  const ref    = useRef<HTMLDivElement>(null)
  const held   = useRef<Set<BtnIdx>>(new Set())
  const [dirs, setDirs] = useState<Set<BtnIdx>>(new Set())

  function update(clientX: number, clientY: number) {
    const el = ref.current
    if (!el) return
    const { left, top, width, height } = el.getBoundingClientRect()
    const dx   = clientX - (left + width  / 2)
    const dy   = clientY - (top  + height / 2)
    const dist = Math.hypot(dx, dy)
    const dead = width * 0.12  // 12% dead zone in center

    const next = new Set<BtnIdx>()
    if (dist > dead) {
      const a = Math.atan2(dy, dx) * (180 / Math.PI)
      // 8-way: each diagonal fires two directions simultaneously
      if (a >= -157.5 && a < -22.5)  next.add(BTN.UP)
      if (a >= -67.5  && a <  67.5)  next.add(BTN.RIGHT)
      if (a >=  22.5  && a < 157.5)  next.add(BTN.DOWN)
      if (a >=  112.5 || a < -112.5) next.add(BTN.LEFT)
    }

    const toRelease: BtnIdx[] = []
    const toPress:   BtnIdx[] = []
    held.current.forEach(b => { if (!next.has(b)) toRelease.push(b) })
    next.forEach(b => { if (!held.current.has(b)) toPress.push(b) })
    toRelease.forEach(b => { release(b); held.current.delete(b) })
    toPress.forEach(b => { press(b); held.current.add(b) })
    setDirs(new Set(held.current))
  }

  function releaseAll() {
    held.current.forEach(b => release(b))
    held.current.clear()
    setDirs(new Set())
  }

  const u = dirs.has(BTN.UP),   d = dirs.has(BTN.DOWN)
  const l = dirs.has(BTN.LEFT), r = dirs.has(BTN.RIGHT)

  const armStyle = (on: boolean, br: string): React.CSSProperties => ({
    background:   on ? '#7C3AED33' : '#0F0F1A',
    border:       `1.5px solid ${on ? '#7C3AED' : '#1A1A2E'}`,
    borderRadius: br,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.05s, border-color 0.05s',
  })

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        width: '38vmin', height: '38vmin',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr 1fr 1fr',
        touchAction: 'none', userSelect: 'none',
        ...style,
      }}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        update(e.clientX, e.clientY)
        if (navigator.vibrate) navigator.vibrate(18)
      }}
      onPointerMove={e => { if (e.buttons) update(e.clientX, e.clientY) }}
      onPointerUp={releaseAll}
      onPointerCancel={releaseAll}
    >
      {/* Row 1: corner · Up · corner */}
      <div style={{ background: 'transparent' }} />
      <div style={armStyle(u, '8px 8px 0 0')}>
        <span style={{ fontSize: '5.5vmin', color: u ? '#A78BFA' : '#52525B', pointerEvents: 'none' }}>▲</span>
      </div>
      <div style={{ background: 'transparent' }} />

      {/* Row 2: Left · Center · Right */}
      <div style={armStyle(l, '8px 0 0 8px')}>
        <span style={{ fontSize: '5.5vmin', color: l ? '#A78BFA' : '#52525B', pointerEvents: 'none' }}>◀</span>
      </div>
      <div style={{ background: '#0F0F1A', border: '1.5px solid #1A1A2E' }} />
      <div style={armStyle(r, '0 8px 8px 0')}>
        <span style={{ fontSize: '5.5vmin', color: r ? '#A78BFA' : '#52525B', pointerEvents: 'none' }}>▶</span>
      </div>

      {/* Row 3: corner · Down · corner */}
      <div style={{ background: 'transparent' }} />
      <div style={armStyle(d, '0 0 8px 8px')}>
        <span style={{ fontSize: '5.5vmin', color: d ? '#A78BFA' : '#52525B', pointerEvents: 'none' }}>▼</span>
      </div>
      <div style={{ background: 'transparent' }} />
    </div>
  )
}

// ── Face button — fills its grid cell ───────────────────────────
function FaceBtn({ btnIdx, label, accent, press, release }: {
  btnIdx: BtnIdx; label: string; accent: string
  press: (b: BtnIdx) => void; release: (b: BtnIdx) => void
}) {
  const [active, setActive] = useState(false)
  return (
    <div
      style={{
        width: '100%', height: '100%',
        borderRadius: '50%',
        background: active ? `${accent}33` : '#0F0F1A',
        border: `2.5px solid ${active ? accent : '#1A1A2E'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'none', userSelect: 'none',
        transition: 'background 0.06s, border-color 0.06s',
        boxSizing: 'border-box',
      }}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setActive(true); press(btnIdx)
        if (navigator.vibrate) navigator.vibrate(18)
      }}
      onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); setActive(false); release(btnIdx) }}
      onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); setActive(false); release(btnIdx) }}
    >
      <span style={{
        fontSize: '5.5vmin', fontWeight: 800,
        color: active ? accent : '#52525B',
        fontFamily: 'system-ui', pointerEvents: 'none',
      }}>
        {label}
      </span>
    </div>
  )
}

// ── Small pill button (SELECT / START) ───────────────────────────
function PillBtn({ btnIdx, label, press, release, style }: {
  btnIdx: BtnIdx; label: string
  press: (b: BtnIdx) => void; release: (b: BtnIdx) => void
  style?: React.CSSProperties
}) {
  const [active, setActive] = useState(false)
  return (
    <div
      style={{
        position: 'absolute',
        borderRadius: 999,
        background: active ? '#7C3AED33' : '#0F0F1A',
        border: `1.5px solid ${active ? '#7C3AED' : '#1A1A2E'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'none', userSelect: 'none',
        transition: 'background 0.06s, border-color 0.06s',
        ...style,
      }}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setActive(true); press(btnIdx)
        if (navigator.vibrate) navigator.vibrate(15)
      }}
      onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); setActive(false); release(btnIdx) }}
      onPointerCancel={e => { e.currentTarget.releasePointerCapture(e.pointerId); setActive(false); release(btnIdx) }}
    >
      <span style={{
        fontSize: '3vmin', fontWeight: 700,
        color: active ? '#A78BFA' : '#52525B',
        fontFamily: 'system-ui', pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </div>
  )
}

// ── Controller UI ────────────────────────────────────────────────
function ControllerView({ roomId }: { roomId: string }) {
  const [state, setState]         = useState<ConnState>('connecting')
  const [playerIdx, setPlayerIdx] = useState(0)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [isLandscape, setIsLandscape]   = useState(false)
  const connRef = useRef<{
    sendInput: (m: ControllerInput) => void
    disconnect: () => void
  } | null>(null)

  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight)
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    joinRoom(
      roomId,
      (idx)     => { if (!cancelled) setPlayerIdx(idx) },
      ()        => { if (!cancelled) setState('disconnected') },
      undefined,
      ()        => { if (!cancelled) setState('connected') },
      (attempt) => { if (!cancelled) setRetryAttempt(attempt) }
    )
      .then((conn) => { if (cancelled) conn.disconnect(); else connRef.current = conn })
      .catch(console.error)

    return () => {
      cancelled = true
      connRef.current?.disconnect()
      connRef.current = null
    }
  }, [roomId])

  const press   = (btn: BtnIdx) =>
    connRef.current?.sendInput({ type: 'button', key: String(btn), state: 'pressed',  ts: Date.now() })
  const release = (btn: BtnIdx) =>
    connRef.current?.sendInput({ type: 'button', key: String(btn), state: 'released', ts: Date.now() })

  // Android fullscreen locks orientation at entry — unlock it then re-lock to landscape
  async function forceLandscape() {
    try {
      const el = document.documentElement
      if (el.requestFullscreen && !document.fullscreenElement) {
        await el.requestFullscreen()
      }
    } catch { /* ignore — may already be fullscreen or not supported */ }
    try {
      const orient = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
      await orient.lock?.('landscape')
    } catch { /* not supported on all browsers */ }
    // Recheck in case orientationchange didn't fire
    setIsLandscape(window.innerWidth > window.innerHeight)
  }

  const color = P_COLOR[playerIdx % 4]

  return (
    <div style={{
      background: '#08080E',
      width: '100vw', height: '100dvh',
      position: 'relative', overflow: 'hidden',
      touchAction: 'none',
    }}>

      {/* ── Status badge ── */}
      <div style={{ position: 'absolute', top: '1.5vmin', left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
        <span style={{
          background: `${color}22`, border: `1px solid ${color}`, color,
          borderRadius: 20, padding: '2px 14px',
          fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
          display: 'inline-block', whiteSpace: 'nowrap',
        }}>
          {state === 'connected'  ? `P${playerIdx + 1}` :
           state === 'connecting' ? (retryAttempt > 0 ? `Đang kết nối... (${retryAttempt}/3)` : 'Đang kết nối...') :
           'Mất kết nối — reload lại'}
        </span>
      </div>

      {/* ── L / R Shoulder ── */}
      <ShoulderBtn btnIdx={BTN.L} label="L" side="left"  press={press} release={release} />
      <ShoulderBtn btnIdx={BTN.R} label="R" side="right" press={press} release={release} />

      {/* ── D-Pad (single zone, slide to steer) ── */}
      <DPad
        press={press} release={release}
        style={{ left: '3vmin', top: '50%', transform: 'translateY(-50%)' }}
      />

      {/* ── Face Buttons: 3×3 diamond grid ──
          Layout:  [_][X][_]
                   [Y][_][A]
                   [_][B][_]
          Each cell: 13vmin, gap: 1.5vmin → total 42.5vmin × 42.5vmin
      ── */}
      <div style={{
        position: 'absolute',
        right: '3vmin',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 13vmin)',
        gridTemplateRows: 'repeat(3, 13vmin)',
        gap: '1.5vmin',
      }}>
        {/* Row 1 */}
        <div />
        <FaceBtn btnIdx={BTN.X} label="X" accent="#2563EB" press={press} release={release} />
        <div />
        {/* Row 2 */}
        <FaceBtn btnIdx={BTN.Y} label="Y" accent="#DB2777" press={press} release={release} />
        <div />
        <FaceBtn btnIdx={BTN.A} label="A" accent="#059669" press={press} release={release} />
        {/* Row 3 */}
        <div />
        <FaceBtn btnIdx={BTN.B} label="B" accent="#D97706" press={press} release={release} />
        <div />
      </div>

      {/* ── SELECT / START — center of screen ── */}
      <PillBtn btnIdx={BTN.SELECT} label="SELECT" press={press} release={release}
        style={{
          left: 'calc(50% - 14vmin)',
          top: 'calc(50% - 3vmin)',
          width: '12vmin', height: '6vmin',
        }}
      />
      <PillBtn btnIdx={BTN.START} label="START" press={press} release={release}
        style={{
          left: 'calc(50% + 2vmin)',
          top: 'calc(50% - 3vmin)',
          width: '12vmin', height: '6vmin',
        }}
      />

      {/* ── Landscape hint (portrait mode only) ── */}
      {!isLandscape && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 30,
          background: '#08080EEE',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16,
        }}>
          <span style={{ fontSize: 48 }}>📱</span>
          <p style={{ color: '#FAFAFA', fontFamily: 'system-ui', fontWeight: 700, fontSize: 16, margin: 0 }}>
            Xoay ngang điện thoại
          </p>
          <p style={{ color: '#52525B', fontFamily: 'monospace', fontSize: 12, margin: 0 }}>
            Controller cần chế độ landscape
          </p>
          <button
            onClick={forceLandscape}
            style={{
              marginTop: 4,
              padding: '12px 24px',
              borderRadius: 12, border: 'none',
              background: '#7C3AED',
              color: '#fff', fontFamily: 'system-ui', fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Bật màn hình ngang
          </button>
          <p style={{ color: '#52525B', fontFamily: 'monospace', fontSize: 11, margin: 0 }}>
            (Cho phép xoay ngang trên Android fullscreen)
          </p>
        </div>
      )}
    </div>
  )
}

// ── Room join screen ─────────────────────────────────────────────
function RoomJoin({ onJoin }: { onJoin: (id: string) => void }) {
  const [code, setCode] = useState('')
  return (
    <div style={{
      background: '#08080E', minHeight: '100dvh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 320, padding: 24 }}>
        <p style={{ fontFamily: 'system-ui', fontSize: 22, fontWeight: 700, color: '#FAFAFA', textAlign: 'center', marginBottom: 6 }}>
          🕹️ Emulator Controller
        </p>
        <p style={{ fontFamily: 'monospace', fontSize: 12, color: '#52525B', textAlign: 'center', marginBottom: 28 }}>
          Nhập Room Code từ màn hình PC
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && code.length >= 4 && onJoin(code)}
          placeholder="ABC123"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            borderRadius: 12, border: '1px solid #1A1A2E',
            background: '#0F0F1A', padding: '14px 16px',
            fontFamily: 'monospace', fontSize: 26, fontWeight: 700,
            color: '#A78BFA', letterSpacing: 8, textAlign: 'center',
            outline: 'none', display: 'block',
          }}
        />
        <button
          onClick={() => code.length >= 4 && onJoin(code)}
          disabled={code.length < 4}
          style={{
            marginTop: 12, width: '100%', display: 'block',
            borderRadius: 12, border: 'none',
            background: code.length >= 4 ? '#7C3AED' : '#1A1A2E',
            padding: '14px 0',
            fontFamily: 'system-ui', fontSize: 14, fontWeight: 700,
            color: code.length >= 4 ? '#fff' : '#52525B',
            cursor: code.length >= 4 ? 'pointer' : 'not-allowed',
          }}
        >
          Join as Controller
        </button>
      </div>
    </div>
  )
}

// ── Main (reads ?room= from URL) ─────────────────────────────────
function ControllerInner() {
  const searchParams = useSearchParams()
  const [roomId, setRoomId] = useState<string | null>(() => searchParams.get('room'))

  if (!roomId) return <RoomJoin onJoin={setRoomId} />
  return <ControllerView roomId={roomId} />
}

export default function EmulatorControllerPage() {
  return (
    <Suspense fallback={<div style={{ background: '#08080E', minHeight: '100dvh' }} />}>
      <ControllerInner />
    </Suspense>
  )
}
