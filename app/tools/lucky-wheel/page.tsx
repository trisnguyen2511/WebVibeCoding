'use client'
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { ToolShell } from '@/components/tool-shell'

// ------- palette -------
const SEG_COLORS = [
  '#7C3AED', '#2563EB', '#059669', '#D97706',
  '#DC2626', '#0891B2', '#9333EA', '#16A34A',
  '#EA580C', '#4F46E5', '#DB2777', '#0D9488',
]

const WHEEL_SIZE = 340
const MAX_ITEMS  = 100

// ------- speed levels (wording updated) -------
const SPEED_LEVELS = [
  {
    label:    'Tà tà',
    icon:     '🐢',
    timeHint: '~2–3 giây',
    desc:     'Vài vòng rồi dừng ngay — hợp khi cần quyết định nhanh',
    minSpins: 2,   maxSpins: 3,
    minDur:   2000, maxDur:  3000,
    easePow:  3,
    activeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    barClass:    'bg-emerald-500',
  },
  {
    label:    'Bình thường',
    icon:     '🎯',
    timeHint: '~4–5 giây',
    desc:     'Cân bằng giữa tốc độ và cảm giác — lựa chọn mặc định',
    minSpins: 5,   maxSpins: 7,
    minDur:   3500, maxDur:  5000,
    easePow:  4,
    activeClass: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
    barClass:    'bg-blue-500',
  },
  {
    label:    'Hồi hộp',
    icon:     '😬',
    timeHint: '~6–8 giây',
    desc:     'Nhiều vòng hơn, khó đoán hơn — bắt đầu có cảm giác hồi hộp',
    minSpins: 8,   maxSpins: 12,
    minDur:   6000, maxDur:  8000,
    easePow:  5,
    activeClass: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    barClass:    'bg-amber-500',
  },
  {
    label:    'Nín thở',
    icon:     '😰',
    timeHint: '~10–13 giây',
    desc:     'Rất nhiều vòng, giảm tốc siêu chậm — tim đập mạnh khi gần dừng',
    minSpins: 15,  maxSpins: 20,
    minDur:   10000, maxDur: 13000,
    easePow:  6,
    activeClass: 'border-red-500/40 bg-red-500/10 text-red-400',
    barClass:    'bg-red-500',
  },
  {
    label:    'Cực căng',
    icon:     '🌀',
    timeHint: '~15–18 giây',
    desc:     '⚠️ ~30 vòng, tốc độ giảm cực chậm — không dành cho người yếu tim!',
    minSpins: 28,  maxSpins: 36,
    minDur:   15000, maxDur: 18000,
    easePow:  8,
    activeClass: 'border-accent/40 bg-accent/10 text-accent-soft',
    barClass:    'bg-accent',
  },
] as const

// ------- presets -------
const PRESETS = [
  { label: 'Có / Không',      options: ['Có ✅', 'Không ❌', 'Có thể 🤔', 'Hỏi lại 🔄'] },
  { label: 'Ăn gì?',          options: ['Phở 🍜', 'Cơm tấm 🍚', 'Bún bò 🥣', 'Bánh mì 🥖', 'Sushi 🍣', 'Pizza 🍕', 'Burger 🍔', 'Gà rán 🍗'] },
  { label: 'Xúc xắc 🎲',     options: ['1', '2', '3', '4', '5', '6'] },
  { label: 'Truth / Dare',    options: ['Truth 💬', 'Dare 🎯', 'Truth 💬', 'Dare 🎯', 'Skip ⏭️', '2× Dare 🔥'] },
  { label: 'Ngày trong tuần', options: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'] },
  { label: 'Nhóm làm việc',   options: ['Team A 🔵', 'Team B 🔴', 'Team C 🟢', 'Team D 🟡'] },
  { label: 'Custom',          options: ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3', 'Lựa chọn 4'] },
]

// ------- wheel painter -------
function paintWheel(canvas: HTMLCanvasElement, items: string[], rotDeg: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const cx  = WHEEL_SIZE / 2
  const cy  = WHEEL_SIZE / 2
  const R   = WHEEL_SIZE / 2 - 8
  const n   = items.length
  const seg = (Math.PI * 2) / n
  const rot = (rotDeg * Math.PI) / 180

  ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE)

  // Glow ring
  ctx.save()
  ctx.shadowColor = 'rgba(124,58,237,0.38)'
  ctx.shadowBlur  = 20
  ctx.beginPath()
  ctx.arc(cx, cy, R + 1, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(124,58,237,0.22)'
  ctx.lineWidth   = 3
  ctx.stroke()
  ctx.restore()

  const fontSize = Math.max(7, Math.min(13, 120 / n))
  const maxChars = Math.max(4, Math.floor(64 / n))

  for (let i = 0; i < n; i++) {
    const a0  = rot - Math.PI / 2 + i * seg
    const a1  = a0 + seg
    const mid = a0 + seg / 2

    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, R, a0, a1)
    ctx.closePath()
    ctx.fillStyle   = SEG_COLORS[i % SEG_COLORS.length]
    ctx.fill()
    ctx.strokeStyle = 'rgba(8,8,14,0.7)'
    ctx.lineWidth   = n > 30 ? 0.5 : 1.5
    ctx.stroke()

    // Only draw label if segment is large enough to be readable
    if (n <= 60) {
      const raw   = items[i]
      const label = raw.length > maxChars ? raw.slice(0, maxChars - 1) + '…' : raw
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(mid)
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.font         = `bold ${fontSize}px Inter, system-ui, sans-serif`
      ctx.fillStyle    = '#fff'
      ctx.shadowColor  = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur   = 3
      ctx.fillText(label, R * 0.62, 0)
      ctx.restore()
    }
  }

  // Hub
  const hub = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 20)
  hub.addColorStop(0, '#A78BFA')
  hub.addColorStop(1, '#4C1D95')
  ctx.beginPath()
  ctx.arc(cx, cy, 20, 0, Math.PI * 2)
  ctx.fillStyle   = hub
  ctx.fill()
  ctx.strokeStyle = '#08080E'
  ctx.lineWidth   = 2.5
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx - 5, cy - 5, 5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fill()
}

