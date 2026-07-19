// Torsional spring-damper model for "Gỡ Rối Rương Xoay": the rope between
// the player's phone and the hanging chest acts like a torsion spring —
// twisting it (chestAngle vs topAngle out of sync) creates a restoring
// torque, and damping bleeds off angular velocity so the chest settles
// instead of spinning forever. Untangling = driving that twist to zero.

export interface TorsionParams {
  stiffness: number // k — restoring torque per radian of twist
  damping: number   // c — torque per rad/s of angular velocity
  inertia: number   // I — angular inertia of the chest
}

export interface TorsionState {
  topAngle: number        // continuous (unwrapped) phone angle, radians
  chestAngle: number      // continuous (unwrapped) chest angle, radians
  chestAngularVel: number // rad/s
  won: boolean
  winHoldTime: number     // seconds the twist has stayed within the win band
}

export const WIN_TWIST_THRESHOLD = 0.14 // rad (~8°)
export const WIN_VEL_THRESHOLD = 0.6    // rad/s
export const WIN_HOLD_DURATION = 0.6    // seconds held before declaring a win

export const MIN_WIND_COUNT = 1
export const MAX_WIND_COUNT = 10

/** Higher wind counts get a stiffer, twitchier rope — more turns to fix, less room for error. */
export function difficultyParams(windCount: number): TorsionParams {
  const n = Math.max(MIN_WIND_COUNT, Math.min(MAX_WIND_COUNT, windCount))
  return {
    stiffness: 6 * (1 + 0.15 * (n - 1)),
    damping: 3.2 / (1 + 0.1 * (n - 1)),
    inertia: 1,
  }
}

export function createTorsionState(windCount: number): TorsionState {
  const n = Math.max(MIN_WIND_COUNT, Math.min(MAX_WIND_COUNT, windCount))
  return {
    topAngle: 0,
    chestAngle: n * Math.PI * 2,
    chestAngularVel: 0,
    won: false,
    winHoldTime: 0,
  }
}

export function stepTorsion(state: TorsionState, params: TorsionParams, dt: number): TorsionState {
  if (state.won) return state

  const twist = state.chestAngle - state.topAngle
  const torque = -params.stiffness * twist - params.damping * state.chestAngularVel
  const chestAngularVel = state.chestAngularVel + (torque / params.inertia) * dt
  const chestAngle = state.chestAngle + chestAngularVel * dt
  const newTwist = chestAngle - state.topAngle

  const withinBand =
    Math.abs(newTwist) < WIN_TWIST_THRESHOLD && Math.abs(chestAngularVel) < WIN_VEL_THRESHOLD
  const winHoldTime = withinBand ? state.winHoldTime + dt : 0

  return {
    ...state,
    chestAngle,
    chestAngularVel,
    winHoldTime,
    won: winHoldTime >= WIN_HOLD_DURATION,
  }
}

/** 0 = fully wound, 1 = untangled. Used for the phone's progress readout and the PC's cell label. */
export function twistProgress(state: TorsionState, windCount: number): number {
  const totalTwist = Math.max(MIN_WIND_COUNT, Math.min(MAX_WIND_COUNT, windCount)) * Math.PI * 2
  if (totalTwist === 0) return 1
  const remaining = Math.abs(state.chestAngle - state.topAngle)
  return Math.max(0, Math.min(1, 1 - remaining / totalTwist))
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
