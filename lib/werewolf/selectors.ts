import type { GameEvent, NightAction, DayVote } from './types'

export function getActiveNightActions(events: GameEvent[], night: number): NightAction[] {
  return events
    .filter((e): e is Extract<GameEvent, { type: 'night_action' }> => e.type === 'night_action')
    .map((e) => e.payload)
    .filter((a) => a.night === night)
}

export function getActiveDayVotes(events: GameEvent[], day: number): DayVote[] {
  const votes = events
    .filter((e): e is Extract<GameEvent, { type: 'day_vote' }> => e.type === 'day_vote')
    .map((e) => e.payload)
    .filter((v) => v.day === day)

  // Mỗi voter chỉ tính phiếu cuối cùng của họ trong ngày đó.
  const latestByVoter = new Map<string, DayVote>()
  for (const vote of votes) latestByVoter.set(vote.voterPlayerId, vote)
  return Array.from(latestByVoter.values())
}

export function isNightResolved(events: GameEvent[], night: number): boolean {
  return events.some((e) => e.type === 'night_resolved' && e.payload.night === night)
}

export function isDayResolved(events: GameEvent[], day: number): boolean {
  return events.some((e) => e.type === 'day_resolved' && e.payload.day === day)
}
