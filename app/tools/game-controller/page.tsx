'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { ToolShell } from '@/components/tool-shell'
import { useGameController } from '@/hooks/use-game-controller'
import { joinRoom, InputMessage } from '@/lib/webrtc'
import { parseInf, ControllerConfig } from '@/lib/inf-parser'

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ── PC Side (host) ───────────────────────────────────────────────
function PCController({ roomId }: { roomId: string }) {
  const { connected, buttons } = useGameController(roomId)
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/tools/game-controller?room=${roomId}`
  const [log, setLog] = useState<string[]>([])

  useEffect(() => {
    const pressed = Object.entries(buttons)
      .filter(([, v]) => v)
      .map(([k]) => k)
    if (pressed.length) setLog(prev => [`→ ${pressed.join(' + ')} pressed`, ...prev].slice(0, 8))
  }, [buttons])

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-400' : 'bg-muted'}`} />
        <span className="text-sm text-muted">{connected ? 'Phone connected — ready' : 'Waiting for phone...'}</span>
        <span className="ml-auto font-mono text-xs text-muted">Room: {roomId}</span>
      </div>
      {!connected && (
        <div className="flex justify-center rounded-2xl border border-border bg-surface p-6">
          <QRCodeSVG value={url} size={200} bgColor="#0F0F1A" fgColor="#FAFAFA" />
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted">Input Log</p>
        {log.length === 0
          ? <p className="text-sm text-muted">No input yet</p>
          : log.map((l, i) => <p key={i} className="font-mono text-sm text-white">{l}</p>)
        }
      </div>
    </div>
  )
}

// ── Phone Side (controller) ───────────────────────────────────────
function PhoneController({ roomId, config }: { roomId: string; config: ControllerConfig }) {
  const connectionRef = useRef<{ sendInput: (m: InputMessage) => void; disconnect: () => void } | null>(null)

  useEffect(() => {
    joinRoom(roomId).then(conn => { connectionRef.current = conn })
    return () => connectionRef.current?.disconnect()
  }, [roomId])

  const send = (key: string, state: 'pressed' | 'released') => {
    connectionRef.current?.sendInput({ type: 'button', key, state, ts: Date.now() })
    if (state === 'pressed' && navigator.vibrate) navigator.vibrate(20)
  }

  return (
    <div className="relative h-screen w-full bg-background">
      {Object.entries(config.buttons).map(([id, btn]) => (
        <button
          key={id}
          style={{
            position: 'absolute',
            left: `${btn.x}%`,
            top: `${btn.y}%`,
            width: `${btn.w}%`,
            height: `${btn.h}%`,
          }}
          onPointerDown={() => send(id, 'pressed')}
          onPointerUp={() => send(id, 'released')}
          onPointerLeave={() => send(id, 'released')}
          className="flex items-center justify-center rounded-xl border border-border bg-surface font-display text-sm font-bold text-white active:bg-accent/30 active:border-accent select-none touch-none"
        >
          {btn.label}
        </button>
      ))}
    </div>
  )
}

// ── Main Page (inner, uses hooks) ────────────────────────────────
function GameControllerInner() {
  const searchParams = useSearchParams()
  const incomingRoom = searchParams.get('room')
  const isPhone = !!incomingRoom

  const [roomId] = useState(incomingRoom ?? generateRoomId)
  const [config, setConfig] = useState<ControllerConfig | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [preset, setPreset] = useState<'nes' | 'snes'>('nes')

  // Load default preset
  useEffect(() => {
    fetch(`/controller-presets/${preset}.inf`)
      .then(r => r.text())
      .then(text => {
        const { config: parsed, error } = parseInf(text)
        if (error) setParseError(error)
        else setConfig(parsed)
      })
  }, [preset])

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { config: parsed, error } = parseInf(text)
      if (error) { setParseError(error); return }
      setParseError(null)
      setConfig(parsed)
      localStorage.setItem('controller-layout', text)
    }
    reader.readAsText(file)
  }

  // Phone view — no shell, fullscreen controller
  if (isPhone && config) {
    return <PhoneController roomId={roomId} config={config} />
  }

  return (
    <ToolShell name="Game Controller" icon="🎮" description="Use your phone as a wireless gamepad">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">Preset:</span>
          {(['nes', 'snes'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                preset === p
                  ? 'border-accent bg-accent/20 text-accent-soft'
                  : 'border-border bg-surface text-muted hover:text-white'
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
          <label className="ml-auto cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:text-white">
            Import .inf
            <input type="file" accept=".inf" onChange={handleImport} className="hidden" />
          </label>
        </div>
        {parseError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 font-mono text-xs text-red-400">
            {parseError}
          </div>
        )}
        {config && <PCController roomId={roomId} />}
      </div>
    </ToolShell>
  )
}

// Suspense wrapper required by useSearchParams in App Router
export default function GameControllerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <GameControllerInner />
    </Suspense>
  )
}
