'use client'
import { useEffect, useRef, useState } from 'react'

// Tsuki — a cute cream bunny with a red neckerchief (nod to the burrow theme's
// rabbit) that lives in the burrow-theme chat: it wanders the floor, rests and
// does idle antics (wave, nibble a carrot, yawn, curl up to sleep), can be
// dragged around, and trips adorably when dropped. Built from a rigged set of
// hand-cut sprite parts (head/body/arms/feet/neckerchief) generated from the
// Tsuki-Odyssey-inspired asset sheets, driven by CSS keyframes + a rAF loop —
// expressions are whole-head swaps, and sleeping swaps to a lying pose.

// Local part-coordinate box (px). Every sprite is absolutely positioned inside
// this box; the numbers come from compositing the real cut parts to scale.
const RABBIT_W = 45
const RABBIT_H = 66
// Legless/armless "loaf" body already has the neckerchief fused on (no
// separate neck part) — arms are two copies of the same hand-picked sprite:
// one in front (visible, rabbit's own right) and one tucked behind the body
// silhouette (rabbit's own left), matching the rabbit's own point of view.
const PARTS = {
  feet: { left: 2.8, top: 41.1, width: 37.9, height: 24.9 },
  armBack: { left: 33.5, top: 35.9, width: 12.0, height: 16.5 },
  body: { left: -0.2, top: 18.1, width: 43.9, height: 44.7 },
  armFront: { left: 0.4, top: 39.9, width: 12.0, height: 16.5 },
  head: { left: 0.4, top: -0.2, width: 42.7, height: 45.3 },
} as const

