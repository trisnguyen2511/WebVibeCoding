import type { RoomState, RoundResult, RoundState, ScoreRow } from './types'

export const POINTS_UNIQUE = 3
export const POINTS_SHARED = 1

/**
 * Computes the official result of a round from server-confirmed votes.
 * Pure: it does not touch scores — the caller applies `pointsAwarded` once.
 */
export function computeRoundResult(round: RoundState, now: number): RoundResult {
  const approved = round.submissions.filter((s) => s.status === 'approved')
  const counts = new Map<string, number>(approved.map((s) => [s.id, 0]))
  for (const submissionId of Object.values(round.votes)) {
    if (counts.has(submissionId)) counts.set(submissionId, (counts.get(submissionId) ?? 0) + 1)
  }
  const tallies = approved
    .map((s) => ({ submissionId: s.id, playerId: s.playerId, votes: counts.get(s.id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes)
  const max = tallies.length > 0 ? tallies[0].votes : 0
  const multiplier: 1 | 2 = round.special === 'double' ? 2 : 1
  const pointsAwarded: Record<string, number> = {}

  if (max === 0) {
    return { tallies, winnerSubmissionIds: [], unique: false, noWinner: true, multiplier, pointsAwarded, lockedAt: now }
  }
  const winners = tallies.filter((t) => t.votes === max)
  const unique = winners.length === 1
  const each = (unique ? POINTS_UNIQUE : POINTS_SHARED) * multiplier
  for (const w of winners) pointsAwarded[w.playerId] = (pointsAwarded[w.playerId] ?? 0) + each
  return {
    tallies,
    winnerSubmissionIds: winners.map((w) => w.submissionId),
    unique,
    noWinner: false,
    multiplier,
    pointsAwarded,
    lockedAt: now,
  }
}

/** Standard competition ranking: points desc, unique wins desc, otherwise a shared rank (1,1,3). */
export function buildScoreboard(state: RoomState): ScoreRow[] {
  const rows = Object.entries(state.scores).map(([playerId, s]) => ({
    playerId,
    name: state.members[playerId]?.name ?? 'Người chơi',
    points: s.points,
    uniqueWins: s.uniqueWins,
    rank: 0,
  }))
  rows.sort((a, b) => b.points - a.points || b.uniqueWins - a.uniqueWins || a.name.localeCompare(b.name))
  rows.forEach((row, i) => {
    const prev = rows[i - 1]
    row.rank = prev && prev.points === row.points && prev.uniqueWins === row.uniqueWins ? prev.rank : i + 1
  })
  return rows
}
