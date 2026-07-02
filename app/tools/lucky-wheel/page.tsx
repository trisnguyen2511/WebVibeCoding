'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { ToolShell } from '@/components/tool-shell'

// ------- constants -------
const SEG_COLORS = [
  '#7C3AED', '#2563EB', '#059669', '#D97706',
  '#DC2626', '#0891B2', '#9333EA', '#16A34A',
  '#EA580C', '#4F46E5', '#DB2777', '#0D9488',
]

const WHEEL_SIZE = 340

const PRESETS = [
  {
    label: 'Có / Không',
    options: ['Có ✅', 'Không ❌', 'Có thể 🤔', 'Hỏi lại 🔄'],
  },
  {
    label: 'Ăn gì?',
    options: ['Phở 🍜', 'Cơm tấm 🍚', 'Bún bò 🥣', 'Bánh mì 🥖', 'Sushi 🍣', 'Pizza 🍕', 'Burger 🍔', 'Gà rán 🍗'],
  },
  {
    label: 'Xúc xắc 🎲',
    options: ['1', '2', '3', '4', '5', '6'],
  },
  {
    label: 'Truth / Dare',
    options: ['Truth 💬', 'Dare 🎯', 'Truth 💬', 'Dare 🎯', 'Skip ⏭️', '2× Dare 🔥'],
  },
  {
    label: 'Ngày trong tuần',
    options: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'],
  },
  {
    label: 'Nhóm làm việc',
    options: ['Team A 🔵', 'Team B 🔴', 'Team C 🟢', 'Team D 🟡'],
  },
  {
    label: 'Custom',
    options: ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3', 'Lựa chọn 4'],
  },
]

// ------- wheel drawing -------
function paintWheel(canvas: HTMLCanvasElement, items: string[], rotDeg: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const cx = WHEEL_SIZE / 2
  const cy = WHEEL_SIZE / 2
  const R = WHEEL_SIZE / 2 - 8
  const n = items.length
  const seg = (Math.PI * 2) / n
  const rot = (rotDeg * Math.PI) / 180

  ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE)

  // Glow ring
  ctx.save()
  ctx.shadowColor = 'rgba(124,58,237,0.38)'
  ctx.shadowBlur = 20
  ctx.beginPath()
  ctx.arc(cx, cy, R + 1, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(124,58,237,0.22)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.restore()

  const fontSize = Math.max(9, Math.min(13, 130 / n))
  const maxChars = Math.max(6, Math.floor(72 / n))

  // Segments
  for (let i = 0; i < n; i++) {
    const a0 = rot - Math.PI / 2 + i * seg
    const a1 = a0 + seg
    const mid = a0 + seg / 2

    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, R, a0, a1)
    ctx.closePath()
    ctx.fillStyle = SEG_COLORS[i % SEG_COLORS.length]
    ctx.fill()
    ctx.strokeStyle = 'rgba(8,8,14,0.7)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Label
    const raw = items[i]
    const label = raw.length > maxChars ? raw.slice(0, maxChars - 1) + '…' : raw
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(mid)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
    ctx.fillStyle = '#fff'
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 3
    ctx.fillText(label, R * 0.62, 0)
    ctx.restore()
  }

  // Hub gradient
  const hub = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 20)
  hub.addColorStop(0, '#A78BFA')
  hub.addColorStop(1, '#4C1D95')
  ctx.beginPath()
  ctx.arc(cx, cy, 20, 0, Math.PI * 2)
  ctx.fillStyle = hub
  ctx.fill()
  ctx.strokeStyle = '#08080E'
  ctx.lineWidth = 2.5
  ctx.stroke()

  // Hub shine
  ctx.beginPath()
  ctx.arc(cx - 5, cy - 5, 5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fill()
}