type TState =
  | 'idle' | 'fall' | 'run' | 'drag' | 'trip' | 'happy' | 'wave' | 'carrot' | 'yawn' | 'sleep'
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

  // Expression is a whole-head swap now (the sprite sheet gives 3 full heads).
  const headSrc =
    state === 'yawn' ? '/tsuki/head-closed.png'
      : state === 'trip' ? '/tsuki/head-ouch.png'
        : '/tsuki/head-neutral.png'

  const partStyle = (p: { left: number; top: number; width: number; height: number }): React.CSSProperties => ({
    left: p.left, top: p.top, width: p.width, height: p.height,
  })
  const imgProps = { draggable: false, alt: '' } as const

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: TSUKI_CSS }} />
      <div
        ref={rabbitRef}
        data-state={state}
        className="tsuki pointer-events-auto absolute left-0 top-0 cursor-grab select-none active:cursor-grabbing"
        style={{ width: RABBIT_W, height: RABBIT_H, touchAction: 'none', willChange: 'transform', overflow: 'visible' }}
        title="Tsuki"
      >
        <div className="tsuki-facing" style={facingLeft ? { transform: 'scaleX(-1)' } : undefined}>
          <div className="tsuki-bob">
            {hearts.map((h) => (
              <span key={h.id} className="tsuki-heart" style={{ left: RABBIT_W / 2 + h.dx }}>♥</span>
            ))}
            {state === 'sleep' ? (
              <>
                <img className="tsuki-sleeping" src="/tsuki/pose-sleeping.png" {...imgProps}
                  style={{ position: 'absolute', left: -6, top: 36, width: 49, height: 30 }} />
                <img className="tsuki-zzz" src="/tsuki/zzz.png" {...imgProps}
                  style={{ position: 'absolute', left: 25, top: 8, width: 11, height: 15 }} />
              </>
            ) : (
              <>
                {/* comic impact burst (trip only) — behind everything */}
                <svg className="tsuki-pow" viewBox="0 0 48 48" width={56} height={56}
                  style={{ position: 'absolute', left: -9.5, top: 18, overflow: 'visible' }} aria-hidden="true">
                  <g transform="translate(24 24)">
                    <polygon
                      points="0,-19 2.4,-8.2 10.3,-16 6.4,-5.6 17.3,-7.9 8.4,-1.2 18.8,2.7 7.7,3.5 14.4,12.4 4.6,7.2 5.4,18.2 0,8.5 -5.4,18.2 -4.6,7.2 -14.4,12.4 -7.7,3.5 -18.8,2.7 -8.4,-1.2 -17.3,-7.9 -6.4,-5.6 -10.3,-16 -2.4,-8.2"
                      fill="#F5A623" stroke="#2B1F16" strokeWidth="1.6" strokeLinejoin="round" transform="translate(1 1)" />
                    <polygon
                      points="0,-19 2.4,-8.2 10.3,-16 6.4,-5.6 17.3,-7.9 8.4,-1.2 18.8,2.7 7.7,3.5 14.4,12.4 4.6,7.2 5.4,18.2 0,8.5 -5.4,18.2 -4.6,7.2 -14.4,12.4 -7.7,3.5 -18.8,2.7 -8.4,-1.2 -17.3,-7.9 -6.4,-5.6 -10.3,-16 -2.4,-8.2"
                      fill="#FFD21E" stroke="#2B1F16" strokeWidth="1.6" strokeLinejoin="round" />
                  </g>
                </svg>
                <img className="tsuki-part tsuki-feet" src="/tsuki/feet.png" {...imgProps} style={partStyle(PARTS.feet)} />
                <img className="tsuki-part tsuki-arm tsuki-arm-back" src="/tsuki/arm-left.png" {...imgProps} style={partStyle(PARTS.armBack)} />
                <img className="tsuki-part tsuki-body" src="/tsuki/body.png" {...imgProps} style={partStyle(PARTS.body)} />
                <img className="tsuki-part tsuki-arm tsuki-arm-front" src="/tsuki/arm.png" {...imgProps} style={partStyle(PARTS.armFront)} />
                <img className="tsuki-part tsuki-head" src={headSrc} {...imgProps} style={partStyle(PARTS.head)} />
                <img className="tsuki-part tsuki-carrot" src="/tsuki/carrot.png" {...imgProps}
                  style={{ position: 'absolute', left: 15, top: 34, width: 14, height: 14.4 }} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const TSUKI_CSS = `
.tsuki-facing { position: absolute; inset: 0; transform-origin: 50% 50%; }
.tsuki-bob { position: absolute; inset: 0; transform-origin: 50% 100%; }
.tsuki-part { position: absolute; -webkit-user-drag: none; user-select: none; }
.tsuki-arm { transform-box: fill-box; transform-origin: 50% 0%; }
.tsuki-head { transform-box: fill-box; transform-origin: 50% 92%; }
.tsuki-body { transform-box: fill-box; transform-origin: 50% 100%; }
.tsuki-carrot { opacity: 0; }
.tsuki-pow { opacity: 0; transform-box: fill-box; transform-origin: center; }

.tsuki-heart {
  position: absolute; top: -2px; font-size: 12px; color: #D0483F;
  transform: translateX(-50%); pointer-events: none; z-index: 5;
  animation: tsuki-heart 0.9s ease-out forwards;
}
@keyframes tsuki-heart {
  0% { opacity: 0; transform: translate(-50%, 0) scale(0.4); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -26px) scale(1.1); }
}

/* idle breathing */
@keyframes tsuki-breathe { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(1.04); } }
.tsuki[data-state="idle"] .tsuki-body { animation: tsuki-breathe 2.6s ease-in-out infinite; }

/* wave */
@keyframes tsuki-wave { 0%,100% { transform: rotate(6deg); } 50% { transform: rotate(-46deg); } }
.tsuki[data-state="wave"] .tsuki-arm-back { animation: tsuki-wave 0.42s ease-in-out 3; }
.tsuki[data-state="wave"] .tsuki-body { animation: tsuki-breathe 2.6s ease-in-out infinite; }

/* arm swing (shared by walk) */
@keyframes tsuki-arm-front { 0%,100% { transform: rotate(-18deg); } 50% { transform: rotate(-52deg); } }
@keyframes tsuki-arm-back { 0%,100% { transform: rotate(52deg); } 50% { transform: rotate(18deg); } }

/* walk: upright gentle hop + a little head/ear sway */
@keyframes tsuki-run { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
@keyframes tsuki-headbob { 0%,100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
.tsuki[data-state="run"] .tsuki-bob { animation: tsuki-run 0.42s ease-in-out infinite; }
.tsuki[data-state="run"] .tsuki-arm-front { animation: tsuki-arm-front 0.42s ease-in-out infinite; }
.tsuki[data-state="run"] .tsuki-arm-back { animation: tsuki-arm-back 0.42s ease-in-out infinite; }
.tsuki[data-state="run"] .tsuki-head { animation: tsuki-headbob 0.42s ease-in-out infinite; }

/* fall */
@keyframes tsuki-fall { 0% { transform: translateY(-1px); } 100% { transform: translateY(2px); } }
.tsuki[data-state="fall"] .tsuki-bob { animation: tsuki-fall 0.3s ease-in-out infinite alternate; }
.tsuki[data-state="fall"] .tsuki-arm-front { transform: rotate(-125deg); }
.tsuki[data-state="fall"] .tsuki-arm-back { transform: rotate(125deg); }

/* drag */
@keyframes tsuki-dangle { 0%,100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }
.tsuki[data-state="drag"] .tsuki-bob { animation: tsuki-dangle 0.6s ease-in-out infinite; }
.tsuki[data-state="drag"] .tsuki-arm-front { transform: rotate(-150deg); }
.tsuki[data-state="drag"] .tsuki-arm-back { transform: rotate(150deg); }

/* happy hop */
@keyframes tsuki-hop {
  0% { transform: translateY(0) scale(1,1); }
  18% { transform: translateY(0) scale(1.1,0.9); }
  55% { transform: translateY(-15px) scale(0.95,1.08); }
  100% { transform: translateY(0) scale(1,1); }
}
.tsuki[data-state="happy"] .tsuki-bob { animation: tsuki-hop 0.9s cubic-bezier(0.3,1.4,0.5,1); }

/* trip / tumble on landing after a fall — squashes on impact then tips over
   one way and the other before righting itself (head shows the >< ouch face) */
@keyframes tsuki-trip {
  0% { transform: translateY(-6px) scale(0.88,1.12); }
  22% { transform: translateY(0) scale(1.2,0.8) rotate(0deg); }
  45% { transform: scale(1,1) rotate(-22deg); }
  68% { transform: rotate(15deg); }
  85% { transform: rotate(-6deg); }
  100% { transform: rotate(0deg); }
}
.tsuki[data-state="trip"] .tsuki-bob { animation: tsuki-trip 0.48s ease-out; }
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
.tsuki[data-state="carrot"] .tsuki-arm-front { transform: rotate(-58deg); }
.tsuki[data-state="carrot"] .tsuki-arm-back { transform: rotate(58deg); }

/* yawn (head tilts back; closed-eye head swapped in) */
@keyframes tsuki-yawn-head { 0%,100% { transform: rotate(0); } 35%,70% { transform: rotate(-5deg); } }
.tsuki[data-state="yawn"] .tsuki-head { animation: tsuki-yawn-head 1.4s ease-in-out; }

/* sleep (lying pose) */
@keyframes tsuki-sleepbob { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-1px) rotate(1.2deg); } }
.tsuki[data-state="sleep"] .tsuki-sleeping { transform-box: fill-box; transform-origin: 50% 100%; animation: tsuki-sleepbob 4s ease-in-out infinite; }
@keyframes tsuki-zzz { 0% { opacity: 0; transform: translateY(2px) scale(0.6); } 30% { opacity: 0.9; } 100% { opacity: 0; transform: translateY(-12px) scale(1.1); } }
.tsuki-zzz { animation: tsuki-zzz 2.6s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .tsuki *, .tsuki-heart { animation: none !important; }
}
`
