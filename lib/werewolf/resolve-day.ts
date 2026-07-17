import type { DayResolution, DayVote, Player } from './types'

export function resolveDay(votes: DayVote[], players: Player[], day: number): DayResolution {
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const tally = new Map<string, number>()
  for (const vote of votes) {
    tally.set(vote.targetPlayerId, (tally.get(vote.targetPlayerId) ?? 0) + 1)
  }

  let topId: string | null = null
  let topCount = 0
  let tie = false
  for (const [playerId, count] of Array.from(tally.entries())) {
    if (count > topCount) {
      topId = playerId
      topCount = count
      tie = false
    } else if (count === topCount) {
      tie = true
    }
  }

  const notes: string[] = []
  if (votes.length === 0) {
    notes.push('Không có phiếu bầu nào.')
    return { day, eliminatedPlayerId: null, notes }
  }
  if (tie || !topId) {
    notes.push('Hòa phiếu — MC tự xử lý (bốc thăm/vote lại) ngoài đời.')
    return { day, eliminatedPlayerId: null, notes }
  }

  notes.push(`${nameById.get(topId) ?? '?'} bị loại với ${topCount} phiếu.`)
  return { day, eliminatedPlayerId: topId, notes }
}
