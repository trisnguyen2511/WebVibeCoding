'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { ToolShell } from '@/components/tool-shell'
import { useGameController } from '@/hooks/use-game-controller'
import { joinRoom, InputMessage } from '@/lib/webrtc'
import { parseInf, ControllerConfig, DpadConfig } from '@/lib/inf-parser'

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

// ── Cross-browser Fullscreen API (vendor prefixes for older WebViews) ──
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
  mozRequestFullScreen?: () => Promise<void>
  msRequestFullscreen?: () => Promise<void>
}
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
  mozFullScreenElement?: Element | null
  mozCancelFullScreen?: () => Promise<void>
  msFullscreenElement?: Element | null
  msExitFullscreen?: () => Promise<void>
}

function getFullscreenElement(): Element | null {
  const doc = document as FullscreenDocument
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.mozFullScreenElement ?? doc.msFullscreenElement ?? null
}

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ── D-Pad / Joystick Control ─────────────────────────────────────
function DpadControl({
  config,
  sendKey,
}: {
  config: DpadConfig
  sendKey: (key: string, state: 'pressed' | 'released') => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const activeKeysRef = useRef<Set<string>>(new Set())
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [thumbPos, setThumbPos] = useState<{ x: number; y: number } | null>(null)
  const [activeDir, setActiveDir] = useState<string[]>([])

  const getDirectionKeys = (dx: number, dy: number, radius: number): string[] => {
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < radius * 0.2) return []

    const angle = (Math.atan2(dy, dx) * 180) / Math.PI  // -180 to 180
    const norm = (angle + 360) % 360                     // 0 to 360, 0 = right

    if (!config.diagonal) {
      // 4-way — 90° zones
      if (norm >= 315 || norm < 45) return [config.right]
      if (norm >= 45 && norm < 135) return [config.down]
      if (norm >= 135 && norm < 225) return [config.left]
      return [config.up]
    }

    // 8-way — 45° zones
    if (norm >= 337.5 || norm < 22.5) return [config.right]
    if (norm >= 22.5 && norm < 67.5) return [config.right, config.down]
    if (norm >= 67.5 && norm < 112.5) return [config.down]
    if (norm >= 112.5 && norm < 157.5) return [config.left, config.down]
    if (norm >= 157.5 && norm < 202.5) return [config.left]
    if (norm >= 202.5 && norm < 247.5) return [config.left, config.up]
    if (norm >= 247.5 && norm < 292.5) return [config.up]
    return [config.right, config.up]
  }

  const applyDirectionKeys = (newKeys: string[]) => {
    const prev = activeKeysRef.current
    Array.from(prev).forEach((k) => {
      if (!newKeys.includes(k)) sendKey(k, 'released')
    })
    newKeys.forEach((k) => {
      if (!prev.has(k)) sendKey(k, 'pressed')
    })
    activeKeysRef.current = new Set(newKeys)
    setActiveDir(newKeys)
  }

  const handleMove = (clientX: number, clientY: number) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    const radius = rect.width / 2

    // Thumb visual clamped to 60% of radius
    const dist = Math.sqrt(dx * dx + dy * dy)
    const clamp = Math.min(dist, radius * 0.6)
    const angle = Math.atan2(dy, dx)
    setThumbPos({
      x: 50 + (Math.cos(angle) * clamp / radius) * 100,
      y: 50 + (Math.sin(angle) * clamp / radius) * 100,
    })

    applyDirectionKeys(getDirectionKeys(dx, dy, radius))
  }

  const handleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    handleMove(e.clientX, e.clientY)
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current)
    holdIntervalRef.current = setInterval(() => {
      Array.from(activeKeysRef.current).forEach((k) => sendKey(k, 'pressed'))
    }, config.holdInterval)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return
    handleMove(e.clientX, e.clientY)
  }

  const handleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null }
    applyDirectionKeys([])
    setThumbPos(null)
  }

  useEffect(() => {
    return () => {
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current)
    }
  }, [])

  const isActive = (key: string) => activeDir.includes(key)

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: `${config.x}%`,
        top: `${config.y}%`,
        width: `${config.size}vmin`,
        height: `${config.size}vmin`,
        borderRadius: '50%',
        touchAction: 'none',
      }}
      onPointerDown={handleDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onContextMenu={(e) => e.preventDefault()}
      className="no-callout select-none border border-[#1A1A2E] bg-[#0F0F1A]/90"
    >
      {/* Cross groove lines */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-px w-[70%] bg-[#1A1A2E]" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-[70%] w-px bg-[#1A1A2E]" />
      </div>

      {/* Arrow labels */}
      <span className={`absolute left-1/2 top-[8%] -translate-x-1/2 text-[11px] font-bold pointer-events-none transition-colors ${isActive(config.up) ? 'text-white' : 'text-[#52525B]'}`}>↑</span>
      <span className={`absolute bottom-[8%] left-1/2 -translate-x-1/2 text-[11px] font-bold pointer-events-none transition-colors ${isActive(config.down) ? 'text-white' : 'text-[#52525B]'}`}>↓</span>
      <span className={`absolute left-[8%] top-1/2 -translate-y-1/2 text-[11px] font-bold pointer-events-none transition-colors ${isActive(config.left) ? 'text-white' : 'text-[#52525B]'}`}>←</span>
      <span className={`absolute right-[8%] top-1/2 -translate-y-1/2 text-[11px] font-bold pointer-events-none transition-colors ${isActive(config.right) ? 'text-white' : 'text-[#52525B]'}`}>→</span>

      {/* Diagonal labels (only when diagonal=true) */}
      {config.diagonal && (
        <>
          <span className={`absolute left-[14%] top-[14%] text-[9px] pointer-events-none transition-colors ${isActive(config.up) && isActive(config.left) ? 'text-white' : 'text-[#1A1A2E]'}`}>↖</span>
          <span className={`absolute right-[14%] top-[14%] text-[9px] pointer-events-none transition-colors ${isActive(config.up) && isActive(config.right) ? 'text-white' : 'text-[#1A1A2E]'}`}>↗</span>
          <span className={`absolute bottom-[14%] left-[14%] text-[9px] pointer-events-none transition-colors ${isActive(config.down) && isActive(config.left) ? 'text-white' : 'text-[#1A1A2E]'}`}>↙</span>
          <span className={`absolute bottom-[14%] right-[14%] text-[9px] pointer-events-none transition-colors ${isActive(config.down) && isActive(config.right) ? 'text-white' : 'text-[#1A1A2E]'}`}>↘</span>
        </>
      )}

      {/* Thumb dot */}
      {thumbPos && (
        <div
          style={{
            position: 'absolute',
            left: `${thumbPos.x}%`,
            top: `${thumbPos.y}%`,
            transform: 'translate(-50%, -50%)',
            width: '38%',
            height: '38%',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
          className="bg-[#7C3AED]/70 border border-[#7C3AED] shadow-[0_0_12px_#7C3AED88]"
        />
      )}

      {/* Center dot (resting state) */}
      {!thumbPos && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '22%',
            height: '22%',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
          className="bg-[#1A1A2E] border border-[#2A2A3E]"
        />
      )}
    </div>
  )
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
      ws.onclose = () => { setAgentStatus('disconnected'); wsRef.current = null }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { wsRef.current?.close(); wsRef.current = null }
  }, [mode])

  useEffect(() => {
    const prev = prevRef.current
    for (const [peerId, btns] of Object.entries(playerInputs)) {
      const prevBtns = prev[peerId] ?? {}
      for (const [key, pressed] of Object.entries(btns)) {
        if (pressed !== prevBtns[key]) {
          if (mode === 'agent' && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'button', key, state: pressed ? 'pressed' : 'released', peerId }))
          }
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
          <button onClick={copy} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-white">
            Copy Link
          </button>
          <button onClick={() => setShowQR((v) => !v)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-white">
            {showQR ? 'Hide QR' : 'QR Code'}
          </button>
        </div>
      </div>

      {/* QR Code — clickable link */}
      {showQR && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-6">
          <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden">
            <QRCodeSVG value={url} size={180} bgColor="#0F0F1A" fgColor="#FAFAFA" />
          </a>
          <p className="text-xs text-muted">Scan with phone to join as controller</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-accent-soft underline underline-offset-2 hover:text-white transition-colors break-all text-center">
            {url}
          </a>
        </div>
      )}

      {/* Mode selector */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted">Input Mode</p>
        <div className="flex gap-3">
          <button
            onClick={() => setMode('browser')}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${mode === 'browser' ? 'border-[#7C3AED] bg-[#7C3AED]/20 text-[#A78BFA]' : 'border-border bg-[#08080E] text-muted hover:text-white'}`}
          >
            <span className="block text-base">🌐</span>
            Browser Mode
            <span className="mt-0.5 block text-xs font-normal opacity-70">Events in-page only</span>
          </button>
          <button
            onClick={() => setMode('agent')}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${mode === 'agent' ? 'border-[#7C3AED] bg-[#7C3AED]/20 text-[#A78BFA]' : 'border-border bg-[#08080E] text-muted hover:text-white'}`}
          >
            <span className="block text-base">🖥️</span>
            Local Agent
            <span className="mt-0.5 block text-xs font-normal opacity-70">Injects OS keypresses</span>
          </button>
        </div>
        {mode === 'agent' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${agentStatus === 'connected' ? 'bg-green-400' : agentStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-sm text-muted">
                {agentStatus === 'connected' ? 'Agent connected — keypresses active' : agentStatus === 'connecting' ? `Connecting to ${AGENT_WS_URL}...` : `Agent not running on ${AGENT_WS_URL}`}
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
        <p className="mb-3 text-xs uppercase tracking-widest text-muted">Players — {players.length}/{MAX_PLAYERS} connected</p>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const player = players.find((p) => p.playerIndex === i)
            const color = PLAYER_COLORS[i]
            const pressed = player ? Object.entries(playerInputs[player.peerId] ?? {}).filter(([, v]) => v).map(([k]) => k) : []
            return (
              <div key={i} className={`group relative rounded-xl border p-3 text-center transition-all duration-200 ${player ? color.badge : 'border-border bg-surface opacity-40'}`}>
                {player && (
                  <button onClick={() => kickPlayer(player.peerId)} title="Remove player" className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-[#08080E] text-xs text-muted hover:border-red-500 hover:text-red-400 group-hover:flex">
                    ✕
                  </button>
                )}
                <div className="flex items-center justify-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${player ? color.dot : 'bg-muted'}`} />
                  <span className="text-xs font-bold">P{i + 1}</span>
                </div>
                <p className="mt-1 font-mono text-xs truncate">{player ? (pressed.length > 0 ? pressed.join('+') : '●') : '—'}</p>
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
              <span className={`mr-2 rounded border px-1.5 py-0.5 text-xs ${PLAYER_COLORS[(entry.player - 1) % MAX_PLAYERS].badge}`}>P{entry.player}</span>
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
  type Preset = 'nes' | 'nes-p2' | 'snes' | 'snes-p2' | 'wasd' | 'arcade-p1' | 'arcade-p2' | 'arcade-p3' | 'arcade-p4' | 'fbneo-p1' | 'fbneo-p2' | 'fbneo-p3' | 'fbneo-p4'
  const [preset, setPreset] = useState<Preset>('nes')
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
          <div className="space-y-1">
            <p className="text-xs text-[#52525B]">Preset</p>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
              className="w-full rounded-xl border border-[#1A1A2E] bg-[#0F0F1A] px-4 py-3 font-mono text-sm text-white outline-none focus:border-[#7C3AED]"
            >
              <optgroup label="── Classic ──">
                <option value="nes">NES — Player 1</option>
                <option value="nes-p2">NES — Player 2</option>
                <option value="snes">SNES — Player 1</option>
                <option value="snes-p2">SNES — Player 2</option>
              </optgroup>
              <optgroup label="── PC ──">
                <option value="wasd">WASD</option>
              </optgroup>
              <optgroup label="── Arcade 4P ──">
                <option value="arcade-p1">Arcade P1 (Arrows + Z/X/C/V)</option>
                <option value="arcade-p2">Arcade P2 (WASD + J/K/L/U)</option>
                <option value="arcade-p3">Arcade P3 (TFGH + Y/R/E/Q)</option>
                <option value="arcade-p4">Arcade P4 (IBNO + P/M/,/.)</option>
              </optgroup>
              <optgroup label="── Arcade Fighter (CP1/CP2/NeoGeo) ──">
                <option value="fbneo-p1">Arcade Fighter — Player 1</option>
                <option value="fbneo-p2">Arcade Fighter — Player 2</option>
                <option value="fbneo-p3">Arcade Fighter — Player 3</option>
                <option value="fbneo-p4">Arcade Fighter — Player 4</option>
              </optgroup>
            </select>
          </div>
        )}

        {customName && (
          <div className="flex items-center justify-between rounded-xl border border-[#1A1A2E] bg-[#0F0F1A] px-4 py-3">
            <div>
              <p className="text-xs text-[#52525B]">Custom layout</p>
              <p className="font-mono text-sm text-white">{config?.name ?? customName}</p>
            </div>
            <button onClick={() => { setCustomName(null); setConfig(null) }} className="text-xs text-[#52525B] hover:text-white">✕</button>
          </div>
        )}

        <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#1A1A2E] bg-[#0F0F1A] px-4 py-3 text-sm text-[#52525B] transition-colors hover:text-white">
          Import custom .inf
          <input type="file" accept=".inf" onChange={handleImport} className="hidden" />
        </label>

        {parseError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 font-mono text-xs text-red-400">{parseError}</div>
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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const connRef = useRef<{
    sendInput: (m: Omit<InputMessage, 'peerId'>) => void
    disconnect: () => void
  } | null>(null)

  const holdTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const holdIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({})
  const comboFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!getFullscreenElement())
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange']
    events.forEach((ev) => document.addEventListener(ev, onFsChange))
    return () => events.forEach((ev) => document.removeEventListener(ev, onFsChange))
  }, [])

  const toggleFullscreen = () => {
    const el = document.documentElement as FullscreenElement
    if (!getFullscreenElement()) {
      const request = el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.mozRequestFullScreen ?? el.msRequestFullscreen
      request?.call(el)?.catch?.(() => {})
    } else {
      const doc = document as FullscreenDocument
      const exit = document.exitFullscreen ?? doc.webkitExitFullscreen ?? doc.mozCancelFullScreen ?? doc.msExitFullscreen
      exit?.call(document)?.catch?.(() => {})
    }
  }

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
      Object.values(holdTimersRef.current).forEach(clearTimeout)
      Object.values(holdIntervalsRef.current).forEach(clearInterval)
    }
  }, [roomId])

  const sendKey = (key: string, state: 'pressed' | 'released') => {
    connRef.current?.sendInput({ type: 'button', key, state, ts: Date.now() })
  }

  const onDown = (id: string) => {
    const btn = config.buttons[id]
    sendKey(btn.key, 'pressed')
    if (navigator.vibrate) navigator.vibrate(6)

    if (btn.hold) {
      holdTimersRef.current[id] = setTimeout(() => {
        holdIntervalsRef.current[id] = setInterval(() => {
          sendKey(btn.key, 'pressed')
        }, btn.holdInterval)
      }, btn.holdDelay)
    }
  }

  const onUp = (id: string) => {
    const btn = config.buttons[id]
    sendKey(btn.key, 'released')
    clearTimeout(holdTimersRef.current[id])
    clearInterval(holdIntervalsRef.current[id])
    delete holdTimersRef.current[id]
    delete holdIntervalsRef.current[id]
  }

  const onComboDown = (comboId: string) => {
    const combo = config.combos[comboId]
    for (const key of combo.chord) sendKey(key, 'pressed')
    if (navigator.vibrate) navigator.vibrate(10)
    if (comboFlashRef.current) clearTimeout(comboFlashRef.current)
    setActiveCombo(combo.label)
    comboFlashRef.current = setTimeout(() => setActiveCombo(null), 800)
  }

  const onComboUp = (comboId: string) => {
    const combo = config.combos[comboId]
    for (const key of combo.chord) sendKey(key, 'released')
  }

  const color = PLAYER_COLORS[(playerIndex ?? 0) % MAX_PLAYERS]
  const hasCombo = Object.keys(config.combos).length > 0

  const badgeText =
    status === 'connecting' ? 'Connecting...' :
    status === 'disconnected' ? 'Disconnected' :
    `Player ${(playerIndex ?? 0) + 1}`

  return (
    <div
      className="no-callout relative h-[100dvh] w-full overflow-hidden bg-[#08080E]"
      style={{ touchAction: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Player badge */}
      <div className={`absolute left-2 top-2 z-10 rounded-full border px-3 py-1 text-xs font-bold ${color.badge}`}>
        {badgeText}
      </div>

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[#1A1A2E] bg-[#0F0F1A]/90 text-base text-white"
      >
        {isFullscreen ? '⤡' : '⛶'}
      </button>

      {/* Combo flash */}
      {activeCombo && (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-[#7C3AED] bg-[#7C3AED]/30 px-4 py-1.5 font-mono text-sm font-bold text-[#A78BFA] animate-pulse pointer-events-none">
          ✦ {activeCombo}
        </div>
      )}

      {/* Combo hint bar */}
      {hasCombo && (
        <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-2 pointer-events-none">
          {Object.entries(config.combos).map(([cid, combo]) => (
            <span key={cid} className="rounded-full border border-[#7C3AED]/40 bg-[#0F0F1A]/80 px-2 py-0.5 font-mono text-xs text-[#A78BFA]">
              {combo.label}: {combo.chord.join('+')}
            </span>
          ))}
        </div>
      )}

      {/* D-Pad joysticks */}
      {Object.entries(config.dpads).map(([id, dpad]) => (
        <DpadControl key={id} config={dpad} sendKey={sendKey} />
      ))}

      {/* Regular buttons */}
      {Object.entries(config.buttons).map(([id, btn]) => (
        <button
          key={id}
          style={{ position: 'absolute', left: `${btn.x}%`, top: `${btn.y}%`, width: `${btn.w}%`, height: `${btn.h}%` }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onDown(id) }}
          onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); onUp(id) }}
          onPointerCancel={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); onUp(id) }}
          className="relative flex flex-col items-center justify-center rounded-xl border border-[#1A1A2E] bg-[#0F0F1A] font-display text-sm font-bold text-white select-none touch-none active:bg-[#7C3AED]/30 active:border-[#7C3AED]"
        >
          {btn.label}
          {btn.hold && <span className="absolute bottom-0.5 right-1 text-[8px] text-[#52525B]">↻</span>}
        </button>
      ))}

      {/* Combo buttons — purple tint */}
      {Object.entries(config.combos).map(([cid, combo]) => (
        <button
          key={cid}
          style={{ position: 'absolute', left: `${combo.x}%`, top: `${combo.y}%`, width: `${combo.w}%`, height: `${combo.h}%` }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onComboDown(cid) }}
          onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); onComboUp(cid) }}
          onPointerCancel={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); onComboUp(cid) }}
          className="relative flex flex-col items-center justify-center rounded-xl border border-[#7C3AED]/60 bg-[#7C3AED]/10 font-display text-xs font-bold text-[#A78BFA] select-none touch-none active:bg-[#7C3AED]/40 active:border-[#7C3AED]"
        >
          {combo.label}
          <span className="absolute bottom-0.5 text-[7px] text-[#7C3AED]/70">✦</span>
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
      <ToolShell name="Game Controller" icon="🎮" description="Use phones as wireless gamepads — up to 8 players">
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
