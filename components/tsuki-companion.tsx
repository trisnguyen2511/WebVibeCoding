'use client'
import { useEffect, useRef, useState } from 'react'

// Tsuki — a cute cream bunny with a red neckerchief (chibi nod to the theme
// image's rabbit) that lives in the burrow-theme chat: it perches on the
// newest message near the input, chases it as you scroll (climbing up /
// falling down), can be dragged around, and does idle antics (wave, nibble a
// carrot, yawn/ear-twitch, and curls up to sleep when left alone). Built with
// CSS keyframes + a rAF chase loop rather than a sprite sheet so it scales and
// stays crisp. If this lands well, it's the template for per-theme companions.

const RABBIT_W = 46
const RABBIT_H = 54

type TState =
  | 'idle' | 'climb' | 'fall' | 'run' | 'drag' | 'land' | 'happy' | 'wave' | 'carrot' | 'yawn' | 'sleep'

const ACTION_MS: Record<string, number> = { wave: 1500, carrot: 2600, yawn: 1400, happy: 900, land: 460 }

export function TsukiCompanion({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const rabbitRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<TState>('idle')
  const [facingLeft, setFacingLeft] = useState(false)
  const [hearts, setHearts] = useState<{ id: number; dx: number }[]>([])

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const overlay = overlayRef.current
    const el = rabbitRef.current
    const scroller = scrollRef.current
    if (!overlay || !el) return

    const pos = { x: 30, y: 30, init: false }
    const scrollBias = { v: 0 }
    const drag = { on: false, x: 0, y: 0, moved: 0, downAt: 0 }
    const timing = { settledAt: 0, nextAction: 0, actionEnds: 0 }
    let curState: TState = 'idle'
    let raf = 0
    let lastScrollTop = scroller?.scrollTop ?? 0

    const setSt = (s: TState) => {
      if (s === curState) return
      curState = s
      setState(s)
    }

    const onScroll = () => {
      if (!scroller) return
      const d = scroller.scrollTop - lastScrollTop
      lastScrollTop = scroller.scrollTop
      // Scroll up (d<0) → bias upward so Tsuki climbs to keep up; scroll down
      // (d>0) → bias down so it drops toward the newest message. Decays to 0.
      scrollBias.v = Math.max(-70, Math.min(70, scrollBias.v + d * 0.7))
      timing.settledAt = 0 // any scroll wakes it from sleep/idle antics
    }
    scroller?.addEventListener('scroll', onScroll, { passive: true })

    const computeTarget = () => {
      const frame = overlay.getBoundingClientRect()
      let tx = frame.width / 2 - RABBIT_W / 2
      let ty = frame.height - RABBIT_H - 12
      if (scroller) {
        const msgs = scroller.querySelectorAll('[data-message-id]')
        const last = msgs[msgs.length - 1] as HTMLElement | undefined
        if (last) {
          const r = last.getBoundingClientRect()
          tx = r.left - frame.left + 2
          ty = r.top - frame.top - RABBIT_H * 0.6
        }
      }
      ty += scrollBias.v
      tx = Math.max(4, Math.min(frame.width - RABBIT_W - 4, tx))
      ty = Math.max(4, Math.min(frame.height - RABBIT_H - 4, ty))
      return { tx, ty }
    }

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      scrollBias.v *= 0.9

      if (drag.on) {
        pos.x = drag.x
        pos.y = drag.y
        el.style.transform = `translate(${pos.x}px, ${pos.y}px)`
        return
      }

      const t = computeTarget()
      if (!pos.init) {
        pos.x = t.tx
        pos.y = t.ty
        pos.init = true
        el.style.opacity = '1'
      }
      const dx = t.tx - pos.x
      const dy = t.ty - pos.y
      pos.x += dx * 0.14
      pos.y += dy * 0.14
      el.style.transform = `translate(${pos.x}px, ${pos.y}px)`

      // Transient one-shot states play to completion before re-evaluating.
      if ((curState === 'land' || curState === 'happy') && now < timing.actionEnds) return

      if (reduced) {
        if (curState !== 'idle') setSt('idle')
        return
      }

      const dist = Math.abs(dx) + Math.abs(dy)
      if (dist > 3) {
        timing.settledAt = 0
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 1) {
          setSt('run')
          if (dx > 0.5) setFacingLeft(false)
          else if (dx < -0.5) setFacingLeft(true)
        } else if (dy < -1) {
          setSt('climb')
        } else if (dy > 1) {
          setSt('fall')
        }
        return
      }

      // Settled on the target — run idle antics.
      if (timing.settledAt === 0) {
        timing.settledAt = now
        timing.nextAction = now + 2200
        if (curState !== 'idle') setSt('idle')
      }
      if (curState === 'wave' || curState === 'carrot' || curState === 'yawn') {
        if (now >= timing.actionEnds) setSt('idle')
        return
      }
      if (curState === 'sleep') return // stays asleep until scroll/movement resets settledAt
      if (now - timing.settledAt > 18000) { setSt('sleep'); return }
      if (now >= timing.nextAction) {
        const acts: TState[] = ['wave', 'carrot', 'yawn']
        const a = acts[Math.floor(Math.random() * acts.length)]
        setSt(a)
        timing.actionEnds = now + ACTION_MS[a]
        timing.nextAction = now + ACTION_MS[a] + 2500 + Math.random() * 3500
      }
    }
    el.style.opacity = '0'
    raf = requestAnimationFrame(tick)

    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) raf = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', onVis)

    const onDown = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      drag.on = true
      drag.moved = 0
      drag.downAt = performance.now()
      const frame = overlay.getBoundingClientRect()
      drag.x = Math.max(0, Math.min(frame.width - RABBIT_W, e.clientX - frame.left - RABBIT_W / 2))
      drag.y = Math.max(0, Math.min(frame.height - RABBIT_H, e.clientY - frame.top - RABBIT_H / 2))
      setSt('drag')
      el.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!drag.on) return
      const frame = overlay.getBoundingClientRect()
      const nx = Math.max(0, Math.min(frame.width - RABBIT_W, e.clientX - frame.left - RABBIT_W / 2))
      const ny = Math.max(0, Math.min(frame.height - RABBIT_H, e.clientY - frame.top - RABBIT_H / 2))
      drag.moved += Math.abs(nx - drag.x) + Math.abs(ny - drag.y)
      drag.x = nx
      drag.y = ny
    }
    const onUp = () => {
      if (!drag.on) return
      drag.on = false
      const quick = performance.now() - drag.downAt < 250
      if (drag.moved < 8 && quick) {
        // A tap (not a drag) → happy hop + a little burst of hearts.
        setSt('happy')
        timing.actionEnds = performance.now() + ACTION_MS.happy
        const base = Date.now()
        const hs = [0, 1, 2].map((i) => ({ id: base + i, dx: -12 + i * 12 }))
        setHearts((prev) => [...prev, ...hs])
        setTimeout(() => setHearts((prev) => prev.filter((h) => !hs.some((x) => x.id === h.id))), 900)
      } else {
        setSt('land')
        timing.actionEnds = performance.now() + ACTION_MS.land
      }
      timing.settledAt = 0
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    return () => {
      cancelAnimationFrame(raf)
      scroller?.removeEventListener('scroll', onScroll)
      document.removeEventListener('visibilitychange', onVis)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [scrollRef])

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: TSUKI_CSS }} />
      <div
        ref={rabbitRef}
        data-state={state}
        className="tsuki pointer-events-auto absolute left-0 top-0 cursor-grab active:cursor-grabbing"
        style={{ width: RABBIT_W, height: RABBIT_H, touchAction: 'none', willChange: 'transform' }}
        title="Tsuki"
      >
        <div className="tsuki-facing" style={facingLeft ? { transform: 'scaleX(-1)' } : undefined}>
          <div className="tsuki-bob">
            {hearts.map((h) => (
              <span key={h.id} className="tsuki-heart" style={{ left: RABBIT_W / 2 + h.dx }}>♥</span>
            ))}
            <svg viewBox="0 0 46 54" width={RABBIT_W} height={RABBIT_H} style={{ overflow: 'visible' }}>
              {/* ears */}
              <g className="tsuki-ear tsuki-ear-l">
                <rect x="13" y="3" width="7.5" height="21" rx="3.75" fill="#FDF7EC" stroke="#3A2A1C" strokeWidth="1.5" />
                <rect x="15.4" y="6" width="2.8" height="14" rx="1.4" fill="#EBA0A6" />
              </g>
              <g className="tsuki-ear tsuki-ear-r">
                <rect x="25.5" y="3" width="7.5" height="21" rx="3.75" fill="#FDF7EC" stroke="#3A2A1C" strokeWidth="1.5" />
                <rect x="27.8" y="6" width="2.8" height="14" rx="1.4" fill="#EBA0A6" />
              </g>
              {/* body + feet */}
              <ellipse className="tsuki-body" cx="23" cy="45" rx="10.5" ry="8.2" fill="#FDF7EC" stroke="#3A2A1C" strokeWidth="1.6" />
              <ellipse cx="17.5" cy="51.5" rx="3.2" ry="2.1" fill="#FDF7EC" stroke="#3A2A1C" strokeWidth="1.3" />
              <ellipse cx="28.5" cy="51.5" rx="3.2" ry="2.1" fill="#FDF7EC" stroke="#3A2A1C" strokeWidth="1.3" />
              {/* arms */}
              <ellipse className="tsuki-arm tsuki-arm-l" cx="13.5" cy="43" rx="2.7" ry="4.6" fill="#FDF7EC" stroke="#3A2A1C" strokeWidth="1.3" />
              <ellipse className="tsuki-arm tsuki-arm-r" cx="32.5" cy="43" rx="2.7" ry="4.6" fill="#FDF7EC" stroke="#3A2A1C" strokeWidth="1.3" />
              {/* neckerchief */}
              <path d="M13.5 35.5c6 4 12.5 4 19 0l-2 4.5c-5 2.5-10 2.5-15 0Z" fill="#D0483F" stroke="#3A2A1C" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M20.5 38.5c1.6 1 3.4 1 5 0" stroke="#9E2F28" strokeWidth="1" fill="none" strokeLinecap="round" />
              {/* head */}
              <g className="tsuki-head">
                <ellipse cx="23" cy="27" rx="13" ry="11.6" fill="#FDF7EC" stroke="#3A2A1C" strokeWidth="1.6" />
                <ellipse cx="14.5" cy="30" rx="2" ry="1.3" fill="#EBA0A6" opacity="0.6" />
                <ellipse cx="31.5" cy="30" rx="2" ry="1.3" fill="#EBA0A6" opacity="0.6" />
                {/* eyes open */}
                <g className="tsuki-eyes-open">
                  <ellipse cx="18" cy="27" rx="2" ry="2.7" fill="#3A2A1C" />
                  <ellipse cx="28" cy="27" rx="2" ry="2.7" fill="#3A2A1C" />
                  <circle cx="18.7" cy="25.8" r="0.7" fill="#FFFFFF" />
                  <circle cx="28.7" cy="25.8" r="0.7" fill="#FFFFFF" />
                </g>
                {/* eyes closed */}
                <g className="tsuki-eyes-closed">
                  <path d="M15.6 27.2q2.4 2 4.8 0" stroke="#3A2A1C" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                  <path d="M25.6 27.2q2.4 2 4.8 0" stroke="#3A2A1C" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                </g>
                {/* nose + mouth */}
                <path d="M21.8 30.2h2.4l-1.2 1.5Z" fill="#D98A90" stroke="#3A2A1C" strokeWidth="0.7" strokeLinejoin="round" />
                <path d="M23 31.7q-1.4 1.4-2.8.5M23 31.7q1.4 1.4 2.8.5" stroke="#3A2A1C" strokeWidth="0.9" fill="none" strokeLinecap="round" />
                <ellipse className="tsuki-mouth-o" cx="23" cy="32.4" rx="1.5" ry="1.9" fill="#B5595B" />
              </g>
              {/* carrot (idle nibble) */}
              <g className="tsuki-carrot">
                <path d="M20.6 41l2.4-9 2.4 9z" fill="#E08A3C" stroke="#3A2A1C" strokeWidth="1" strokeLinejoin="round" />
                <path d="M23 32.5l-1.8-3M23 32.5v-3.4M23 32.5l1.8-3" stroke="#4C7A3A" strokeWidth="1.3" strokeLinecap="round" />
              </g>
              {/* Zzz (sleep) */}
              <g className="tsuki-zzz" fill="#3A2A1C" fontWeight="700" fontFamily="sans-serif">
                <text x="33" y="16" fontSize="6">z</text>
                <text x="37" y="11" fontSize="8">Z</text>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

