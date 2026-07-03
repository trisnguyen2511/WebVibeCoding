'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ToolShell } from '@/components/tool-shell'
import { useGameController } from '@/hooks/use-game-controller'

// ── EmulatorJS CDN ───────────────────────────────────────────────
const EJS_LOADER = 'https://cdn.emulatorjs.org/stable/data/loader.js'
const EJS_DATA   = 'https://cdn.emulatorjs.org/stable/data/'

// ── EJS global types ─────────────────────────────────────────────
// Real API: window.EJS_emulator.gameManager.simulateInput(player, index, value)
// (there is no EJS_GameManager global and no pressButton/releaseButton method —
// calling those silently no-ops every input, which is why controls never worked)
interface EJSManager {
  simulateInput: (player: number, index: number, value: number) => void
}

interface EJSEmulator {
  gameManager: EJSManager
}

declare global {
  interface Window {
    EJS_player?:        string
    EJS_gameUrl?:       string
    EJS_core?:          string
    EJS_pathtodata?:    string
    EJS_startOnLoaded?: boolean
    EJS_emulator?:      EJSEmulator
    EJS_onGameStart?:   () => void
  }
}

// ── Key name (from game-controller presets) → RetroPad index ─────
// P1 preset (nes.inf / snes.inf) + P2 preset (nes-p2.inf / snes-p2.inf)
// use disjoint key sets so both can be mapped in this one global table —
// player separation itself comes from peerId, not from the key string.
// P1 keys mirror EmulatorJS's own defaults: arrows = dpad, z = A, x = B,
// v = select, Enter = start. P2 uses WASD for the dpad.
const KEY_TO_RETROPAD: Record<string, number> = {
  // P1 — arrows + z/x/c/f/v/Enter/q/e
  ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7,
  z: 8,      // A
  x: 0,      // B
  c: 9,      // X (SNES)
  f: 1,      // Y (SNES)
  v: 2,      // SELECT
  Enter: 3,  // START
  q: 10,     // L (SNES)
  e: 11,     // R (SNES)
  // P2 — WASD + n/m/h/g/u/o/y/p
  w: 4, a: 6, s: 5, d: 7,
  n: 8,      // A
  m: 0,      // B
  h: 9,      // X (SNES)
  g: 1,      // Y (SNES)
  u: 2,      // SELECT
  o: 3,      // START
  y: 10,     // L (SNES)
  p: 11,     // R (SNES)
}

const KEY_LABEL: Record<string, string> = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  z: 'A', x: 'B', c: 'X', f: 'Y',
  v: 'SEL', Enter: 'STA',
  q: 'L', e: 'R',
  w: '↑', a: '←', s: '↓', d: '→',
  n: 'A', m: 'B', h: 'X', g: 'Y',
  u: 'SEL', o: 'STA',
  y: 'L', p: 'R',
}

function keyToButton(key: string): number | null {
  if (key in KEY_TO_RETROPAD) return KEY_TO_RETROPAD[key]
  const n = parseInt(key, 10)
  return !isNaN(n) && n >= 0 && n <= 11 ? n : null
}

// ── Supported systems ────────────────────────────────────────────
type System = 'nes' | 'snes' | 'gba' | 'gbc' | 'n64'

const SYSTEMS: { value: System; label: string; exts: string; core: string }[] = [
  { value: 'nes',  label: 'NES',       exts: '.nes',      core: 'fceumm'           },
  { value: 'snes', label: 'SNES',      exts: '.sfc .smc', core: 'snes9x'           },
  { value: 'gba',  label: 'GBA',       exts: '.gba',      core: 'mgba'             },
  { value: 'gbc',  label: 'Game Boy',  exts: '.gbc .gb',  core: 'gambatte'         },
  { value: 'n64',  label: 'N64',       exts: '.n64 .z64', core: 'mupen64plus_next' },
]

// ── Free legal homebrew ROMs ─────────────────────────────────────
const FREE_ROMS = [
  { name: 'Blade Buster',  system: 'nes',  desc: 'Shoot-em-up — freeware by High Level Challenge', url: 'https://www.romhacking.net/homebrew/105/' },
  { name: 'Alter Ego',     system: 'nes',  desc: 'Puzzle platformer — freeware by Shiru',          url: 'https://www.romhacking.net/homebrew/2/'   },
  { name: 'Böbl',          system: 'nes',  desc: 'Platformer — free demo by Morphcat Games',        url: 'https://morphcatgames.itch.io/bobl'        },
  { name: 'Anguna',        system: 'gba',  desc: 'Action RPG — open source, fully free',            url: 'https://www.bitethechili.com/anguna/'      },
  { name: 'pdroms GBA',    system: 'gba',  desc: 'Kho tổng hợp homebrew GBA miễn phí',             url: 'https://pdroms.de/gameboy-advance'         },
  { name: 'pdroms NES',    system: 'nes',  desc: 'Kho tổng hợp homebrew NES miễn phí',             url: 'https://pdroms.de/nintendo-entertainment-system' },
]