// ------- page -------
export default function LuckyWheelPage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const audioRef   = useRef<AudioContext | null>(null)
  const animRef    = useRef<number | null>(null)
  const rotRef     = useRef(0)
  const lastSegRef = useRef(-1)

  const [items,           setItems]           = useState(PRESETS[0].options)
  const [spinning,        setSpinning]        = useState(false)
  const [result,          setResult]          = useState<string | null>(null)
  const [history,         setHistory]         = useState<string[]>([])
  const [editMode,        setEditMode]        = useState(false)
  const [pasteMode,       setPasteMode]       = useState(false)
  const [newItem,         setNewItem]         = useState('')
  const [bulkText,        setBulkText]        = useState('')
  const [activePreset,    setActivePreset]    = useState(0)
  const [speedIdx,        setSpeedIdx]        = useState(1)
  const [removeAfterSpin, setRemoveAfterSpin] = useState(false)

  // Parse pasted text → array of items
  const parsedBulk = useMemo(() =>
    bulkText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 30),
    [bulkText]
  )

  // audio
  const getAudio = useCallback((): AudioContext | null => {
    try {
      if (!audioRef.current)
        audioRef.current = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      return audioRef.current
    } catch { return null }
  }, [])

  const playTick = useCallback(() => {
    const ac = getAudio()
    if (!ac) return
    try {
      const o = ac.createOscillator(); const g = ac.createGain()
      o.connect(g); g.connect(ac.destination)
      o.frequency.value = 550 + Math.random() * 250
      g.gain.setValueAtTime(0.07, ac.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.04)
      o.start(); o.stop(ac.currentTime + 0.04)
    } catch { /* ignore */ }
  }, [getAudio])

  const playWin = useCallback(() => {
    const ac = getAudio()
    if (!ac) return
    try {
      ;[523, 659, 784, 1047].forEach((f, i) => {
        const o = ac.createOscillator(); const g = ac.createGain()
        o.connect(g); g.connect(ac.destination)
        o.frequency.value = f
        g.gain.setValueAtTime(0.1,   ac.currentTime + i * 0.13)
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.13 + 0.22)
        o.start(ac.currentTime + i * 0.13)
        o.stop(ac.currentTime  + i * 0.13 + 0.22)
      })
    } catch { /* ignore */ }
  }, [getAudio])

  // draw
  const draw = useCallback((rot: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    paintWheel(canvas, items, rot)
    const n  = items.length
    const pa = ((-rot % 360) + 360) % 360
    const cur = Math.floor(pa / (360 / n)) % n
    if (cur !== lastSegRef.current) { lastSegRef.current = cur; playTick() }
  }, [items, playTick])

  useEffect(() => { draw(rotRef.current) }, [draw])

  // spin
  const spin = useCallback(() => {
    if (spinning || items.length < 2) return
    setResult(null)
    setSpinning(true)
    lastSegRef.current = -1

    const { minSpins, maxSpins, minDur, maxDur, easePow } = SPEED_LEVELS[speedIdx]
    const spins    = minSpins + Math.random() * (maxSpins - minSpins)
    const extra    = spins * 360 + Math.random() * 360
    const startRot = rotRef.current
    const endRot   = startRot + extra
    const dur      = minDur + Math.random() * (maxDur - minDur)
    const t0       = performance.now()
    const ease     = (t: number) => 1 - Math.pow(1 - t, easePow)

    const frame = (now: number) => {
      const t   = Math.min((now - t0) / dur, 1)
      const cur = startRot + (endRot - startRot) * ease(t)
      rotRef.current = cur
      draw(cur)
      if (t < 1) {
        animRef.current = requestAnimationFrame(frame)
      } else {
        setSpinning(false)
        const n   = items.length
        const pa  = ((-endRot % 360) + 360) % 360
        const idx = Math.floor(pa / (360 / n)) % n
        const winner = items[idx]
        setResult(winner)
        setHistory((h) => [winner, ...h].slice(0, 50))
        if (removeAfterSpin && items.length > 2) {
          setItems((p) => p.filter((_, j) => j !== idx))
          rotRef.current = 0
        }
        playWin()
      }
    }
    animRef.current = requestAnimationFrame(frame)
  }, [spinning, items, speedIdx, draw, playWin, removeAfterSpin])

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current) }, [])

  // item management — no hard limit, max 100
  const addItem = () => {
    const v = newItem.trim()
    if (!v || items.length >= MAX_ITEMS) return
    setItems((p) => [...p, v]); setNewItem(''); setResult(null)
  }

  const addBulk = () => {
    if (!parsedBulk.length) return
    setItems((p) => [...p, ...parsedBulk].slice(0, MAX_ITEMS))
    setBulkText(''); setResult(null)
  }

  const replaceBulk = () => {
    if (parsedBulk.length < 2) return
    setItems(parsedBulk.slice(0, MAX_ITEMS))
    setBulkText(''); setResult(null); rotRef.current = 0
  }

  const removeItem = (i: number) => {
    if (items.length <= 2) return
    setItems((p) => p.filter((_, j) => j !== i)); setResult(null)
  }

  const updateItem = (i: number, val: string) =>
    setItems((p) => p.map((o, j) => (j === i ? val : o)))

  const deleteHistory = (i: number) =>
    setHistory((h) => h.filter((_, j) => j !== i))

  const loadPreset = (i: number) => {
    setActivePreset(i); setItems([...PRESETS[i].options])
    setResult(null); setEditMode(false); setPasteMode(false)
    setBulkText(''); rotRef.current = 0
  }

  const activeSpeed = SPEED_LEVELS[speedIdx]

  // ------- render -------
  return (
    <ToolShell
      name="Lucky Wheel"
      icon="🎡"
      description="Vòng quay may mắn — không giới hạn lựa chọn, 5 mức độ hồi hộp"
    >
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">

          {/* ── Left: wheel + controls ── */}
          <div className="flex flex-col items-center gap-4">

            {/* Canvas */}
            <div className="relative select-none">
              <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-0.5">
                <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
                  <polygon points="11,26 0,0 22,0" fill="url(#ptrGrad)" />
                  <defs>
                    <linearGradient id="ptrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#A78BFA" />
                      <stop offset="100%" stopColor="#7C3AED" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <canvas
                ref={canvasRef}
                width={WHEEL_SIZE}
                height={WHEEL_SIZE}
                className="rounded-full drop-shadow-xl"
                style={{ maxWidth: `min(${WHEEL_SIZE}px, calc(100vw - 3rem))` }}
              />
            </div>

            {/* ── Speed selector ── */}
            <div className="w-full rounded-xl border border-border bg-surface p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-widest text-muted">Mức độ hồi hộp</p>
                <span className={`rounded-md border px-2 py-0.5 font-mono text-xs ${activeSpeed.activeClass}`}>
                  {activeSpeed.icon} {activeSpeed.timeHint}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {SPEED_LEVELS.map((lvl, i) => {
                  const isActive = speedIdx === i
                  return (
                    <button
                      key={lvl.label}
                      onClick={() => setSpeedIdx(i)}
                      disabled={spinning}
                      title={lvl.desc}
                      className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-xs transition-all disabled:opacity-40 ${
                        isActive ? lvl.activeClass : 'border-border bg-background text-muted hover:text-white'
                      }`}
                    >
                      <span className="text-base leading-none">{lvl.icon}</span>
                      <span className="font-medium leading-tight" style={{ fontSize: '9px' }}>
                        {lvl.label}
                      </span>
                      {/* Signal-strength bars */}
                      <div className="flex items-end gap-0.5">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <div
                            key={j}
                            className={`w-[3px] rounded-sm transition-all ${
                              j <= i
                                ? isActive ? lvl.barClass : 'bg-muted/50'
                                : 'bg-border'
                            }`}
                            style={{ height: `${(j + 1) * 3}px` }}
                          />
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>

              <p className="mt-2 text-center font-mono text-[10px] leading-snug text-muted">
                {activeSpeed.desc}
              </p>
            </div>

            {/* Remove-after-spin toggle */}
            <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/30">
              <input
                type="checkbox"
                checked={removeAfterSpin}
                onChange={(e) => setRemoveAfterSpin(e.target.checked)}
                disabled={spinning}
                className="sr-only"
              />
              <div className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${removeAfterSpin ? 'bg-accent' : 'bg-border'}`}>
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${removeAfterSpin ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white">Xoá mục trúng sau mỗi lượt</p>
                <p className="truncate font-mono text-[10px] text-muted">
                  {removeAfterSpin
                    ? `Còn ${items.length} mục · mỗi lượt quay sẽ xoá winner`
                    : 'Hữu ích khi chọn ngẫu nhiên không trùng lặp'}
                </p>
              </div>
            </label>

            {/* Spin button */}
            <button
              onClick={spin}
              disabled={spinning || items.length < 2}
              className="w-full rounded-2xl py-3.5 font-display text-base font-bold text-white transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
                boxShadow: spinning ? 'none' : '0 0 28px rgba(124,58,237,0.42)',
              }}
            >
              {spinning ? `⏳ Đang quay... (${activeSpeed.label})` : '🎯 Quay ngay!'}
            </button>

            {/* Result */}
            {result && !spinning && (
              <div className="w-full animate-fade-up rounded-2xl border border-accent/40 bg-accent/10 p-5 text-center">
                <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted">Kết quả</p>
                <p className="font-display text-2xl font-bold text-white">{result}</p>
                {removeAfterSpin && (
                  <p className="mt-1 font-mono text-xs text-muted">
                    Đã xoá khỏi bánh xe · còn {items.length} mục
                  </p>
                )}
                <button
                  onClick={spin}
                  disabled={items.length < 2}
                  className="mt-3 text-xs text-accent-soft underline underline-offset-2 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {items.length < 2 ? 'Hết mục để quay' : 'Quay lại'}
                </button>
              </div>
            )}
          </div>

          {/* ── Right panel ── */}
          <div className="flex flex-col gap-4">

            {/* Presets */}
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">Chủ đề có sẵn</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p, i) => (
                  <button
                    key={p.label}
                    onClick={() => loadPreset(i)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      activePreset === i
                        ? 'border-accent/40 bg-accent/15 text-accent-soft'
                        : 'border-border bg-background text-muted hover:border-accent/30 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted">
                    Lựa chọn
                  </p>
                  <span className="rounded-full border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-muted">
                    {items.length}
                  </span>
                  {items.length > 30 && (
                    <span className="text-xs text-amber-400">· Nhiều ô → chữ nhỏ</span>
                  )}
                </div>
                <button
                  onClick={() => { setEditMode((v) => !v); setPasteMode(false); setBulkText('') }}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    editMode ? 'border-accent bg-accent/20 text-accent-soft' : 'border-border text-muted hover:text-white'
                  }`}
                >
                  {editMode ? '✓ Xong' : '✏️ Sửa'}
                </button>
              </div>

              {/* Item list */}
              <div className="max-h-52 space-y-1.5 overflow-y-auto">
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 rounded-lg px-1.5 py-0.5 transition-colors hover:bg-background/40"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: SEG_COLORS[i % SEG_COLORS.length] }}
                    />
                    {editMode ? (
                      <input
                        value={item}
                        onChange={(e) => updateItem(i, e.target.value)}
                        maxLength={30}
                        className="flex-1 rounded-md border border-border bg-background px-2 py-0.5 text-sm text-white outline-none focus:border-accent"
                      />
                    ) : (
                      <span className="flex-1 text-sm text-white">{item}</span>
                    )}
                    {editMode && (
                      <button
                        onClick={() => removeItem(i)}
                        disabled={items.length <= 2}
                        className="shrink-0 text-xs text-muted transition-colors hover:text-red-400 disabled:opacity-25"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Edit controls */}
              {editMode && (
                <div className="mt-3 border-t border-border pt-3">
                  {/* Toggle: single add / paste list */}
                  <div className="mb-2.5 flex gap-1 rounded-lg border border-border bg-background p-0.5">
                    <button
                      onClick={() => setPasteMode(false)}
                      className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${
                        !pasteMode ? 'bg-surface text-white' : 'text-muted hover:text-white'
                      }`}
                    >
                      Thêm từng mục
                    </button>
                    <button
                      onClick={() => setPasteMode(true)}
                      className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${
                        pasteMode ? 'bg-surface text-white' : 'text-muted hover:text-white'
                      }`}
                    >
                      📋 Dán danh sách
                    </button>
                  </div>

                  {/* Single add */}
                  {!pasteMode && items.length < MAX_ITEMS && (
                    <div className="flex gap-2">
                      <input
                        value={newItem}
                        onChange={(e) => setNewItem(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addItem()}
                        placeholder="Nhập lựa chọn rồi Enter..."
                        maxLength={30}
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-white placeholder-muted outline-none focus:border-accent"
                      />
                      <button
                        onClick={addItem}
                        disabled={!newItem.trim()}
                        className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-bold text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  )}

                  {/* Bulk paste */}
                  {pasteMode && (
                    <div className="space-y-2">
                      <textarea
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        placeholder={'Dán danh sách vào đây...\nMỗi dòng = 1 lựa chọn\nHoặc phân tách bằng dấu phẩy'}
                        rows={5}
                        className="w-full resize-none rounded-lg border border-border bg-background p-2.5 font-mono text-sm text-white placeholder-muted outline-none focus:border-accent"
                      />
                      {parsedBulk.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="flex-1 font-mono text-xs text-muted">
                            {parsedBulk.length} mục được nhận diện
                          </span>
                          <button
                            onClick={addBulk}
                            className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent-soft transition-colors hover:bg-accent/20"
                          >
                            + Thêm vào
                          </button>
                          <button
                            onClick={replaceBulk}
                            disabled={parsedBulk.length < 2}
                            className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
                          >
                            Thay thế tất cả
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {items.length >= MAX_ITEMS && (
                    <p className="mt-1.5 text-xs text-amber-400">Đã đạt giới hạn {MAX_ITEMS} lựa chọn</p>
                  )}
                </div>
              )}
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted">Lịch sử quay</p>
                  <button onClick={() => setHistory([])} className="text-xs text-muted transition-colors hover:text-white">
                    Xoá
                  </button>
                </div>
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {history.map((h, i) => (
                    <div
                      key={i}
                      className={`group flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-background/40 ${
                        i === 0 ? 'bg-accent/10 text-white' : 'text-muted'
                      }`}
                    >
                      <span className={`w-6 shrink-0 font-mono text-xs ${i === 0 ? 'text-accent-soft' : 'text-muted'}`}>
                        #{i + 1}
                      </span>
                      <span className="flex-1 truncate">{h}</span>
                      {i === 0 && (
                        <span className="shrink-0 text-xs text-accent-soft">latest</span>
                      )}
                      <button
                        onClick={() => deleteHistory(i)}
                        className="shrink-0 text-xs text-muted opacity-0 transition-all group-hover:opacity-100 hover:text-red-400"
                        title="Xoá record này"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="rounded-xl border border-border/50 bg-surface/60 p-4">
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">Mẹo sử dụng</p>
              <ul className="space-y-1.5 text-xs text-muted">
                <li className="flex gap-2"><span className="text-accent-soft">→</span> Không giới hạn số lựa chọn — dán cả danh sách lớp, team, tên thoải mái</li>
                <li className="flex gap-2"><span className="text-accent-soft">→</span> Chế độ <span className="text-white font-medium">Dán danh sách</span>: mỗi dòng 1 mục hoặc phân tách bằng dấu phẩy</li>
                <li className="flex gap-2"><span className="text-accent-soft">→</span> Mức <span className="text-accent-soft font-medium">Cực căng 🌀</span> quay ~30 vòng, giảm tốc siêu chậm — đảm bảo hồi hộp tột độ</li>
                <li className="flex gap-2"><span className="text-accent-soft">→</span> Bật loa để nghe tick-tick và nhạc fanfare khi kết quả hiện ra</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  )
}
