'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import JSZip from 'jszip'
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
  simulateInput:         (player: number, index: number, value: number) => void
  setControllerPortDevice: (port: number, device: number) => void
}

// libretro RETRO_DEVICE_JOYPAD — the "port has a standard gamepad plugged
// in" device id. Cores auto-connect port 0 but leave port 1+ unconnected
// until told otherwise, so player 2's input is silently ignored by the
// core (not by EmulatorJS) unless we connect it explicitly after start.
const RETRO_DEVICE_JOYPAD = 1

interface EJSEmulator {
  gameManager: EJSManager
}

declare global {
  interface Window {
    EJS_player?:        string
    EJS_gameUrl?:       string
    EJS_gameName?:      string
    EJS_core?:          string
    EJS_pathtodata?:    string
    EJS_startOnLoaded?: boolean
    EJS_biosUrl?:       string
    EJS_emulator?:      EJSEmulator
    EJS_onGameStart?:   () => void
  }
}

// ── Key name (from game-controller presets) → RetroPad index ─────
// P1 (nes.inf / snes.inf / fbneo-p1.inf) + P2 (nes-p2.inf / snes-p2.inf /
// fbneo-p2.inf) use disjoint single-letter key sets so both can be mapped
// in this one global table — player separation itself comes from peerId,
// not from the key string. P1 keys mirror EmulatorJS's own defaults:
// arrows = dpad, z = A, x = B, v = select, Enter = start. P2 uses WASD
// for the dpad. P3/P4 (fbneo-p3.inf / fbneo-p4.inf, arcade-only so far)
// use namespaced tokens instead of single letters — there's no "real
// keyboard" convention to mirror for a 3rd/4th player, so plain unique
// strings avoid any risk of colliding with P1/P2's letters.
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
  // P3 — namespaced tokens (fbneo-p3.inf)
  p3_up: 4, p3_down: 5, p3_left: 6, p3_right: 7,
  p3_mk: 8, p3_lk: 0, p3_mp: 9, p3_lp: 1,
  p3_hp: 10, p3_hk: 11, p3_coin: 2, p3_start: 3,
  // P4 — namespaced tokens (fbneo-p4.inf)
  p4_up: 4, p4_down: 5, p4_left: 6, p4_right: 7,
  p4_mk: 8, p4_lk: 0, p4_mp: 9, p4_lp: 1,
  p4_hp: 10, p4_hk: 11, p4_coin: 2, p4_start: 3,
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
  p3_up: '↑', p3_down: '↓', p3_left: '←', p3_right: '→',
  p3_lp: 'LP', p3_mp: 'MP', p3_hp: 'HP', p3_lk: 'LK', p3_mk: 'MK', p3_hk: 'HK',
  p3_coin: 'COIN', p3_start: 'STA',
  p4_up: '↑', p4_down: '↓', p4_left: '←', p4_right: '→',
  p4_lp: 'LP', p4_mp: 'MP', p4_hp: 'HP', p4_lk: 'LK', p4_mk: 'MK', p4_hk: 'HK',
  p4_coin: 'COIN', p4_start: 'STA',
}

function keyToButton(key: string): number | null {
  if (key in KEY_TO_RETROPAD) return KEY_TO_RETROPAD[key]
  const n = parseInt(key, 10)
  return !isNaN(n) && n >= 0 && n <= 11 ? n : null
}

// ── Supported systems ────────────────────────────────────────────
type System = 'nes' | 'snes' | 'gba' | 'gbc' | 'n64' | 'arcade'