// ── Player badge colors ──────────────────────────────────────────
const BADGE_CLS = [
  'border-violet-500/40 bg-violet-500/10 text-violet-400',
  'border-blue-500/40   bg-blue-500/10   text-blue-400',
  'border-green-500/40  bg-green-500/10  text-green-400',
  'border-amber-500/40  bg-amber-500/10  text-amber-400',
]
const DOT_CLS = ['bg-violet-400', 'bg-blue-400', 'bg-green-400', 'bg-amber-400']

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ── Host page ────────────────────────────────────────────────────
function EmulatorHost() {
  const [roomId]  = useState(generateRoomId)
  const { players, playerInputs } = useGameController(roomId)

  const [system,    setSystem]    = useState<System>('nes')
  const [romUrl,    setRomUrl]    = useState<string | null>(null)
  const [romName,   setRomName]   = useState<string | null>(null)
  const [gameReady, setGameReady] = useState(false)

  const ejsRef    = useRef<EJSManager | null>(null)
  const prevRef   = useRef<Record<string, Record<string, boolean>>>({})
  const blobRef   = useRef<string | null>(null)
  const scriptRef = useRef<HTMLScriptElement | null>(null)

  const controllerUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/tools/game-controller?room=${roomId}`
    : ''

  // ── Wire controller inputs → EJS button API ──────────────────
  useEffect(() => {
    const prev = prevRef.current
    for (const [peerId, btns] of Object.entries(playerInputs)) {
      const prevBtns = prev[peerId] ?? {}
      const player   = players.find((p) => p.peerId === peerId)
      if (!player) continue
      const pidx = player.playerIndex
      for (const [key, pressed] of Object.entries(btns)) {
        if (pressed === prevBtns[key]) continue
        const btnIdx = keyToButton(key)
        if (btnIdx !== null) {
          try {
            ejsRef.current?.simulateInput(pidx, btnIdx, pressed ? 1 : 0)
          } catch { /* ejs not ready yet */ }
        }
      }
    }
    prevRef.current = playerInputs
  }, [playerInputs, players])

  // ── Handle ROM file pick ──────────────────────────────────────
  const handleRomFile = (file: File) => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    const url = URL.createObjectURL(file)
    blobRef.current = url
    setRomUrl(url)
    setRomName(file.name)
    setGameReady(false)
    ejsRef.current = null
  }

  // ── Bootstrap EmulatorJS when romUrl is set ───────────────────
  useEffect(() => {
    if (!romUrl) return

    if (scriptRef.current) {
      try { document.body.removeChild(scriptRef.current) } catch { /* already removed */ }
      scriptRef.current = null
    }

    window.EJS_player        = '#ejs-mount'
    window.EJS_gameUrl       = romUrl
    window.EJS_core          = SYSTEMS.find((s) => s.value === system)?.core ?? 'fceumm'
    window.EJS_pathtodata    = EJS_DATA
    window.EJS_startOnLoaded = true
    window.EJS_onGameStart   = () => {
      ejsRef.current = window.EJS_emulator?.gameManager ?? null
      setGameReady(true)
    }

    const s  = document.createElement('script')
    s.src    = EJS_LOADER
    s.async  = true
    document.body.appendChild(s)
    scriptRef.current = s

    return () => {
      if (scriptRef.current && document.body.contains(scriptRef.current)) {
        document.body.removeChild(scriptRef.current)
        scriptRef.current = null
      }
    }
  }, [romUrl, system])

  // Revoke blob on unmount
  useEffect(() => () => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current)
  }, [])

  const resetRom = () => {
    ejsRef.current = null
    if (scriptRef.current && document.body.contains(scriptRef.current)) {
      document.body.removeChild(scriptRef.current)
      scriptRef.current = null
    }
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null }
    delete window.EJS_player
    delete window.EJS_gameUrl
    delete window.EJS_onGameStart
    setRomUrl(null)
    setRomName(null)
    setGameReady(false)
  }

  return (
    <ToolShell
      name="Emulator"
      icon="🕹️"
      description="Nintendo emulator trực tiếp trên web — điện thoại làm controller, multiplayer"
      wide
    >
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_270px]">

          {/* ── LEFT: Emulator ── */}
          <div className="space-y-4">
            {!romUrl ? (
              <div className="rounded-xl border border-border bg-surface p-5 space-y-5">
                {/* System picker */}
                <div>
                  <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">Hệ máy</p>
                  <div className="flex flex-wrap gap-2">
                    {SYSTEMS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setSystem(s.value)}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${system === s.value ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-border bg-background text-muted hover:text-white'}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ROM upload */}
                <div>
                  <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">Upload ROM</p>
                  <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-background p-10 transition-colors hover:border-accent/40 hover:bg-accent/5">
                    <span className="text-4xl">📁</span>
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">Chọn file ROM</p>
                      <p className="mt-0.5 font-mono text-xs text-muted">
                        {SYSTEMS.find((s) => s.value === system)?.exts}
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".nes,.sfc,.smc,.gba,.gbc,.gb,.n64,.z64,.v64"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRomFile(f) }}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Free homebrew list */}
                <div>
                  <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
                    ROM miễn phí hợp pháp — tải về rồi upload
                  </p>
                  <div className="space-y-1.5">
                    {FREE_ROMS.map((r) => (
                      <a
                        key={r.name}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-xs transition-colors hover:border-accent/30 hover:bg-accent/5"
                      >
                        <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs ${system === r.system ? 'border border-accent/40 bg-accent/10 text-accent-soft' : 'border border-border text-muted'}`}>
                          {r.system.toUpperCase()}
                        </span>
                        <span className="font-medium text-white">{r.name}</span>
                        <span className="hidden flex-1 text-muted sm:block">{r.desc}</span>
                        <span className="ml-auto shrink-0 text-accent-soft">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
                  <span className="font-mono text-xs text-muted truncate max-w-xs">{romName}</span>
                  <div className="flex shrink-0 items-center gap-3">
                    {gameReady && (
                      <span className="flex items-center gap-1.5 font-mono text-xs text-green-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                        Running
                      </span>
                    )}
                    {!gameReady && (
                      <span className="flex items-center gap-1.5 font-mono text-xs text-amber-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                        Loading...
                      </span>
                    )}
                    <button
                      onClick={resetRom}
                      className="text-xs text-muted transition-colors hover:text-white"
                    >
                      ✕ Đổi game
                    </button>
                  </div>
                </div>
                {/* EJS mounts here — do NOT conditionally render this div */}
                <div id="ejs-mount" style={{ width: '100%', minHeight: 400 }} />
              </div>
            )}
          </div>

          {/* ── RIGHT: Room + Players ── */}
          <div className="flex flex-col gap-4">
            {/* QR + room code */}
            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div>
                <p className="font-mono text-xs text-muted">Room code</p>
                <p className="font-mono text-2xl font-bold tracking-widest text-accent-soft">{roomId}</p>
              </div>
              {controllerUrl && (
                <div className="flex flex-col items-center gap-2">
                  <div className="overflow-hidden rounded-xl bg-white p-2.5">
                    <QRCodeSVG value={controllerUrl} size={150} bgColor="#FFFFFF" fgColor="#08080E" />
                  </div>
                  <p className="text-center font-mono text-xs text-muted">
                    Điện thoại scan QR để join làm controller
                  </p>
                  <a
                    href={controllerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-center font-mono text-xs text-accent-soft underline underline-offset-2 transition-colors hover:text-white"
                  >
                    Mở controller →
                  </a>
                </div>
              )}
            </div>

            {/* Player slots */}
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">
                Controllers — {players.filter((p) => p.connected).length}/4
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }, (_, i) => {
                  const player = players.find((p) => p.playerIndex === i && p.connected)
                  const btns   = player
                    ? Object.entries(playerInputs[player.peerId] ?? {})
                        .filter(([, v]) => v)
                        .map(([k]) => KEY_LABEL[k] ?? k)
                    : []
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border p-2.5 text-center transition-all ${player ? BADGE_CLS[i] : 'border-border bg-background opacity-40'}`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span className={`h-2 w-2 rounded-full ${player ? DOT_CLS[i] : 'bg-muted/30'}`} />
                        <span className="text-xs font-bold">P{i + 1}</span>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs">
                        {player ? (btns.length ? btns.join('+') : '●') : '—'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Legal note */}
            <div className="rounded-xl border border-border/50 bg-surface/60 p-3 space-y-1 text-xs text-muted">
              <p className="font-medium text-white">Lưu ý pháp lý</p>
              <p>Phần mềm emulator hoàn toàn hợp pháp. ROM do bạn tự cung cấp — không lưu trên server, không upload lên internet.</p>
            </div>

            {/* Multiplayer tips */}
            <div className="rounded-xl border border-border/50 bg-surface/60 p-3 space-y-1.5 text-xs text-muted">
              <p className="font-medium text-white">Multiplayer</p>
              <p>→ Tối đa 4 người chơi. Mỗi người scan QR từ điện thoại riêng.</p>
              <p>→ P1 = người join đầu tiên. P2 = thứ hai, v.v.</p>
              <p>→ Người join đầu chọn layout &quot;NES/SNES — Player 1&quot;, người join thứ hai chọn &quot;— Player 2&quot; để tránh trùng phím.</p>
              <p>→ Game phải hỗ trợ multiplayer (không phải game nào cũng có).</p>
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  )
}

export default function EmulatorPage() {
  return <EmulatorHost />
}
