// Tiny synthesized SFX for game feedback — no audio files to host/license,
// just short Web Audio oscillator chimes generated on the fly.

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function tone(freq: number, startAt: number, duration: number, ctx: AudioContext) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startAt)
  osc.stop(startAt + duration + 0.02)
}

/** A short rising chime for a progress checkpoint — step 0,1,2... rising a semitone each time, brighter as it climbs. */
export function playCheckpointChime(step: number) {
  const ctx = getAudioContext()
  if (!ctx) return
  const base = 523.25 // C5
  tone(base * Math.pow(2, step / 12), ctx.currentTime, 0.3, ctx)
}

/** A little two-note fanfare for the win. */
export function playWinFanfare() {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime
  tone(659.25, now, 0.22, ctx)       // E5
  tone(880, now + 0.14, 0.4, ctx)    // A5
}