const SYSTEMS: { value: System; label: string; exts: string; core: string }[] = [
  { value: 'nes',    label: 'NES',                     exts: '.nes',      core: 'fceumm'           },
  { value: 'snes',   label: 'SNES',                    exts: '.sfc .smc', core: 'snes9x'           },
  { value: 'gba',    label: 'GBA',                     exts: '.gba',      core: 'mgba'             },
  { value: 'gbc',    label: 'Game Boy',                exts: '.gbc .gb',  core: 'gambatte'         },
  { value: 'n64',    label: 'N64',                     exts: '.n64 .z64', core: 'mupen64plus_next' },
  { value: 'arcade', label: 'Arcade (CP1/CP2/NeoGeo)', exts: '.zip',      core: 'fbneo'            },
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

  const [system,    setSystem]    = useState<System>('nes')
  const [romUrl,    setRomUrl]    = useState<string | null>(null)
  const [romName,   setRomName]   = useState<string | null>(null)
  const [biosUrl,   setBiosUrl]   = useState<string | null>(null)
  const [biosName,  setBiosName]  = useState<string | null>(null)
  const [wrapZip,   setWrapZip]   = useState(false)
  const [gameReady, setGameReady] = useState(false)
  const [romUrlInput,  setRomUrlInput]  = useState('')
  const [urlLoading,   setUrlLoading]   = useState(false)
  const [urlError,     setUrlError]     = useState<string | null>(null)
  const [showRomSwap,  setShowRomSwap]  = useState(false)
  const [cacheStatus,  setCacheStatus]  = useState<'idle' | 'cleaning' | 'done' | 'error'>('idle')
  // iOS Safari has no Fullscreen API for plain elements (only <video> can go
  // native fullscreen there) — requestFullscreen() is either undefined or
  // silently rejects, so the button did nothing on iPhone. Fall back to a
  // CSS-only "fake fullscreen" (fixed, covers the viewport) whenever the
  // real API is missing or fails.
  const [fakeFullscreen, setFakeFullscreen] = useState(false)
  const [runtimeError,   setRuntimeError]   = useState(false)
  // Captured from a window error/unhandledrejection during boot, or from the
  // stall-timeout classification — shown in the error banner so a report
  // like "stuck on iPhone/LG TV" comes with an actual message next time
  // instead of just "still loading, no idea why".
  const [runtimeErrorMsg, setRuntimeErrorMsg] = useState<string | null>(null)
  const [loadAttempt,    setLoadAttempt]    = useState(0)

  const ejsRef     = useRef<EJSManager | null>(null)
  const prevRef    = useRef<Record<string, Record<string, boolean>>>({})
  const blobRef    = useRef<string | null>(null)
  const biosBlobRef = useRef<string | null>(null)
  const scriptRef  = useRef<HTMLScriptElement | null>(null)
  const screenRef  = useRef<HTMLDivElement | null>(null)
  // Mirrors gameReady for the stall-timeout closure below, which is set up
  // once per ROM load and would otherwise only ever see the stale value
  // gameReady had at that time.
  const gameReadyRef = useRef(false)
  useEffect(() => { gameReadyRef.current = gameReady }, [gameReady])

  // Best-effort, silent — used right when the game finishes loading
  // (EJS_onGameStart), which isn't a real user gesture so the browser is
  // very likely to reject it anyway. No fallback here: we don't want to
  // auto-drop the page into the CSS fake-fullscreen overlay without the
  // user actually asking for it.
  const tryAutoFullscreen = useCallback(() => {
    screenRef.current?.requestFullscreen?.().catch(() => { /* expected — no active user gesture */ })
  }, [])

  // The manual "⛶" button — a real user gesture, so requestFullscreen()
  // should work here even where the auto-attempt above didn't. On iOS
  // Safari there's no Fullscreen API for a plain <div> at all (only
  // <video> gets native fullscreen there), so this falls back to a
  // CSS-only "fake fullscreen" (fixed, covers the viewport) whenever the
  // real API is missing or still fails.
  const requestFullscreen = useCallback(() => {
    const el = screenRef.current
    if (!el?.requestFullscreen) { setFakeFullscreen(true); return }
    el.requestFullscreen().catch(() => setFakeFullscreen(true))
  }, [])

  const exitFakeFullscreen = useCallback(() => setFakeFullscreen(false), [])

  // Clear all browser storage used by EmulatorJS (Cache API cores, IndexedDB saves, localStorage)
  const cleanCache = async () => {
    setCacheStatus('cleaning')
    try {
      // Release the emulator core's own IndexedDB connection first — otherwise
      // the deleteDatabase calls below are far more likely to get "blocked".
      if (romUrl) resetRom()
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      if ('indexedDB' in window && indexedDB.databases) {
        const dbs = await indexedDB.databases()
        await Promise.all(dbs.map((db) => db.name ? new Promise<void>((res) => {
          const req = indexedDB.deleteDatabase(db.name!)
          const finish = () => res()
          req.onsuccess = finish
          req.onerror   = finish
          // Fires instead of onsuccess/onerror when something (e.g. the
          // emulator core, or another tab) still holds an open connection
          // to this database — deletion stays queued and completes once
          // that connection closes, but we shouldn't block the UI on it.
          req.onblocked = finish
          setTimeout(finish, 3000)
        }) : Promise.resolve()))
      }
      localStorage.clear()
      setCacheStatus('done')
    } catch {
      setCacheStatus('error')
    } finally {
      setTimeout(() => setCacheStatus('idle'), 3000)
    }
  }

  // Called by phone controller when player pastes a ROM URL
  const loadRomFromUrl = useCallback(async (url: string, sys: string) => {
    const targetSys = SYSTEMS.some((s) => s.value === sys) ? (sys as System) : system
    setSystem(targetSys)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const nameFromUrl = decodeURIComponent(url.split('/').pop()?.split(/[?#]/)[0] || '')
      const name = nameFromUrl || 'rom' + (SYSTEMS.find((s) => s.value === targetSys)?.exts.split(' ')[0] ?? '')
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
      setRomName(name)
      setGameReady(false)
      ejsRef.current = null
      const blobUrl = URL.createObjectURL(blob)
      blobRef.current = blobUrl
      setRomUrl(blobUrl)
    } catch { /* silent fail — phone user sees no error UI on host */ }
  }, [system])

  const { players, playerInputs, kickPlayer } = useGameController(roomId, loadRomFromUrl)

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
  const handleRomFile = async (file: File) => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    setRomName(file.name)
    setGameReady(false)
    ejsRef.current = null

    // Some EmulatorJS builds auto-extract a .zip passed as EJS_gameUrl
    // before handing it to the core, which can corrupt the archive
    // structure FBNeo's MAME-derived loader expects to open itself.
    // Wrapping in one more outer zip is a reported workaround for that —
    // but it's unconfirmed for this specific build, so it's opt-in via
    // the checkbox rather than always-on, letting you test both ways.
    let uploadBlob: Blob = file
    if (system === 'arcade' && wrapZip && file.name.toLowerCase().endsWith('.zip')) {
      const wrapper = new JSZip()
      wrapper.file(file.name, file)
      uploadBlob = await wrapper.generateAsync({ type: 'blob', compression: 'STORE' })
    }

    const url = URL.createObjectURL(uploadBlob)
    blobRef.current = url
    setRomUrl(url)
  }

  // ── Import ROM directly from a URL (skips the manual download step) ──
  // Only works if the host serves the file with CORS allowed for this
  // origin — most ROM sites don't, so this is best-effort with a clear
  // error message rather than a guaranteed feature.
  const handleRomUrlImport = async (afterSuccess?: () => void) => {
    const trimmed = romUrlInput.trim()
    if (!trimmed) return
    setUrlError(null)
    setUrlLoading(true)
    try {
      const res = await fetch(trimmed)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const nameFromUrl = decodeURIComponent(trimmed.split('/').pop()?.split(/[?#]/)[0] || '')
      const name = nameFromUrl || 'rom' + (SYSTEMS.find((s) => s.value === system)?.exts.split(' ')[0] ?? '')
      await handleRomFile(new File([blob], name, { type: blob.type }))
      setRomUrlInput('')
      afterSuccess?.()
    } catch {
      setUrlError('Không tải được ROM từ link này — thường do server không cho phép CORS. Thử tải file về máy rồi upload thủ công.')
    } finally {
      setUrlLoading(false)
    }
  }

  // ── Handle BIOS file pick (arcade only, e.g. neogeo.zip) ───────
  const handleBiosFile = (file: File) => {
    if (biosBlobRef.current) URL.revokeObjectURL(biosBlobRef.current)
    const url = URL.createObjectURL(file)
    biosBlobRef.current = url
    setBiosUrl(url)
    setBiosName(file.name)
  }

  // ── Bootstrap EmulatorJS when romUrl is set ───────────────────
  useEffect(() => {
    if (!romUrl) return

    if (scriptRef.current) {
      try { document.body.removeChild(scriptRef.current) } catch { /* already removed */ }
      scriptRef.current = null
    }
    setRuntimeError(false)
    setRuntimeErrorMsg(null)

    // blob: URLs carry no filename at all (just an opaque id) — FBNeo needs
    // the real filename (its MAME/FBNeo "short name", e.g. "dino.zip") to
    // mount the romset where its own virtual-filesystem lookup expects it.
    // EJS_gameName is EmulatorJS's documented way to supply that name when
    // the URL itself can't. Keep the extension: dropping it got the driver
    // recognized ("dino" is a known game) but the core then reported the
    // archive "not found in your paths" — it's searching for "dino.zip"
    // specifically, not the extension-less name.
    window.EJS_player        = '#ejs-mount'
    window.EJS_gameUrl       = romUrl
    window.EJS_gameName      = romName ?? undefined
    window.EJS_core          = SYSTEMS.find((s) => s.value === system)?.core ?? 'fceumm'
    window.EJS_pathtodata    = EJS_DATA
    // REVERTED: setting this false to force EmulatorJS's own "click to play"
    // start screen (instead of auto-starting) was meant to fix iOS/TV
    // gesture-policy stalls, but it broke loading on every platform,
    // including Android — confirmed by testing, so back to true. The
    // iPhone/LG TV "won't load" bug needs a different root cause; don't
    // touch this flag again without reproducing the actual failure first.
    window.EJS_startOnLoaded = true
    if (biosUrl) window.EJS_biosUrl = biosUrl
    else delete window.EJS_biosUrl
    window.EJS_onGameStart   = () => {
      const gm = window.EJS_emulator?.gameManager ?? null
      ejsRef.current = gm
      // Port 0 has a joypad connected by default; ports 1-3 (players 2-4)
      // need to be connected explicitly or the core ignores their input
      // entirely. Harmless to connect all 3 even for 2-player-max systems
      // like NES/SNES — the extra ports just go unused.
      for (const port of [1, 2, 3]) {
        try { gm?.setControllerPortDevice(port, RETRO_DEVICE_JOYPAD) } catch { /* core doesn't support this many players */ }
      }
      setGameReady(true)
      setRuntimeError(false)
      setRuntimeErrorMsg(null)
      tryAutoFullscreen()
    }

    const s  = document.createElement('script')
    // Cache-bust on retry so a "Thử lại" tap forces a fresh network request
    // instead of reusing whatever just failed.
    s.src    = loadAttempt > 0 ? `${EJS_LOADER}?retry=${loadAttempt}` : EJS_LOADER
    s.async  = true
    s.onerror = () => { setRuntimeError(true); setRuntimeErrorMsg('Không tải được loader.js từ CDN.') }
    document.body.appendChild(s)
    scriptRef.current = s

    // EmulatorJS itself never reports a specific "failed to init" reason —
    // catch whatever error/rejection happens on the page while it's booting
    // (a WASM instantiation failure, an AudioContext/autoplay rejection,
    // an out-of-memory abort, etc.) so a report from an affected device
    // comes back with an actual message instead of just "still loading".
    let capturedDetail: string | null = null
    const onWinError = (e: ErrorEvent) => { capturedDetail = e.message || String(e.error ?? 'unknown error') }
    const onRejection = (e: PromiseRejectionEvent) => { capturedDetail = String(e.reason?.message ?? e.reason ?? 'unhandled rejection') }
    window.addEventListener('error', onWinError)
    window.addEventListener('unhandledrejection', onRejection)

    // EmulatorJS gives no explicit "failed to init" callback — if the game
    // hasn't actually started after a generous timeout (long enough for a
    // big core like FBNeo/N64 to compile WASM even on slow/old hardware),
    // treat it as stalled instead of leaving the "Loading..." badge
    // spinning forever with no feedback.
    const timeout = setTimeout(() => {
      if (!gameReadyRef.current) {
        setRuntimeError(true)
        setRuntimeErrorMsg(
          capturedDetail ??
          (window.EJS_emulator
            ? 'Core đã khởi tạo nhưng game không bao giờ báo sẵn sàng (có thể do trình duyệt chặn tự phát âm thanh, hoặc thiết bị quá yếu để biên dịch core kịp thời).'
            : 'EmulatorJS chưa từng khởi tạo được (window.EJS_emulator không tồn tại) sau 45 giây.')
        )
      }
    }, 45000)

    return () => {
      clearTimeout(timeout)
      window.removeEventListener('error', onWinError)
      window.removeEventListener('unhandledrejection', onRejection)
      if (scriptRef.current && document.body.contains(scriptRef.current)) {
        document.body.removeChild(scriptRef.current)
        scriptRef.current = null
      }
    }
  }, [romUrl, romName, system, biosUrl, tryAutoFullscreen, loadAttempt])

  const retryLoad = useCallback(() => {
    setRuntimeError(false)
    setRuntimeErrorMsg(null)
    setGameReady(false)
    setLoadAttempt((n) => n + 1)
  }, [])

  // Revoke blobs on unmount
  useEffect(() => () => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    if (biosBlobRef.current) URL.revokeObjectURL(biosBlobRef.current)
  }, [])

  // Lock page scroll behind the CSS fake-fullscreen overlay, same as a real
  // fullscreen would — otherwise the page underneath can still scroll on
  // touch devices while the emulator looks fullscreen.
  useEffect(() => {
    if (!fakeFullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [fakeFullscreen])

  const resetRom = () => {
    ejsRef.current = null
    if (scriptRef.current && document.body.contains(scriptRef.current)) {
      document.body.removeChild(scriptRef.current)
      scriptRef.current = null
    }
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null }
    if (biosBlobRef.current) { URL.revokeObjectURL(biosBlobRef.current); biosBlobRef.current = null }
    delete window.EJS_player
    delete window.EJS_gameUrl
    delete window.EJS_gameName
    delete window.EJS_onGameStart
    delete window.EJS_biosUrl
    setRomUrl(null)
    setRomName(null)
    setBiosUrl(null)
    setBiosName(null)
    setGameReady(false)
    setRuntimeError(false)
    setRuntimeErrorMsg(null)
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
                        className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${system === s.value ? 'border-accent/40 bg-accent/10 text-accent-soft' : 'border-border bg-background text-muted hover:text-fg'}`}
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
                      <p className="text-sm font-medium text-fg">Chọn file ROM</p>
                      <p className="mt-0.5 font-mono text-xs text-muted">
                        {SYSTEMS.find((s) => s.value === system)?.exts}
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".nes,.sfc,.smc,.gba,.gbc,.gb,.n64,.z64,.v64,.zip"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleRomFile(f) }}
                      className="hidden"
                    />
                  </label>

                  {/* Import ROM from URL — skips downloading to disk first */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="font-mono text-xs text-muted">hoặc dán link ROM</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="url"
                      value={romUrlInput}
                      onChange={(e) => setRomUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !urlLoading && void handleRomUrlImport()}
                      placeholder="https://example.com/game.zip"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-fg outline-none placeholder:text-muted focus:border-accent/40"
                    />
                    <button
                      onClick={() => void handleRomUrlImport()}
                      disabled={urlLoading || !romUrlInput.trim()}
                      className="shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-medium text-accent-soft transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {urlLoading ? 'Đang tải...' : 'Import'}
                    </button>
                  </div>
                  {urlError && (
                    <p className="mt-2 text-xs text-red-400">{urlError}</p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    Chỉ chạy được nếu server host file cho phép CORS — nhiều trang ROM không hỗ trợ,
                    lúc đó vẫn cần tải về máy rồi upload thủ công như trên.
                  </p>
                </div>

                {/* Arcade troubleshooting: "Romset is unknown" ────────── */}
                {system === 'arcade' && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                    <p className="text-xs font-medium text-amber-300">
                      Nếu báo &quot;Romset is unknown&quot;
                    </p>
                    <p className="text-xs text-muted">
                      1. App tự truyền tên file thật cho FBNeo (kể cả khi upload qua blob) — chỉ cần
                      đặt tên file .zip đúng mã ngắn nội bộ (vd &quot;dino.zip&quot; cho Cadillacs and
                      Dinosaurs), không phải tên mô tả. Tra đúng mã (short name) trong danh sách
                      romset FBNeo/MAME rồi đổi tên trước khi chọn file.
                    </p>
                    <p className="text-xs text-muted">
                      2. Nếu đã đúng tên mà vẫn lỗi, thử bật/tắt tùy chọn bọc zip bên dưới — chưa chắc
                      chiều nào đúng với bản FBNeo đang chạy, cần thử cả 2.
                    </p>
                    <label className="flex items-center gap-2 pt-1 text-xs text-fg">
                      <input
                        type="checkbox"
                        checked={wrapZip}
                        onChange={(e) => setWrapZip(e.target.checked)}
                        className="h-3.5 w-3.5 accent-accent"
                      />
                      Bọc ROM trong 1 lớp zip nữa trước khi upload
                    </label>
                  </div>
                )}

                {/* BIOS upload (arcade only — e.g. Neo Geo needs neogeo.zip) */}
                {system === 'arcade' && (
                  <div>
                    <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
                      BIOS (tùy chọn — Neo Geo cần neogeo.zip)
                    </p>
                    {biosName ? (
                      <div className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
                        <span className="font-mono text-xs text-fg truncate">{biosName}</span>
                        <button
                          onClick={() => {
                            if (biosBlobRef.current) URL.revokeObjectURL(biosBlobRef.current)
                            biosBlobRef.current = null
                            setBiosUrl(null)
                            setBiosName(null)
                          }}
                          className="text-xs text-muted transition-colors hover:text-fg"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-fg">
                        📁 Chọn file BIOS (.zip)
                        <input
                          type="file"
                          accept=".zip"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBiosFile(f) }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                )}

              </div>
            ) : (
              <div
                ref={screenRef}
                // EmulatorJS renders its own always-dark control skin — it
                // isn't aware of the app's light/dark toggle, so force this
                // subtree back to a dark color-scheme regardless of the
                // page theme (otherwise light mode can flip default
                // colors inside its menu/buttons to something unreadable).
                style={{ colorScheme: 'dark' }}
                className={`group flex flex-col overflow-hidden rounded-xl border border-border bg-black ${
                  fakeFullscreen ? 'fixed inset-0 z-[9999] rounded-none border-0' : ''
                }`}
              >
                <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
                  <span className="font-mono text-xs text-muted truncate max-w-xs">{romName}</span>
                  <div className="flex shrink-0 items-center gap-3">
                    {runtimeError ? (
                      <span className="flex items-center gap-1.5 font-mono text-xs text-red-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        Lỗi tải EmulatorJS runtime
                      </span>
                    ) : gameReady ? (
                      <span className="flex items-center gap-1.5 font-mono text-xs text-green-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                        Running
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 font-mono text-xs text-amber-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                        Loading...
                      </span>
                    )}
                    {runtimeError && (
                      <button
                        onClick={retryLoad}
                        className="text-xs text-accent-soft transition-colors hover:text-fg"
                      >
                        ↻ Thử lại
                      </button>
                    )}
                    {fakeFullscreen ? (
                      <button
                        onClick={exitFakeFullscreen}
                        title="Thoát toàn màn hình"
                        className="text-xs text-muted transition-colors hover:text-fg"
                      >
                        ✕ Thoát toàn màn hình
                      </button>
                    ) : gameReady && (
                      <button
                        onClick={requestFullscreen}
                        title="Toàn màn hình"
                        className="text-xs text-muted transition-colors hover:text-fg"
                      >
                        ⛶ Fullscreen
                      </button>
                    )}
                    <button
                      onClick={() => { setShowRomSwap((v) => !v); setUrlError(null) }}
                      className={`text-xs transition-colors ${showRomSwap ? 'text-accent-soft' : 'text-muted hover:text-fg'}`}
                    >
                      🔗 Đổi ROM
                    </button>
                    <button
                      onClick={resetRom}
                      className="text-xs text-muted transition-colors hover:text-fg"
                    >
                      ✕ Reset
                    </button>
                  </div>
                </div>

                {/* ── Inline ROM swap panel (Player 1) ─────────────── */}
                {showRomSwap && (
                  <div className="border-b border-border bg-surface/80 px-4 py-3 space-y-2">
                    <p className="font-mono text-xs text-muted">Dán URL ROM mới để đổi game ngay</p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={romUrlInput}
                        onChange={(e) => setRomUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !urlLoading)
                            void handleRomUrlImport(() => setShowRomSwap(false))
                        }}
                        placeholder="https://example.com/game.nes"
                        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-fg outline-none placeholder:text-muted focus:border-accent/40"
                      />
                      <button
                        onClick={() => void handleRomUrlImport(() => setShowRomSwap(false))}
                        disabled={urlLoading || !romUrlInput.trim()}
                        className="shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-medium text-accent-soft transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {urlLoading ? 'Đang tải...' : 'Tải ROM'}
                      </button>
                    </div>
                    {urlError && <p className="text-xs text-red-400">{urlError}</p>}
                    <p className="text-xs text-muted">
                      Chỉ hoạt động nếu server ROM cho phép CORS. Nếu lỗi thì tải file về máy → dùng nút &quot;✕ Reset&quot; → upload thủ công.
                    </p>
                  </div>
                )}

                {runtimeError && (
                  <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                    <span className="text-3xl">⚠️</span>
                    <p className="text-sm text-fg">Không tải được EmulatorJS runtime.</p>
                    <p className="max-w-sm text-xs text-muted">
                      Thường do CDN emulatorjs.org chập chờn, trình chặn quảng cáo (ad blocker)
                      chặn script, hoặc mạng chặn. Thử tắt ad blocker rồi bấm &quot;↻ Thử lại&quot;,
                      hoặc đổi mạng/wifi khác.
                    </p>
                    {runtimeErrorMsg && (
                      <p className="max-w-sm break-words rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] text-muted">
                        {runtimeErrorMsg}
                      </p>
                    )}
                  </div>
                )}
                {/* EJS mounts here — do NOT conditionally render this div */}
                <div
                  id="ejs-mount"
                  className={`w-full min-h-[400px] group-[:fullscreen]:min-h-0 group-[:fullscreen]:flex-1 ${
                    fakeFullscreen ? 'min-h-0 flex-1' : ''
                  } ${runtimeError ? 'hidden' : ''}`}
                />
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
                    className="break-all text-center font-mono text-xs text-accent-soft underline underline-offset-2 transition-colors hover:text-fg"
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
                      className={`group relative rounded-xl border p-2.5 text-center transition-all ${player ? BADGE_CLS[i] : 'border-border bg-background opacity-40'}`}
                    >
                      {player && (
                        <button
                          onClick={() => kickPlayer(player.peerId)}
                          title="Ngắt kết nối"
                          className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-xs text-muted hover:border-red-500 hover:text-red-400 group-hover:flex"
                        >
                          ✕
                        </button>
                      )}
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


            {/* Multiplayer tips */}
            <div className="rounded-xl border border-border/50 bg-surface/60 p-3 space-y-1.5 text-xs text-muted">
              <p className="font-medium text-fg">Multiplayer</p>
              <p>→ Tối đa 4 người chơi. Mỗi người scan QR từ điện thoại riêng.</p>
              <p>→ P1 = người join đầu tiên. P2, P3, P4 = lần lượt tiếp theo.</p>
              <p>→ NES/SNES: chọn layout &quot;— Player 1&quot; / &quot;— Player 2&quot; đúng thứ tự join.</p>
              <p>→ Arcade: chọn layout &quot;Arcade Fighter — Player 1/2/3/4&quot; đủ 6 nút đấm/đá + combo 3P/3K.</p>
              <p>→ Game phải hỗ trợ multiplayer (không phải game nào cũng có).</p>
            </div>

            {/* Cache cleanup */}
            <div className="rounded-xl border border-border/50 bg-surface/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">Dọn cache game</p>
                  <p className="text-xs text-muted">Xóa file core/WASM, save state, localStorage — dùng sau khi chơi xong để giải phóng bộ nhớ</p>
                </div>
                <button
                  onClick={() => void cleanCache()}
                  disabled={cacheStatus !== 'idle'}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    cacheStatus === 'done'     ? 'border-green-500/40 bg-green-500/10 text-green-400' :
                    cacheStatus === 'error'    ? 'border-red-500/40   bg-red-500/10   text-red-400'   :
                    cacheStatus === 'cleaning' ? 'border-border bg-background text-muted'              :
                    'border-border bg-background text-muted hover:border-accent/40 hover:text-fg'
                  }`}
                >
                  {cacheStatus === 'cleaning' ? 'Đang xóa...' :
                   cacheStatus === 'done'     ? '✓ Đã xóa'    :
                   cacheStatus === 'error'    ? '✕ Lỗi'       :
                   '🗑 Dọn cache'}
                </button>
              </div>
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
