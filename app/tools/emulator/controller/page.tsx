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

// ── Generic touch button ─────────────────────────────────────────
function TouchBtn({
  btnIdx,
  label,
  style,
  shape = 'rect',
  accent = '#1A1A2E',
  press,
  release,
}: {
  btnIdx: BtnIdx
  label: string
  style: React.CSSProperties
  shape?: 'rect' | 'circle' | 'pill'
  accent?: string
  press: (b: BtnIdx) => void
  release: (b: BtnIdx) => void
}) {
  const [active, setActive] = useState(false)
  const br = shape === 'circle' ? '50%' : shape === 'pill' ? '999px' : '10px'

  return (
    <div
      style={{
        position: 'absolute',
        borderRadius: br,
        border: `1.5px solid ${active ? accent : '#1A1A2E'}`,
        background: active ? `${accent}40` : '#0F0F1A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        touchAction: 'none',
        transition: 'background 0.06s, border-color 0.06s',
        ...style,
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setActive(true)
        press(btnIdx)
        if (navigator.vibrate) navigator.vibrate(18)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        setActive(false)
        release(btnIdx)
      }}
      onPointerCancel={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        setActive(false)
        release(btnIdx)
      }}
    >
      <span style={{
        fontSize: 12, fontWeight: 700, pointerEvents: 'none',
        color: active ? (accent === '#1A1A2E' ? '#fff' : accent) : '#52525B',
        fontFamily: 'system-ui, sans-serif',
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
  const [isLandscape, setIsLandscape] = useState(false)
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
      (idx) => { if (!cancelled) setPlayerIdx(idx) },
      ()    => { if (!cancelled) setState('disconnected') },
      undefined,
      ()    => { if (!cancelled) setState('connected') }
    )
      .then((conn) => { if (cancelled) conn.disconnect(); else connRef.current = conn })
      .catch(console.error)

    return () => {
      cancelled = true
      connRef.current?.disconnect()
      connRef.current = null
    }
  }, [roomId])

  const press = (btn: BtnIdx) =>
    connRef.current?.sendInput({ type: 'button', key: String(btn), state: 'pressed',  ts: Date.now() })

  const release = (btn: BtnIdx) =>
    connRef.current?.sendInput({ type: 'button', key: String(btn), state: 'released', ts: Date.now() })

  const color = P_COLOR[playerIdx % 4]

  // Button dimensions in vmin (scales with viewport min — safe for landscape)
  const S  = '9vmin'   // standard button size
  const SL = '14vmin'  // shoulder button width

  return (
    <div style={{
      background: '#08080E',
      width: '100vw', height: '100dvh',
      position: 'relative', overflow: 'hidden',
      touchAction: 'none',
    }}>
      {/* ── Status badge ── */}
      <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
        <span style={{
          background: `${color}22`, border: `1px solid ${color}`, color,
          borderRadius: 20, padding: '2px 14px',
          fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
          display: 'inline-block', whiteSpace: 'nowrap',
        }}>
          {state === 'connected'    ? `P${playerIdx + 1}`  :
           state === 'connecting'   ? 'Đang kết nối...'    :
           'Mất kết nối — reload lại'}
        </span>
      </div>

      {/* ── L / R Shoulder ── */}
      <TouchBtn btnIdx={BTN.L} label="L"
        style={{ left: '2vmin', top: '4vmin', width: SL, height: '7vmin' }}
        press={press} release={release} />
      <TouchBtn btnIdx={BTN.R} label="R"
        style={{ right: '2vmin', top: '4vmin', width: SL, height: '7vmin' }}
        press={press} release={release} />

      {/* ── D-Pad (cross layout) ── */}
      {/* Up */}
      <TouchBtn btnIdx={BTN.UP} label="▲"
        style={{ left: 'calc(14vmin + 9vmin)', top: '20vmin', width: S, height: S }}
        press={press} release={release} />
      {/* Down */}
      <TouchBtn btnIdx={BTN.DOWN} label="▼"
        style={{ left: 'calc(14vmin + 9vmin)', top: 'calc(20vmin + 18vmin)', width: S, height: S }}
        press={press} release={release} />
      {/* Left */}
      <TouchBtn btnIdx={BTN.LEFT} label="◀"
        style={{ left: '14vmin', top: 'calc(20vmin + 9vmin)', width: S, height: S }}
        press={press} release={release} />
      {/* Right */}
      <TouchBtn btnIdx={BTN.RIGHT} label="▶"
        style={{ left: 'calc(14vmin + 18vmin)', top: 'calc(20vmin + 9vmin)', width: S, height: S }}
        press={press} release={release} />

      {/* ── D-Pad center (visual only) ── */}
      <div style={{
        position: 'absolute',
        left: 'calc(14vmin + 9vmin)', top: 'calc(20vmin + 9vmin)',
        width: S, height: S,
        background: '#0F0F1A', border: '1.5px solid #1A1A2E',
        pointerEvents: 'none',
      }} />

      {/* ── Select / Start ── */}
      <TouchBtn btnIdx={BTN.SELECT} label="SELECT" shape="pill"
        style={{ left: 'calc(50% - 14vmin)', top: '52vmin', width: '11vmin', height: '5vmin' }}
        press={press} release={release} />
      <TouchBtn btnIdx={BTN.START} label="START" shape="pill"
        style={{ left: 'calc(50% + 3vmin)', top: '52vmin', width: '11vmin', height: '5vmin' }}
        press={press} release={release} />

      {/* ── Face Buttons (SNES diamond) ── */}
      {/* X — top, blue */}
      <TouchBtn btnIdx={BTN.X} label="X" shape="circle" accent="#2563EB"
        style={{ right: 'calc(14vmin + 9vmin)', top: '20vmin', width: S, height: S }}
        press={press} release={release} />
      {/* Y — left, pink */}
      <TouchBtn btnIdx={BTN.Y} label="Y" shape="circle" accent="#DB2777"
        style={{ right: 'calc(14vmin + 18vmin)', top: 'calc(20vmin + 9vmin)', width: S, height: S }}
        press={press} release={release} />
      {/* A — right, green */}
      <TouchBtn btnIdx={BTN.A} label="A" shape="circle" accent="#059669"
        style={{ right: '14vmin', top: 'calc(20vmin + 9vmin)', width: S, height: S }}
        press={press} release={release} />
      {/* B — bottom, amber */}
      <TouchBtn btnIdx={BTN.B} label="B" shape="circle" accent="#D97706"
        style={{ right: 'calc(14vmin + 9vmin)', top: 'calc(20vmin + 18vmin)', width: S, height: S }}
        press={press} release={release} />

      {/* ── Landscape hint (portrait mode only) ── */}
      {!isLandscape && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 30,
          background: '#08080EEE',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 48 }}>📱</span>
          <p style={{ color: '#FAFAFA', fontFamily: 'system-ui', fontWeight: 700, fontSize: 16 }}>
            Xoay ngang điện thoại
          </p>
          <p style={{ color: '#52525B', fontFamily: 'monospace', fontSize: 12 }}>
            Controller cần chế độ landscape
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