// ------- main component -------
export default function LuckyWheelPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const animRef = useRef<number | null>(null)
  const rotRef = useRef(0)
  const lastSegRef = useRef(-1)

  const [items, setItems] = useState(PRESETS[0].options)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [editMode, setEditMode] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [activePreset, setActivePreset] = useState(0)

  // --- audio helpers ---
  const getAudio = useCallback((): AudioContext | null => {
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }
      return audioRef.current
    } catch { return null }
  }, [])

  const playTick = useCallback(() => {
    const ac = getAudio()
    if (!ac) return
    try {
      const o = ac.createOscillator()
      const g = ac.createGain()
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
        const o = ac.createOscillator()
        const g = ac.createGain()
        o.connect(g); g.connect(ac.destination)
        o.frequency.value = f
        g.gain.setValueAtTime(0.1, ac.currentTime + i * 0.13)
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + i * 0.13 + 0.22)
        o.start(ac.currentTime + i * 0.13)
        o.stop(ac.currentTime + i * 0.13 + 0.22)
      })
    } catch { /* ignore */ }
  }, [getAudio])

  // --- draw + tick detection ---
  const draw = useCallback((rot: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    paintWheel(canvas, items, rot)
    const n = items.length
    const pa = ((-rot % 360) + 360) % 360
    const cur = Math.floor(pa / (360 / n)) % n
    if (cur !== lastSegRef.current) {
      lastSegRef.current = cur
      playTick()
    }
  }, [items, playTick])

  useEffect(() => { draw(rotRef.current) }, [draw])

  // --- spin ---
  const spin = useCallback(() => {
    if (spinning || items.length < 2) return
    setResult(null)
    setSpinning(true)
    lastSegRef.current = -1

    const extra = (5 + Math.random() * 6) * 360 + Math.random() * 360
    const startRot = rotRef.current
    const endRot = startRot + extra
    const dur = 3500 + Math.random() * 1500
    const t0 = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 4)

    const frame = (now: number) => {
      const t = Math.min((now - t0) / dur, 1)
      const cur = startRot + (endRot - startRot) * ease(t)
      rotRef.current = cur
      draw(cur)
      if (t < 1) {
        animRef.current = requestAnimationFrame(frame)
      } else {
        setSpinning(false)
        const n = items.length
        const pa = ((-endRot % 360) + 360) % 360
        const idx = Math.floor(pa / (360 / n)) % n
        const winner = items[idx]
        setResult(winner)
        setHistory((h) => [winner, ...h].slice(0, 8))
        playWin()
      }
    }
    animRef.current = requestAnimationFrame(frame)
  }, [spinning, items, draw, playWin])

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current) }, [])

  // --- item management ---
  const addItem = () => {
    const v = newItem.trim()
    if (!v || items.length >= 12) return
    setItems((p) => [...p, v])
    setNewItem('')
    setResult(null)
  }

  const removeItem = (i: number) => {
    if (items.length <= 2) return
    setItems((p) => p.filter((_, j) => j !== i))
    setResult(null)
  }

  const updateItem = (i: number, val: string) =>
    setItems((p) => p.map((o, j) => (j === i ? val : o)))

  const loadPreset = (i: number) => {
    setActivePreset(i)
    setItems([...PRESETS[i].options])
    setResult(null)
    setEditMode(false)
    rotRef.current = 0
  }

  // ------- render -------
  return (
    <ToolShell
      name="Lucky Wheel"
      icon="🎡"
      description="Vòng quay may mắn — preset đa dạng, tùy chỉnh không giới hạn"
    >
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">

          {/* ── Wheel + spin button ── */}
          <div className="flex flex-col items-center gap-5">
            <div className="relative select-none">
              {/* Pointer arrow */}
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

            {/* Spin button */}
            <button
              onClick={spin}
              disabled={spinning || items.length < 2}
              className="w-52 rounded-2xl py-3.5 font-display text-base font-bold text-white transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
                boxShadow: spinning ? 'none' : '0 0 28px rgba(124,58,237,0.42)',
              }}
            >
              {spinning ? '⏳ Đang quay...' : '🎯 Quay ngay!'}
            </button>

            {/* Result card */}
            {result && !spinning && (
              <div className="w-full animate-fade-up rounded-2xl border border-accent/40 bg-accent/10 p-5 text-center">
                <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted">Kết quả</p>
                <p className="font-display text-2xl font-bold text-white">{result}</p>
                <button
                  onClick={spin}
                  className="mt-3 text-xs text-accent-soft underline underline-offset-2 transition-colors hover:text-white"
                >
                  Quay lại
                </button>
              </div>
            )}
          </div>

          {/* ── Right panel ── */}
          <div className="flex flex-col gap-4">

            {/* Presets */}
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">
                Chủ đề có sẵn
              </p>
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

            {/* Options list */}
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-widest text-muted">
                  Lựa chọn ({items.length}/12)
                </p>
                <button
                  onClick={() => setEditMode((v) => !v)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    editMode
                      ? 'border-accent bg-accent/20 text-accent-soft'
                      : 'border-border text-muted hover:text-white'
                  }`}
                >
                  {editMode ? '✓ Xong' : '✏️ Sửa'}
                </button>
              </div>

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
                        className="text-xs text-muted transition-colors hover:text-red-400 disabled:opacity-25"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {editMode && items.length < 12 && (
                <div className="mt-3 flex gap-2 border-t border-border pt-3">
                  <input
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addItem()}
                    placeholder="Thêm lựa chọn mới..."
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
            </div>

            {/* Spin history */}
            {history.length > 0 && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted">
                    Lịch sử quay
                  </p>
                  <button
                    onClick={() => setHistory([])}
                    className="text-xs text-muted transition-colors hover:text-white"
                  >
                    Xoá
                  </button>
                </div>
                <div className="space-y-1">
                  {history.map((h, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${
                        i === 0 ? 'bg-accent/10 text-white' : 'text-muted'
                      }`}
                    >
                      <span
                        className={`w-6 font-mono text-xs ${
                          i === 0 ? 'text-accent-soft' : 'text-muted'
                        }`}
                      >
                        #{i + 1}
                      </span>
                      <span className="flex-1">{h}</span>
                      {i === 0 && (
                        <span className="text-xs text-accent-soft">latest</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Usage tips */}
            <div className="rounded-xl border border-border/50 bg-surface/60 p-4">
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
                Mẹo sử dụng
              </p>
              <ul className="space-y-1.5 text-xs text-muted">
                <li className="flex gap-2"><span className="text-accent-soft">→</span> Chọn preset có sẵn hoặc tùy chỉnh lựa chọn</li>
                <li className="flex gap-2"><span className="text-accent-soft">→</span> Tối đa 12 lựa chọn, mỗi lựa chọn tối đa 30 ký tự</li>
                <li className="flex gap-2"><span className="text-accent-soft">→</span> Kết quả lưu lịch sử 8 lần quay gần nhất</li>
                <li className="flex gap-2"><span className="text-accent-soft">→</span> Âm thanh: bật loa để nghe hiệu ứng quay</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  )
}
