import type { GameEvent, NightAction } from './types'

export function getActiveNightActions(events: GameEvent[], night: number): NightAction[] {
  return events
    .filter((e): e is Extract<GameEvent, { type: 'night_action' }> => e.type === 'night_action')
    .map((e) => e.payload)
    .filter((a) => a.night === night)
}

export function isNightResolved(events: GameEvent[], night: number): boolean {
  return events.some((e) => e.type === 'night_resolved' && e.payload.night === night)
}

export function isDayResolved(events: GameEvent[], day: number): boolean {
  return events.some((e) => e.type === 'day_resolved' && e.payload.day === day)
}
