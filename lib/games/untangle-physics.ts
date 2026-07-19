// "Gỡ Rối Rương Xoay" physics: two independent kinematic twist axes —
// yaw (left/right spin, from the phone's compass heading) and pitch
// (up/down tilt, from front-back tilt) — must BOTH be brought back to
// zero to win, so a single spin direction alone can't solve it.
//
// Each axis only ever changes in response to the player's own rotation:
// turning one way pays it out, the other way winds it back up. There is
// no restoring spring force driving either toward zero on its own — a
// real twisted rope actually would unwind itself over time if just left
// hanging, but that makes for a bad game (it "solves itself" before the
// player does anything). `visualAngle` is only a smoothed *rendering* lag
// on top of the kinematic twist, purely for weight/feel, and settles and
// stays the moment input stops (no free energy, no auto-decay).
//
// Total rotation required per axis is deliberately small: a phone can't
// be spun through multiple continuous 360° turns in one natural wrist
// motion the way a Joy-Con can, and the model tracks *signed* rotation
// (undoing the specific wind direction, not just "shake it a lot"), so
// asking for full multi-turn spins made the puzzle feel unresponsive to
// normal hand movement.

export interface TorsionParams {
  /** Response rate (rad/s-ish) for how quickly the visual angle catches up to the input — feel only, doesn't affect the win condition. */
  smoothing: number
}

export interface AxisState {
  topAngle: number    // continuous (unwrapped) sensor angle, radians
  twist: number       // remaining signed wind amount, radians — 0 = untangled
  visualAngle: number // smoothed angle used for rendering, lagged toward (topAngle + twist)
}

export interface TorsionState {
  yaw: AxisState
  pitch: AxisState
  won: boolean
  winHoldTime: number // seconds both axes have stayed within the win band together
}

export const WIN_TWIST_THRESHOLD = 0.1 // rad (~6°), applies to each axis independently
export const WIN_HOLD_DURATION = 0.5   // seconds held before declaring a win

export const MIN_WIND_COUNT = 1
export const MAX_WIND_COUNT = 10

// A comfortable single wrist rotation is roughly 90-180° — these targets
// stay well inside that even at max difficulty, so the puzzle responds
// clearly to normal hand movement instead of demanding full spins.
const YAW_DEGREES_PER_WIND = 24
const PITCH_BASE_DEGREES = 18
const PITCH_DEGREES_PER_WIND = 5

function clampWindCount(windCount: number): number {
  return Math.max(MIN_WIND_COUNT, Math.min(MAX_WIND_COUNT, windCount))
}

/** Total yaw (left/right) rotation needed to fully untangle, in radians. */
export function yawTotalRadians(windCount: number): number {
  return (clampWindCount(windCount) * YAW_DEGREES_PER_WIND * Math.PI) / 180
}

/** Total pitch (up/down) rotation needed to fully untangle, in radians. */
export function pitchTotalRadians(windCount: number): number {
  const n = clampWindCount(windCount)
  return ((PITCH_BASE_DEGREES + n * PITCH_DEGREES_PER_WIND) * Math.PI) / 180
}

/** Higher wind counts feel slightly heavier to swing around — more rotation to clear, less snappy response. */
export function difficultyParams(windCount: number): TorsionParams {
  const n = clampWindCount(windCount)
  return { smoothing: 10 / (1 + 0.06 * (n - 1)) }
}

function createAxis(initialTwist: number): AxisState {
  return { topAngle: 0, twist: initialTwist, visualAngle: initialTwist }
}

function applyAxisRotation(axis: AxisState, newTopAngle: number): AxisState {
  const delta = newTopAngle - axis.topAngle
  return { ...axis, topAngle: newTopAngle, twist: axis.twist - delta }
}

function stepAxis(axis: AxisState, smoothing: number, dt: number): AxisState {
  const target = axis.topAngle + axis.twist
  const factor = 1 - Math.exp(-smoothing * dt)
  return { ...axis, visualAngle: axis.visualAngle + (target - axis.visualAngle) * factor }
}

export function createTorsionState(windCount: number): TorsionState {
  return {
    yaw: createAxis(yawTotalRadians(windCount)),
    pitch: createAxis(pitchTotalRadians(windCount)),
    won: false,
    winHoldTime: 0,
  }
}

/** Call whenever a new raw yaw (compass) sample arrives. */
export function applyYawRotation(state: TorsionState, newTopAngle: number): TorsionState {
  return { ...state, yaw: applyAxisRotation(state.yaw, newTopAngle) }
}

/** Call whenever a new raw pitch (front-back tilt) sample arrives. */
export function applyPitchRotation(state: TorsionState, newTopAngle: number): TorsionState {
  return { ...state, pitch: applyAxisRotation(state.pitch, newTopAngle) }
}

/** Call every frame — smooths both visual angles toward their current input and checks the win condition. dt in seconds. */
export function stepTorsion(state: TorsionState, params: TorsionParams, dt: number): TorsionState {
  if (state.won) return state

  const yaw = stepAxis(state.yaw, params.smoothing, dt)
  const pitch = stepAxis(state.pitch, params.smoothing, dt)

  const withinBand = Math.abs(yaw.twist) < WIN_TWIST_THRESHOLD && Math.abs(pitch.twist) < WIN_TWIST_THRESHOLD
  const winHoldTime = withinBand ? state.winHoldTime + dt : 0

  return { ...state, yaw, pitch, winHoldTime, won: winHoldTime >= WIN_HOLD_DURATION }
}

/** 0 = fully wound, 1 = untangled, for one axis. */
function axisProgress(axis: AxisState, totalTwist: number): number {
  if (totalTwist === 0) return 1
  return Math.max(0, Math.min(1, 1 - Math.abs(axis.twist) / totalTwist))
}

/** Overall progress — capped by whichever axis is furthest from done, since both must clear to win. */
export function twistProgress(state: TorsionState, windCount: number): number {
  const yawP = axisProgress(state.yaw, yawTotalRadians(windCount))
  const pitchP = axisProgress(state.pitch, pitchTotalRadians(windCount))
  return Math.min(yawP, pitchP)
}

/** Host → phone: lets each phone show its own player's live untangle progress. */
export interface UntangleProgressMessage {
  type: 'untangle-progress'
  progress: number
  won: boolean
}

/**
 * Accumulates a raw angle into a continuous value so a wrap (e.g. 359°→1°
 * for a compass heading) reads as +2° instead of -358°. Returns radians.
 * Pass `prevRaw: null` on the very first sample to seed it without a jump.
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
