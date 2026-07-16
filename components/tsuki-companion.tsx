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
  | 'idle' | 'climb' | 'fall' | 'run' | 'drag' | 'trip' | 'happy' | 'wave' | 'carrot' | 'yawn' | 'sleep'
type Phase = 'settle' | 'fall' | 'trip' | 'walk' | 'climb'

const ACTION_MS: Record<string, number> = { wave: 1500, carrot: 2600, yawn: 1400, happy: 900 }
// Movement tuning (px per frame @60fps)
const GRAVITY = 0.9
const MAX_VY = 22
const WALK_SPEED = 2.4
const CLIMB_SPEED = 2.6
const TRIP_MS = 480
const TARGET_MSG_INDEX = 2 // 3rd message from the top of the viewport

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

    const s = {
      x: 30, y: 30, vy: 0, init: false,
      phase: 'settle' as Phase,
      jtx: 0, jty: 0, floor: 0, // journey target + floor (frame-local)
      tripUntil: 0, settledAt: 0, nextAction: 0, actionEnds: 0,
      pending: false, quietUntil: 0,
    }
    const drag = { on: false, x: 0, y: 0, moved: 0, downAt: 0 }
    let curState: TState = 'idle'
    let raf = 0

    const setSt = (v: TState) => { if (v !== curState) { curState = v; setState(v) } }

    // Any scroll defers the next re-perch until scrolling pauses ~420ms.
    const onScroll = () => { s.pending = true; s.quietUntil = performance.now() + 420; s.settledAt = 0 }
    scroller?.addEventListener('scroll', onScroll, { passive: true })

    // Target = the 3rd message currently visible from the top of the frame
    // (deliberately NOT the newest message). Also returns the floor line the
    // rabbit walks along.
    const computeTarget = () => {
      const frame = overlay.getBoundingClientRect()
      const floor = frame.height - RABBIT_H - 6
      let tx = frame.width / 2 - RABBIT_W / 2
      let ty = floor
      if (scroller) {
        const all = Array.from(scroller.querySelectorAll('[data-message-id]')) as HTMLElement[]
        const visible = all.filter((n) => {
          const r = n.getBoundingClientRect()
          return r.bottom > frame.top + 6 && r.top < frame.bottom - 6
        })
        const pick = visible[Math.min(TARGET_MSG_INDEX, visible.length - 1)]
        if (pick) {
          const r = pick.getBoundingClientRect()
          tx = r.left - frame.left + 2
          ty = r.top - frame.top - RABBIT_H * 0.6
        }
      }
      tx = Math.max(4, Math.min(frame.width - RABBIT_W - 4, tx))
      ty = Math.max(4, Math.min(floor, ty))
      return { tx, ty, floor }
    }

    const render = () => { el.style.transform = `translate(${s.x}px, ${s.y}px)` }

    const runAntics = (now: number) => {
      if (s.settledAt === 0) { s.settledAt = now; s.nextAction = now + 2200; setSt('idle') }
      if (curState === 'wave' || curState === 'carrot' || curState === 'yawn') {
        if (now >= s.actionEnds) setSt('idle')
        return
      }
      if (curState === 'sleep') return
      if (now - s.settledAt > 18000) { setSt('sleep'); return }
      if (now >= s.nextAction) {
        const acts: TState[] = ['wave', 'carrot', 'yawn']
        const a = acts[Math.floor(Math.random() * acts.length)]
        setSt(a)
        s.actionEnds = now + ACTION_MS[a]
        s.nextAction = now + ACTION_MS[a] + 2500 + Math.random() * 3500
      }
    }

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const t = computeTarget()
      s.floor = t.floor
      if (!s.init) { s.x = t.tx; s.y = t.ty; s.init = true; el.style.opacity = '1'; render() }

      if (drag.on) { s.x = drag.x; s.y = drag.y; render(); return }
      if (curState === 'happy' && now < s.actionEnds) { render(); return }

      if (reduced) {
        // Minimal: just ease onto the target, no journeys/antics.
        s.x += (t.tx - s.x) * 0.14
        s.y += (t.ty - s.y) * 0.14
        setSt('idle'); render(); return
      }

      if (s.phase === 'settle') {
        const dist = Math.abs(t.tx - s.x) + Math.abs(t.ty - s.y)
        // Kick off a relocate journey when scrolling paused, or the target
        // jumped far (e.g. a new message shifted the layout).
        if ((s.pending && now >= s.quietUntil) || (!s.pending && dist > 60)) {
          s.jtx = t.tx; s.jty = t.ty; s.pending = false; s.vy = 0
          s.phase = s.y < t.floor - 6 ? 'fall' : 'walk'
        } else if (s.pending) {
          // still scrolling — hold position
          render(); return
        } else {
          // gentle drift to keep glued as the message nudges around
          s.x += (t.tx - s.x) * 0.12
          s.y += (t.ty - s.y) * 0.12
          runAntics(now)
          render(); return
        }
      }

      if (s.phase === 'fall') {
        setSt('fall'); setFacingLeft(false)
        s.vy = Math.min(MAX_VY, s.vy + GRAVITY)
        s.y += s.vy // straight down — x is untouched
        if (s.y >= s.floor) {
          s.y = s.floor
          if (s.vy > 6) { s.phase = 'trip'; s.tripUntil = now + TRIP_MS; setSt('trip') }
          else s.phase = 'walk'
          s.vy = 0
        }
      } else if (s.phase === 'trip') {
        setSt('trip')
        if (now >= s.tripUntil) s.phase = 'walk'
      } else if (s.phase === 'walk') {
        const dx = s.jtx - s.x
        if (Math.abs(dx) < 3) { s.x = s.jtx; s.phase = 'climb' }
        else { setSt('run'); setFacingLeft(dx < 0); s.x += Math.sign(dx) * WALK_SPEED; s.y = s.floor }
      } else if (s.phase === 'climb') {
        setSt('climb'); setFacingLeft(false)
        s.x = s.jtx
        if (s.y - s.jty <= 2) { s.y = s.jty; s.phase = 'settle'; s.settledAt = now; s.nextAction = now + 2000; setSt('idle') }
        else s.y -= CLIMB_SPEED
      }
      render()
    }
    el.style.opacity = '0'
    raf = requestAnimationFrame(tick)

    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(tick) }
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
      s.x = drag.x
      s.y = drag.y
      const quick = performance.now() - drag.downAt < 250
      if (drag.moved < 8 && quick) {
        // A tap (not a drag) → happy hop + a little burst of hearts.
        setSt('happy')
        s.actionEnds = performance.now() + ACTION_MS.happy
        s.phase = 'settle'
        s.settledAt = 0
        const base = Date.now()
        const hs = [0, 1, 2].map((i) => ({ id: base + i, dx: -12 + i * 12 }))
        setHearts((prev) => [...prev, ...hs])
        setTimeout(() => setHearts((prev) => prev.filter((h) => !hs.some((x) => x.id === h.id))), 900)
      } else {
        // Dropped: fall straight down (gravity), trip, walk over, climb the
        // 3rd visible message.
        s.phase = 'fall'
        s.vy = 0
        s.settledAt = 0
      }
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

/* trip / tumble on landing after a fall — squashes on impact then tips over
   one way and the other before righting itself */
@keyframes tsuki-trip {
  0% { transform: translateY(-6px) scale(0.88,1.12); }
  22% { transform: translateY(0) scale(1.2,0.8) rotate(0deg); }
  45% { transform: scale(1,1) rotate(-22deg); }
  68% { transform: rotate(15deg); }
  85% { transform: rotate(-6deg); }
  100% { transform: rotate(0deg); }
}
.tsuki[data-state="trip"] .tsuki-bob { animation: tsuki-trip 0.48s ease-out; }
.tsuki[data-state="trip"] .tsuki-ear-l { animation: tsuki-earflop 0.24s ease-in-out 2; }
.tsuki[data-state="trip"] .tsuki-ear-r { animation: tsuki-earflop 0.24s ease-in-out 2 reverse; }
/* little dizzy stars while tripped (reuse zzz group as sparks) */
.tsuki[data-state="trip"] .tsuki-zzz { animation: tsuki-zzz 0.5s ease-in-out; }

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
