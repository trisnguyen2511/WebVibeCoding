'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { ToolShell } from '@/components/tool-shell'
import { useGameController } from '@/hooks/use-game-controller'
import { joinRoom, InputMessage } from '@/lib/webrtc'
import { parseInf, ControllerConfig } from '@/lib/inf-parser'

const MAX_PLAYERS = 8
const AGENT_WS_URL = 'ws://localhost:9999'

const PLAYER_COLORS = [
  { badge: 'border-violet-500 bg-violet-500/20 text-violet-300', dot: 'bg-violet-400' },
  { badge: 'border-blue-500 bg-blue-500/20 text-blue-300', dot: 'bg-blue-400' },
  { badge: 'border-green-500 bg-green-500/20 text-green-300', dot: 'bg-green-400' },
  { badge: 'border-yellow-500 bg-yellow-500/20 text-yellow-300', dot: 'bg-yellow-400' },
  { badge: 'border-orange-500 bg-orange-500/20 text-orange-300', dot: 'bg-orange-400' },
  { badge: 'border-red-500 bg-red-500/20 text-red-300', dot: 'bg-red-400' },
  { badge: 'border-pink-500 bg-pink-500/20 text-pink-300', dot: 'bg-pink-400' },
  { badge: 'border-cyan-500 bg-cyan-500/20 text-cyan-300', dot: 'bg-cyan-400' },
]