const TSUKI_CSS = `
.tsuki-facing, .tsuki-bob { width: 100%; height: 100%; }
.tsuki-bob { position: relative; transform-origin: 50% 100%; }
.tsuki-ear { transform-box: fill-box; transform-origin: 50% 100%; }
.tsuki-arm { transform-box: fill-box; transform-origin: 50% 0%; }
.tsuki-head { transform-box: fill-box; transform-origin: 50% 90%; }
.tsuki-body { transform-box: fill-box; transform-origin: 50% 100%; }
.tsuki-eyes-closed, .tsuki-mouth-o, .tsuki-carrot, .tsuki-zzz { opacity: 0; }

.tsuki-heart {
  position: absolute; top: -2px; font-size: 12px; color: #D0483F;
  transform: translateX(-50%); pointer-events: none;
  animation: tsuki-heart 0.9s ease-out forwards;
}
@keyframes tsuki-heart {
  0% { opacity: 0; transform: translate(-50%, 0) scale(0.4); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -26px) scale(1.1); }
}

/* idle breathing */
@keyframes tsuki-breathe { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(1.05); } }
.tsuki[data-state="idle"] .tsuki-body { animation: tsuki-breathe 2.6s ease-in-out infinite; }

/* wave */
@keyframes tsuki-wave { 0%,100% { transform: rotate(6deg); } 50% { transform: rotate(-42deg); } }
.tsuki[data-state="wave"] .tsuki-arm-r { animation: tsuki-wave 0.42s ease-in-out 3; }
.tsuki[data-state="wave"] .tsuki-body { animation: tsuki-breathe 2.6s ease-in-out infinite; }

/* climb */
@keyframes tsuki-climb { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-3px) rotate(2deg); } }
@keyframes tsuki-climb-arm-l { 0%,100% { transform: rotate(-25deg); } 50% { transform: rotate(-72deg); } }
@keyframes tsuki-climb-arm-r { 0%,100% { transform: rotate(72deg); } 50% { transform: rotate(25deg); } }
.tsuki[data-state="climb"] .tsuki-bob { animation: tsuki-climb 0.42s ease-in-out infinite; }
.tsuki[data-state="climb"] .tsuki-arm-l { animation: tsuki-climb-arm-l 0.42s ease-in-out infinite; }
.tsuki[data-state="climb"] .tsuki-arm-r { animation: tsuki-climb-arm-r 0.42s ease-in-out infinite; }

/* fall */
@keyframes tsuki-fall { 0% { transform: translateY(-1px); } 100% { transform: translateY(2px); } }
@keyframes tsuki-earflop { 0%,100% { transform: rotate(0); } 50% { transform: rotate(10deg); } }
.tsuki[data-state="fall"] .tsuki-bob { animation: tsuki-fall 0.3s ease-in-out infinite alternate; }
.tsuki[data-state="fall"] .tsuki-arm-l { transform: rotate(-125deg); }
.tsuki[data-state="fall"] .tsuki-arm-r { transform: rotate(125deg); }
.tsuki[data-state="fall"] .tsuki-ear-l { animation: tsuki-earflop 0.3s ease-in-out infinite; }
.tsuki[data-state="fall"] .tsuki-ear-r { animation: tsuki-earflop 0.3s ease-in-out infinite reverse; }

/* run */
@keyframes tsuki-run { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
.tsuki[data-state="run"] .tsuki-bob { animation: tsuki-run 0.26s ease-in-out infinite; }
.tsuki[data-state="run"] .tsuki-arm-l { animation: tsuki-climb-arm-l 0.26s ease-in-out infinite; }
.tsuki[data-state="run"] .tsuki-arm-r { animation: tsuki-climb-arm-r 0.26s ease-in-out infinite; }

/* drag */
@keyframes tsuki-dangle { 0%,100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }
.tsuki[data-state="drag"] .tsuki-bob { animation: tsuki-dangle 0.6s ease-in-out infinite; }
.tsuki[data-state="drag"] .tsuki-arm-l { transform: rotate(-150deg); }
.tsuki[data-state="drag"] .tsuki-arm-r { transform: rotate(150deg); }

/* happy hop */
@keyframes tsuki-hop {
  0% { transform: translateY(0) scale(1,1); }
  18% { transform: translateY(0) scale(1.12,0.88); }
  55% { transform: translateY(-15px) scale(0.94,1.09); }
  100% { transform: translateY(0) scale(1,1); }
}
.tsuki[data-state="happy"] .tsuki-bob { animation: tsuki-hop 0.9s cubic-bezier(0.3,1.4,0.5,1); }

/* land squash after a drag */
@keyframes tsuki-land {
  0% { transform: translateY(-9px) scale(0.9,1.1); }
  42% { transform: translateY(0) scale(1.18,0.82); }
  72% { transform: scale(0.96,1.05); }
  100% { transform: scale(1,1); }
}
.tsuki[data-state="land"] .tsuki-bob { animation: tsuki-land 0.46s ease-out; }

/* carrot nibble */
@keyframes tsuki-chew { 0%,100% { transform: translateY(0); } 50% { transform: translateY(1.2px); } }
.tsuki[data-state="carrot"] .tsuki-carrot { opacity: 1; }
.tsuki[data-state="carrot"] .tsuki-head { animation: tsuki-chew 0.22s ease-in-out infinite; }
.tsuki[data-state="carrot"] .tsuki-arm-l { transform: rotate(-52deg); }
.tsuki[data-state="carrot"] .tsuki-arm-r { transform: rotate(52deg); }

/* yawn / ear-twitch */
@keyframes tsuki-yawn-head { 0%,100% { transform: rotate(0); } 35%,70% { transform: rotate(-4deg); } }
@keyframes tsuki-yawn-mouth { 0%,100% { opacity: 0; } 35%,70% { opacity: 1; } }
@keyframes tsuki-twitch { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-9deg); } 40% { transform: rotate(0); } }
.tsuki[data-state="yawn"] .tsuki-head { animation: tsuki-yawn-head 1.4s ease-in-out; }
.tsuki[data-state="yawn"] .tsuki-mouth-o { animation: tsuki-yawn-mouth 1.4s ease-in-out; }
.tsuki[data-state="yawn"] .tsuki-eyes-open { opacity: 0; }
.tsuki[data-state="yawn"] .tsuki-eyes-closed { opacity: 1; }
.tsuki[data-state="yawn"] .tsuki-ear-l { animation: tsuki-twitch 1.4s ease-in-out; }

/* sleep */
@keyframes tsuki-sleep { 0%,100% { transform: rotate(-5deg) scaleY(1); } 50% { transform: rotate(-3deg) scaleY(1.04); } }
@keyframes tsuki-zzz { 0% { opacity: 0; transform: translateY(2px) scale(0.6); } 30% { opacity: 0.9; } 100% { opacity: 0; transform: translateY(-12px) scale(1.1); } }
.tsuki[data-state="sleep"] .tsuki-bob { animation: tsuki-sleep 4s ease-in-out infinite; }
.tsuki[data-state="sleep"] .tsuki-eyes-open { opacity: 0; }
.tsuki[data-state="sleep"] .tsuki-eyes-closed { opacity: 1; }
.tsuki[data-state="sleep"] .tsuki-zzz { animation: tsuki-zzz 2.6s ease-in-out infinite; }
.tsuki[data-state="sleep"] .tsuki-ear-l { transform: rotate(6deg); }
.tsuki[data-state="sleep"] .tsuki-ear-r { transform: rotate(-6deg); }

@media (prefers-reduced-motion: reduce) {
  .tsuki *, .tsuki-heart { animation: none !important; }
}
`
