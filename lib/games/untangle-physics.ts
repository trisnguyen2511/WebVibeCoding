// "Gỡ Rối Rương Xoay" physics: the chain's remaining twist only ever
// changes in response to the player's own rotation — turning the phone
// one way pays it out, turning the other way winds it back up. There is
// no restoring spring force driving it toward zero on its own: a real
// twisted rope actually would unwind itself over time if just left
// hanging, but that makes for a bad game (it "solves itself" before the
// player does anything) — so `twist` is a purely kinematic quantity, not
// a simulated spring. `chestAngle` is only a smoothed *visual* lag on top
// of that, purely for weight/feel, and settles and stays the moment input
// stops (no free energy, no auto-decay).

export interface TorsionParams {
  /** Response rate (rad/s-ish) for how quickly the visual chest angle catches up to the input — feel only, doesn't affect the win condition. */
  smoothing: number
}

export interface TorsionState {
  topAngle: number    // continuous (unwrapped) phone angle, radians
  twist: number       // remaining signed wind amount, radians — 0 = untangled
  chestAngle: number  // smoothed visual angle = lagged toward (topAngle + twist)
  won: boolean
  winHoldTime: number // seconds the twist has stayed within the win band
}

export const WIN_TWIST_THRESHOLD = 0.14 // rad (~8°)
export const WIN_HOLD_DURATION = 0.6    // seconds held before declaring a win

export const MIN_WIND_COUNT = 1
export const MAX_WIND_COUNT = 10

/** Higher wind counts feel slightly heavier to swing around — more turns to clear, less snappy response. */
export function difficultyParams(windCount: number): TorsionParams {
  const n = Math.max(MIN_WIND_COUNT, Math.min(MAX_WIND_COUNT, windCount))
  return { smoothing: 10 / (1 + 0.06 * (n - 1)) }
}

export function createTorsionState(windCount: number): TorsionState {
  const n = Math.max(MIN_WIND_COUNT, Math.min(MAX_WIND_COUNT, windCount))
  const initialTwist = n * Math.PI * 2
  return {
    topAngle: 0,
    twist: initialTwist,
    chestAngle: initialTwist,
    won: false,
    winHoldTime: 0,
  }
}

/** Call whenever a new raw orientation sample arrives — the only thing that ever changes `twist`. */
export function applyRotation(state: TorsionState, newTopAngle: number): TorsionState {
  const delta = newTopAngle - state.topAngle
  return { ...state, topAngle: newTopAngle, twist: state.twist - delta }
}

/** Call every frame — smooths the visual angle toward the current input and checks the win condition. dt in seconds. */
export function stepTorsion(state: TorsionState, params: TorsionParams, dt: number): TorsionState {
  if (state.won) return state

  const target = state.topAngle + state.twist
  const smoothingFactor = 1 - Math.exp(-params.smoothing * dt)
  const chestAngle = state.chestAngle + (target - state.chestAngle) * smoothingFactor

  const withinBand = Math.abs(state.twist) < WIN_TWIST_THRESHOLD
  const winHoldTime = withinBand ? state.winHoldTime + dt : 0

  return { ...state, chestAngle, winHoldTime, won: winHoldTime >= WIN_HOLD_DURATION }
}

/** 0 = fully wound, 1 = untangled. Used for the phone's progress readout and the PC's cell label. */
export function twistProgress(state: TorsionState, windCount: number): number {
  const totalTwist = Math.max(MIN_WIND_COUNT, Math.min(MAX_WIND_COUNT, windCount)) * Math.PI * 2
  if (totalTwist === 0) return 1
  return Math.max(0, Math.min(1, 1 - Math.abs(state.twist) / totalTwist))
}

/** Host → phone: lets each phone show its own player's live untangle progress. */
export interface UntangleProgressMessage {
  type: 'untangle-progress'
  progress: number
  won: boolean
}

/**
 * Accumulates a raw 0-360° compass heading into a continuous angle so a
 * 359°→1° wrap reads as +2° instead of -358°. Returns radians. Pass
 * `prevRaw: null` on the very first sample to seed it without a jump.
 */
export function unwrapDegreesToRadians(
  prevRaw: number | null,
  prevUnwrappedRad: number,
  newRawDeg: number
): number {
  if (prevRaw === null) return prevUnwrappedRad
  let delta = newRawDeg - prevRaw
  if (delta > 180) delta -= 360
  else if (delta < -180) delta += 360
  return prevUnwrappedRad + (delta * Math.PI) / 180
}
