import type { GameEvent, GamePhase } from './types'

export function popLastEvent(events: GameEvent[]): { events: GameEvent[]; popped: GameEvent | null } {
  if (events.length === 0) return { events, popped: null }
  return { events: events.slice(0, -1), popped: events[events.length - 1] }
}

/** Sau khi undo 1 event, xác định phase/đêm/ngày phù hợp để quay lại điều hành tiếp. */
export function phaseAfterUndo(popped: GameEvent): { phase: GamePhase; night?: number; day?: number } | null {
  switch (popped.type) {
    case 'night_resolved':
      return { phase: 'night', night: popped.payload.night }
    case 'day_resolved':
      return { phase: 'day', day: popped.payload.day }
    case 'manual_override':
      return { phase: 'recap' }
    default:
      return null
  }
}

/** Đêm N -> Ngày N -> Đêm N+1 (đánh số lockstep) — dùng khi cắt ngắn event log (timeline "undo tới đây"). */
export function phaseAfterTruncate(events: GameEvent[]): { phase: GamePhase; night: number; day: number } {
  let lastNight: number | null = null
  let lastDay: number | null = null
  let lastNightIndex = -1
  let lastDayIndex = -1

  events.forEach((event, i) => {
    if (event.type === 'night_resolved') {
      lastNight = event.payload.night
      lastNightIndex = i
    } else if (event.type === 'day_resolved') {
      lastDay = event.payload.day
      lastDayIndex = i
    }
  })

  if (lastNightIndex === -1 && lastDayIndex === -1) {
    return { phase: 'night', night: 1, day: 1 }
  }
  if (lastDayIndex > lastNightIndex && lastDay !== null) {
    return { phase: 'night', night: lastDay + 1, day: lastDay + 1 }
  }
  if (lastNight !== null) {
    return { phase: 'recap', night: lastNight, day: lastNight }
  }
  return { phase: 'night', night: 1, day: 1 }
}
