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
type Phase = 'walk' | 'rest' | 'fall' | 'trip'

const ACTION_MS: Record<string, number> = { wave: 1500, carrot: 2600, yawn: 1400, happy: 900 }
// Movement tuning (px per frame @60fps)
const GRAVITY = 0.9
const MAX_VY = 22
const WALK_SPEED = 1.25
const TRIP_MS = 480

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
      phase: 'rest' as Phase,
      wtx: 0, floor: 0, // wander target x + floor (frame-local)
      tripUntil: 0, restUntil: 0, actionEnds: 0,
      napping: false, napAt: 0,
    }
    const drag = { on: false, x: 0, y: 0, moved: 0, downAt: 0 }
    let curState: TState = 'idle'
    let raf = 0

    const setSt = (v: TState) => { if (v !== curState) { curState = v; setState(v) } }
    const render = () => { el.style.transform = `translate(${s.x}px, ${s.y}px)` }

    // Pick a fresh random spot to stroll to (meaningfully far from the current
    // one so it actually paces back and forth), then start walking.
    const startWander = (now: number, minX: number, maxX: number) => {
      const range = Math.max(1, maxX - minX)
      let tx = s.x
      for (let i = 0; i < 6; i++) {
        tx = minX + Math.random() * range
        if (Math.abs(tx - s.x) > range * 0.28) break
      }
      s.wtx = tx
      s.phase = 'walk'
      void now
    }

    // Stop and do something in place: mostly a quick antic then a short pause,
    // sometimes a longer nap that turns into sleep.
    const enterRest = (now: number) => {
      s.phase = 'rest'
      if (Math.random() < 0.26) {
        s.napping = true
        s.napAt = now + 1500
        s.restUntil = now + 6000 + Math.random() * 4500
        setSt('idle')
      } else {
        s.napping = false
        const acts: TState[] = ['wave', 'carrot', 'yawn', 'idle', 'idle']
        const a = acts[Math.floor(Math.random() * acts.length)]
        setSt(a)
        s.actionEnds = now + (ACTION_MS[a] ?? 1200)
        s.restUntil = now + 2600 + Math.random() * 3400
      }
    }

    // Waking a sleeping bunny on scroll adds a touch of life.
    const onScroll = () => { if (curState === 'sleep') { s.napping = false; s.restUntil = performance.now() } }
    scroller?.addEventListener('scroll', onScroll, { passive: true })

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const frame = overlay.getBoundingClientRect()
      const floor = frame.height - RABBIT_H - 6
      const minX = 6
      const maxX = Math.max(minX, frame.width - RABBIT_W - 6)
      s.floor = floor

      if (!s.init) {
        s.x = frame.width / 2 - RABBIT_W / 2
        s.y = floor
        s.init = true
        el.style.opacity = '1'
        s.phase = 'rest'
        s.restUntil = now + 900
        setSt('idle')
        render()
        return
      }

      if (drag.on) { s.x = drag.x; s.y = drag.y; render(); return }
      if (curState === 'happy' && now < s.actionEnds) { render(); return }

      if (reduced) { s.y = floor; setSt('idle'); render(); return }

      if (s.phase === 'fall') {
        setSt('fall'); setFacingLeft(false)
        s.vy = Math.min(MAX_VY, s.vy + GRAVITY)
        s.y += s.vy // straight down — x untouched
        if (s.y >= floor) {
          s.y = floor
          if (s.vy > 6) { s.phase = 'trip'; s.tripUntil = now + TRIP_MS; setSt('trip') }
          else startWander(now, minX, maxX)
          s.vy = 0
        }
      } else if (s.phase === 'trip') {
        setSt('trip')
        if (now >= s.tripUntil) startWander(now, minX, maxX)
      } else if (s.phase === 'walk') {
        s.y = floor
        const dx = s.wtx - s.x
        if (Math.abs(dx) < 3) { s.x = s.wtx; enterRest(now) }
        else { setSt('run'); setFacingLeft(dx < 0); s.x += Math.sign(dx) * WALK_SPEED }
      } else {
        // rest: stand still and do antics, then stroll somewhere new
        s.y = floor
        if (s.napping) {
          if (now >= s.napAt && curState !== 'sleep') setSt('sleep')
          if (now >= s.restUntil) { s.napping = false; startWander(now, minX, maxX) }
        } else {
          if ((curState === 'wave' || curState === 'carrot' || curState === 'yawn' || curState === 'happy') && now >= s.actionEnds) {
            setSt('idle')
          }
          if (now >= s.restUntil) startWander(now, minX, maxX)
        }
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
        // A tap (not a drag) → happy hop + a little burst of hearts, then it
        // rests briefly in place before strolling off again.
        setSt('happy')
        const now = performance.now()
        s.actionEnds = now + ACTION_MS.happy
        s.phase = 'rest'
        s.napping = false
        s.restUntil = s.actionEnds + 1400
        const base = Date.now()
        const hs = [0, 1, 2].map((i) => ({ id: base + i, dx: -12 + i * 12 }))
        setHearts((prev) => [...prev, ...hs])
        setTimeout(() => setHearts((prev) => prev.filter((h) => !hs.some((x) => x.id === h.id))), 900)
      } else {
        // Dropped: fall straight down (gravity), tumble on landing, then
        // resume wandering.
        s.phase = 'fall'
        s.vy = 0
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
              {/* comic impact burst (only shows on trip) — behind everything */}
              <g className="tsuki-pow-pos" transform="translate(23 44)">
                <g className="tsuki-pow">
                  <polygon
                    points="0.0,-19.0 2.4,-8.2 10.3,-16.0 6.4,-5.6 17.3,-7.9 8.4,-1.2 18.8,2.7 7.7,3.5 14.4,12.4 4.6,7.2 5.4,18.2 0.0,8.5 -5.4,18.2 -4.6,7.2 -14.4,12.4 -7.7,3.5 -18.8,2.7 -8.4,-1.2 -17.3,-7.9 -6.4,-5.6 -10.3,-16.0 -2.4,-8.2"
                    fill="#F5A623" stroke="#2B1F16" strokeWidth="1.6" strokeLinejoin="round" transform="translate(1 1)"
                  />
                  <polygon
                    points="0.0,-19.0 2.4,-8.2 10.3,-16.0 6.4,-5.6 17.3,-7.9 8.4,-1.2 18.8,2.7 7.7,3.5 14.4,12.4 4.6,7.2 5.4,18.2 0.0,8.5 -5.4,18.2 -4.6,7.2 -14.4,12.4 -7.7,3.5 -18.8,2.7 -8.4,-1.2 -17.3,-7.9 -6.4,-5.6 -10.3,-16.0 -2.4,-8.2"
                    fill="#FFD21E" stroke="#2B1F16" strokeWidth="1.6" strokeLinejoin="round"
                  />
                </g>
              </g>
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
                <ellipse cx="23" cy="26.5" rx="13" ry="11.8" fill="#FDF7EC" stroke="#3A2A1C" strokeWidth="1.6" />
                <ellipse cx="14" cy="30.5" rx="2.2" ry="1.5" fill="#F4A9AE" opacity="0.7" />
                <ellipse cx="32" cy="30.5" rx="2.2" ry="1.5" fill="#F4A9AE" opacity="0.7" />
                {/* eyes open — big, round, glossy */}
                <g className="tsuki-eyes-open">
                  <ellipse cx="17.3" cy="26.6" rx="2.5" ry="3.2" fill="#3A2A1C" />
                  <ellipse cx="28.7" cy="26.6" rx="2.5" ry="3.2" fill="#3A2A1C" />
                  <circle cx="18.3" cy="25" r="1" fill="#FFFFFF" />
                  <circle cx="29.7" cy="25" r="1" fill="#FFFFFF" />
                  <circle cx="16.5" cy="27.7" r="0.5" fill="#FFFFFF" opacity="0.75" />
                  <circle cx="27.9" cy="27.7" r="0.5" fill="#FFFFFF" opacity="0.75" />
                </g>
                {/* eyes closed (sleep/yawn) */}
                <g className="tsuki-eyes-closed">
                  <path d="M14.8 26.8q2.5 2.1 5 0" stroke="#3A2A1C" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                  <path d="M26.2 26.8q2.5 2.1 5 0" stroke="#3A2A1C" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                </g>
                {/* eyes ouch (trip) — scrunched >< */}
                <g className="tsuki-eyes-ouch">
                  <path d="M15 24.6l3.2 2-3.2 2" stroke="#3A2A1C" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M31 24.6l-3.2 2 3.2 2" stroke="#3A2A1C" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </g>
                {/* rabbit nose (rounded Y) + philtrum + 3-shaped mouth */}
                <path d="M21.6 29.9h2.8a1.4 1.4 0 0 1-1.4 1.4a1.4 1.4 0 0 1-1.4-1.4z" fill="#E58E94" stroke="#3A2A1C" strokeWidth="0.7" strokeLinejoin="round" />
                <path d="M23 31.3v1.3" stroke="#3A2A1C" strokeWidth="0.8" strokeLinecap="round" />
                <path d="M23 32.6q-1.5 1.5-2.9.4M23 32.6q1.5 1.5 2.9.4" stroke="#3A2A1C" strokeWidth="0.9" fill="none" strokeLinecap="round" />
                {/* buck teeth */}
                <rect x="21.85" y="32.7" width="2.3" height="2.5" rx="0.7" fill="#FFFFFF" stroke="#3A2A1C" strokeWidth="0.7" />
                <path d="M23 32.8v2.3" stroke="#3A2A1C" strokeWidth="0.6" />
                {/* open mouth (yawn / ouch) */}
                <ellipse className="tsuki-mouth-o" cx="23" cy="33.4" rx="1.6" ry="2" fill="#B5595B" />
                {/* sweat drop (ouch) */}
                <path className="tsuki-sweat" d="M33 20c1.2 1.5 1.8 2.7 1.8 3.5a1.8 1.8 0 0 1-3.6 0c0-.8.6-2 1.8-3.5z" fill="#8FD0EC" stroke="#3A2A1C" strokeWidth="0.7" />
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
.tsuki-eyes-closed, .tsuki-mouth-o, .tsuki-carrot, .tsuki-zzz,
.tsuki-eyes-ouch, .tsuki-sweat, .tsuki-pow { opacity: 0; }
.tsuki-pow { transform-box: fill-box; transform-origin: center; }

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
/* walk: lean forward into the stride + a gentle hop (leans in the travel
   direction because the whole rig is scaleX-flipped when facing left) */
@keyframes tsuki-run {
  0%,100% { transform: translateY(0) rotate(-5deg); }
  50% { transform: translateY(-2.5px) rotate(-8deg); }
}
.tsuki[data-state="run"] .tsuki-bob { animation: tsuki-run 0.42s ease-in-out infinite; }
.tsuki[data-state="run"] .tsuki-arm-l { animation: tsuki-climb-arm-l 0.42s ease-in-out infinite; }
.tsuki[data-state="run"] .tsuki-arm-r { animation: tsuki-climb-arm-r 0.42s ease-in-out infinite; }
.tsuki[data-state="run"] .tsuki-ear-l { animation: tsuki-earflop 0.42s ease-in-out infinite; }
.tsuki[data-state="run"] .tsuki-ear-r { animation: tsuki-earflop 0.42s ease-in-out infinite reverse; }

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
/* pained-but-cute >< face + sweat drop + comic impact burst on trip */
.tsuki[data-state="trip"] .tsuki-eyes-open { opacity: 0; }
.tsuki[data-state="trip"] .tsuki-eyes-ouch { opacity: 1; }
.tsuki[data-state="trip"] .tsuki-mouth-o { opacity: 1; }
.tsuki[data-state="trip"] .tsuki-sweat { opacity: 1; }
@keyframes tsuki-pow {
  0% { opacity: 0; transform: scale(0.2) rotate(-10deg); }
  25% { opacity: 1; transform: scale(1.12) rotate(5deg); }
  70% { opacity: 0.95; transform: scale(0.98) rotate(-2deg); }
  100% { opacity: 0; transform: scale(1.05) rotate(0deg); }
}
.tsuki[data-state="trip"] .tsuki-pow { animation: tsuki-pow 0.5s ease-out; }

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