type HostMode = 'browser' | 'agent'

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ── Host View ────────────────────────────────────────────────────
function HostView({ roomId }: { roomId: string }) {
  const { players, playerInputs, kickPlayer } = useGameController(roomId)
  const [showQR, setShowQR] = useState(true)
  const [mode, setMode] = useState<HostMode>('browser')
  const [agentStatus, setAgentStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [log, setLog] = useState<{ player: number; keys: string }[]>([])
  const prevRef = useRef<Record<string, Record<string, boolean>>>({})
  const wsRef = useRef<WebSocket | null>(null)

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/tools/game-controller?room=${roomId}`
      : ''

  // ── Local Agent WebSocket ──────────────────────────────────────
  useEffect(() => {
    if (mode !== 'agent') {
      wsRef.current?.close()
      wsRef.current = null
      setAgentStatus('disconnected')
      return
    }

    const connect = () => {
      setAgentStatus('connecting')
      const ws = new WebSocket(AGENT_WS_URL)
      wsRef.current = ws
      ws.onopen = () => setAgentStatus('connected')
      ws.onclose = () => {
        setAgentStatus('disconnected')
        wsRef.current = null
      }
      ws.onerror = () => {
        ws.close()
      }
    }

    connect()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [mode])

  // ── Input handler — log + forward to agent ───────────────────
  useEffect(() => {
    const prev = prevRef.current
    for (const [peerId, btns] of Object.entries(playerInputs)) {
      const prevBtns = prev[peerId] ?? {}
      for (const [key, pressed] of Object.entries(btns)) {
        if (pressed !== prevBtns[key]) {
          // Forward to local agent
          if (mode === 'agent' && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'button', key, state: pressed ? 'pressed' : 'released', peerId }))
          }
          // Log new presses only
          if (pressed && !prevBtns[key]) {
            const info = players.find((p) => p.peerId === peerId)
            const playerNum = info ? info.playerIndex + 1 : 0
            setLog((old) => [{ player: playerNum, keys: key }, ...old].slice(0, 12))
          }
        }
      }
    }
    prevRef.current = playerInputs
  }, [playerInputs, players, mode])

  const copy = () => navigator.clipboard?.writeText(url)

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {/* Room header */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="text-xs text-muted">Room ID</p>
          <p className="font-mono text-2xl font-bold tracking-widest text-accent-soft">{roomId}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={copy}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-white"
          >
            Copy Link
          </button>
          <button
            onClick={() => setShowQR((v) => !v)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-white"
          >
            {showQR ? 'Hide QR' : 'QR Code'}
          </button>
        </div>
      </div>

      {/* QR Code */}
      {showQR && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-6">
          <QRCodeSVG value={url} size={180} bgColor="#0F0F1A" fgColor="#FAFAFA" />
          <p className="text-xs text-muted">Scan with phone to join as controller</p>
        </div>
      )}

      {/* Mode selector */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted">Input Mode</p>
        <div className="flex gap-3">
          <button
            onClick={() => setMode('browser')}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${
              mode === 'browser'
                ? 'border-[#7C3AED] bg-[#7C3AED]/20 text-[#A78BFA]'
                : 'border-border bg-[#08080E] text-muted hover:text-white'
            }`}
          >
            <span className="block text-base">🌐</span>
            Browser Mode
            <span className="mt-0.5 block text-xs font-normal opacity-70">Events in-page only</span>
          </button>
          <button
            onClick={() => setMode('agent')}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${
              mode === 'agent'
                ? 'border-[#7C3AED] bg-[#7C3AED]/20 text-[#A78BFA]'
                : 'border-border bg-[#08080E] text-muted hover:text-white'
            }`}
          >
            <span className="block text-base">🖥️</span>
            Local Agent
            <span className="mt-0.5 block text-xs font-normal opacity-70">Injects OS keypresses</span>
          </button>
        </div>

        {/* Agent status + instructions */}
        {mode === 'agent' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${
                agentStatus === 'connected' ? 'bg-green-400' :
                agentStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
              }`} />
              <span className="text-sm text-muted">
                {agentStatus === 'connected' ? 'Agent connected — keypresses active' :
                 agentStatus === 'connecting' ? `Connecting to ${AGENT_WS_URL}...` :
                 `Agent not running on ${AGENT_WS_URL}`}
              </span>
            </div>
            {agentStatus !== 'connected' && (
              <div className="rounded-lg border border-border bg-[#08080E] p-3 font-mono text-xs text-muted space-y-1">
                <p className="text-white">Start the local agent:</p>
                <p className="text-[#A78BFA]">cd local-agent</p>
                <p className="text-[#A78BFA]">npm install</p>
                <p className="text-[#A78BFA]">npm start</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player slots */}
      <div>
        <p className="mb-3 text-xs uppercase tracking-widest text-muted">
          Players — {players.length}/{MAX_PLAYERS} connected
        </p>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const player = players.find((p) => p.playerIndex === i)
            const color = PLAYER_COLORS[i]
            const pressed = player
              ? Object.entries(playerInputs[player.peerId] ?? {})
                  .filter(([, v]) => v)
                  .map(([k]) => k)
              : []

            return (
              <div
                key={i}
                className={`group relative rounded-xl border p-3 text-center transition-all duration-200 ${
                  player ? color.badge : 'border-border bg-surface opacity-40'
                }`}
              >
                {/* Kick button */}
                {player && (
                  <button
                    onClick={() => kickPlayer(player.peerId)}
                    title="Remove player"
                    className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-[#08080E] text-xs text-muted hover:border-red-500 hover:text-red-400 group-hover:flex"
                  >
                    ✕
                  </button>
                )}
                <div className="flex items-center justify-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${player ? color.dot : 'bg-muted'}`} />
                  <span className="text-xs font-bold">P{i + 1}</span>
                </div>
                <p className="mt-1 font-mono text-xs truncate">
                  {player ? (pressed.length > 0 ? pressed.join('+') : '●') : '—'}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Input log */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted">Input Log</p>
        {log.length === 0 ? (
          <p className="text-sm text-muted">Waiting for input...</p>
        ) : (
          log.map((entry, i) => (
            <p key={i} className="font-mono text-sm text-white">
              <span
                className={`mr-2 rounded border px-1.5 py-0.5 text-xs ${
                  PLAYER_COLORS[(entry.player - 1) % MAX_PLAYERS].badge
                }`}
              >
                P{entry.player}
              </span>
              {entry.keys}
            </p>
          ))
        )}
      </div>
    </div>
  )
}

// ── Phone: Layout Setup ──────────────────────────────────────────
function PhoneSetup({ onReady }: { onReady: (config: ControllerConfig) => void }) {
  const [preset, setPreset] = useState<'nes' | 'snes'>('nes')
  const [config, setConfig] = useState<ControllerConfig | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [customName, setCustomName] = useState<string | null>(null)

  useEffect(() => {
    if (customName) return
    const ctrl = new AbortController()
    fetch(`/controller-presets/${preset}.inf`, { signal: ctrl.signal })
      .then((r) => r.text())
      .then((text) => {
        const { config: parsed, error } = parseInf(text)
        if (error) setParseError(error)
        else { setParseError(null); setConfig(parsed) }
      })
      .catch((e) => { if (e.name !== 'AbortError') setParseError(e.message) })
    return () => ctrl.abort()
  }, [preset, customName])

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { config: parsed, error } = parseInf(text)
      if (error) { setParseError(error); return }
      setParseError(null)
      setCustomName(file.name)
      setConfig(parsed)
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#08080E] p-6">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <p className="font-display text-2xl font-bold text-white">Choose Layout</p>
          <p className="mt-1 text-sm text-[#52525B]">Pick a preset or import your own .inf</p>
        </div>

        {!customName && (
          <div className="flex gap-3">
            {(['nes', 'snes'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`flex-1 rounded-xl border px-4 py-3 font-mono text-sm font-bold transition-colors ${
                  preset === p
                    ? 'border-[#7C3AED] bg-[#7C3AED]/20 text-[#A78BFA]'
                    : 'border-[#1A1A2E] bg-[#0F0F1A] text-[#52525B] hover:text-white'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {customName && (
          <div className="flex items-center justify-between rounded-xl border border-[#1A1A2E] bg-[#0F0F1A] px-4 py-3">
            <div>
              <p className="text-xs text-[#52525B]">Custom layout</p>
              <p className="font-mono text-sm text-white">{config?.name ?? customName}</p>
            </div>
            <button
              onClick={() => { setCustomName(null); setConfig(null) }}
              className="text-xs text-[#52525B] hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#1A1A2E] bg-[#0F0F1A] px-4 py-3 text-sm text-[#52525B] transition-colors hover:text-white">
          Import custom .inf
          <input type="file" accept=".inf" onChange={handleImport} className="hidden" />
        </label>

        {parseError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 font-mono text-xs text-red-400">
            {parseError}
          </div>
        )}

        <button
          disabled={!config}
          onClick={() => config && onReady(config)}
          className="w-full rounded-xl bg-[#7C3AED] px-4 py-3 font-bold text-white transition-colors hover:bg-[#7C3AED]/80 disabled:opacity-40"
        >
          Join as Controller
        </button>
      </div>
    </div>
  )
}

// ── Phone: Active Controller ─────────────────────────────────────
function PhoneControllerActive({ roomId, config }: { roomId: string; config: ControllerConfig }) {
  const [playerIndex, setPlayerIndex] = useState<number | null>(null)
  const [status, setStatus] = useState<'connecting' | 'ready' | 'disconnected'>('connecting')
  const [activeCombo, setActiveCombo] = useState<string | null>(null)
  const connRef = useRef<{
    sendInput: (m: Omit<InputMessage, 'peerId'>) => void
    disconnect: () => void
  } | null>(null)

  // Hold & combo state (refs — no re-render needed)
  const heldRef = useRef<Set<string>>(new Set())
  const holdTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const holdIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({})
  const firedCombosRef = useRef<Set<string>>(new Set())
  const comboFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    joinRoom(
      roomId,
      (idx) => { if (!cancelled) { setPlayerIndex(idx); setStatus('ready') } },
      () => { if (!cancelled) setStatus('disconnected') }
    )
      .then((conn) => {
        if (cancelled) conn.disconnect()
        else connRef.current = conn
      })
      .catch((err) => console.error('[game-controller] joinRoom failed:', err))

    return () => {
      cancelled = true
      connRef.current?.disconnect()
      connRef.current = null
      // Clear all timers on unmount
      Object.values(holdTimersRef.current).forEach(clearTimeout)
      Object.values(holdIntervalsRef.current).forEach(clearInterval)
    }
  }, [roomId])

  const sendKey = (key: string, state: 'pressed' | 'released') => {
    connRef.current?.sendInput({ type: 'button', key, state, ts: Date.now() })
  }

  const checkCombos = (held: Set<string>) => {
    for (const [cid, combo] of Object.entries(config.combos)) {
      const allHeld = combo.keys.every((k) => held.has(k))
      if (allHeld && !firedCombosRef.current.has(cid)) {
        firedCombosRef.current.add(cid)
        sendKey(combo.action, 'pressed')
        setTimeout(() => sendKey(combo.action, 'released'), 80)
        if (navigator.vibrate) navigator.vibrate([30, 15, 30])
        // Flash combo label
        if (comboFlashRef.current) clearTimeout(comboFlashRef.current)
        setActiveCombo(combo.label)
        comboFlashRef.current = setTimeout(() => setActiveCombo(null), 800)
      } else if (!allHeld) {
        firedCombosRef.current.delete(cid)
      }
    }
  }

  const onDown = (id: string) => {
    const btn = config.buttons[id]
    heldRef.current.add(id)
    sendKey(btn.key, 'pressed')
    if (navigator.vibrate) navigator.vibrate(20)

    // Hold auto-repeat
    if (btn.hold) {
      holdTimersRef.current[id] = setTimeout(() => {
        holdIntervalsRef.current[id] = setInterval(() => {
          sendKey(btn.key, 'pressed')
        }, btn.holdInterval)
      }, btn.holdDelay)
    }

    checkCombos(heldRef.current)
  }

  const onUp = (id: string) => {
    const btn = config.buttons[id]
    heldRef.current.delete(id)
    sendKey(btn.key, 'released')

    clearTimeout(holdTimersRef.current[id])
    clearInterval(holdIntervalsRef.current[id])
    delete holdTimersRef.current[id]
    delete holdIntervalsRef.current[id]

    checkCombos(heldRef.current)
  }

  const color = PLAYER_COLORS[(playerIndex ?? 0) % MAX_PLAYERS]
  const hasCombo = Object.keys(config.combos).length > 0

  const badgeText =
    status === 'connecting' ? 'Connecting...' :
    status === 'disconnected' ? 'Disconnected' :
    `Player ${(playerIndex ?? 0) + 1}`

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#08080E]">
      {/* Player badge */}
      <div className={`absolute left-2 top-2 z-10 rounded-full border px-3 py-1 text-xs font-bold ${color.badge}`}>
        {badgeText}
      </div>

      {/* Combo flash */}
      {activeCombo && (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-[#7C3AED] bg-[#7C3AED]/30 px-4 py-1.5 font-mono text-sm font-bold text-[#A78BFA] animate-pulse pointer-events-none">
          ✦ {activeCombo}
        </div>
      )}

      {/* Combo list hint (bottom) */}
      {hasCombo && (
        <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-2 pointer-events-none">
          {Object.entries(config.combos).map(([cid, combo]) => (
            <span key={cid} className="rounded-full border border-[#1A1A2E] bg-[#0F0F1A]/80 px-2 py-0.5 font-mono text-xs text-[#52525B]">
              {combo.keys.join('+')} → {combo.label}
            </span>
          ))}
        </div>
      )}

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
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            onDown(id)
          }}
          onPointerUp={() => onUp(id)}
          onPointerCancel={() => onUp(id)}
          className="relative flex flex-col items-center justify-center rounded-xl border border-[#1A1A2E] bg-[#0F0F1A] font-display text-sm font-bold text-white select-none touch-none active:bg-[#7C3AED]/30 active:border-[#7C3AED]"
        >
          {btn.label}
          {btn.hold && (
            <span className="absolute bottom-0.5 right-1 text-[8px] text-[#52525B]">↻</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────
function GameControllerInner() {
  const searchParams = useSearchParams()
  const incomingRoom = searchParams.get('room')
  const isPhone = !!incomingRoom

  const [roomId] = useState(() => incomingRoom ?? generateRoomId())
  const [phoneConfig, setPhoneConfig] = useState<ControllerConfig | null>(null)

  if (!isPhone) {
    return (
      <ToolShell
        name="Game Controller"
        icon="🎮"
        description="Use phones as wireless gamepads — up to 8 players"
      >
        <HostView roomId={roomId} />
      </ToolShell>
    )
  }

  if (!phoneConfig) {
    return <PhoneSetup onReady={setPhoneConfig} />
  }

  return <PhoneControllerActive roomId={roomId} config={phoneConfig} />
}

export default function GameControllerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#08080E]" />}>
      <GameControllerInner />
    </Suspense>
  )
}
