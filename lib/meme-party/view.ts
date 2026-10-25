import { eligiblePlayers, isOnline, requiredValid } from './engine'
import { buildScoreboard } from './scoring'
import {
  MODE_LABEL,
  type HostSubmission,
  type Member,
  type PublicSubmission,
  type RoomState,
  type RoomView,
  type RoundState,
  type RoundView,
  type ViewerKind,
} from './types'

/**
 * Builds the snapshot a given viewer is authorised to see. Protected data
 * (authors, per-submission vote counts, other players' hands, unpublished
 * results) is omitted here — it is never sent and merely hidden by CSS.
 */
export function viewFor(state: RoomState, viewerId: string | null, now: number): RoomView {
  const me: Member | null = viewerId ? (state.members[viewerId] ?? null) : null
  const viewer: ViewerKind = me && !me.kicked ? me.role : 'screen'
  const round = state.rounds[state.roundIndex] ?? null
  const eligible = eligiblePlayers(state)

  const members = Object.values(state.members)
    .filter((m) => !m.kicked)
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      eligible: m.eligible,
      connected: isOnline(state, m, now),
      hasSubmitted: !!round && round.submissions.some((s) => s.playerId === m.id && s.status !== 'rejected'),
      hasVoted: !!round && !!round.votes[m.id],
    }))

  const hostMember = Object.values(state.members).find((m) => m.role === 'host')
  const hostDeadline =
    state.hostLostAt !== null && (state.phase === 'HOST_RECONNECTING' || state.phase === 'HOST_TRANSFER' || state.phase === 'PAUSED')
      ? state.hostLostAt + state.settings.hostGraceMs
      : null

  const activePlayer = !!me && viewer === 'player' && me.eligible
  const mine = round && me ? round.submissions.find((s) => s.playerId === me.id) : undefined

  return {
    roomId: state.id,
    code: state.code,
    stateVersion: state.stateVersion,
    phase: state.phase,
    suspendedFrom: state.suspendedFrom,
    viewer,
    me: me && !me.kicked ? { id: me.id, name: me.name, role: me.role, eligible: me.eligible } : null,
    settings: {
      minPlayers: state.settings.minPlayers,
      maxPlayers: state.settings.maxPlayers,
      rounds: state.settings.rounds,
      hostGraceSeconds: Math.round(state.settings.hostGraceMs / 1000),
    },
    hostDeadline: hostMember ? hostDeadline : null,
    members,
    scoreboard: state.matchStarted ? buildScoreboard(withoutUnpublishedPoints(state, round)) : [],
    round: round ? roundView(state, round, me, viewer, eligible.length) : null,
    myHand: activePlayer && round ? (round.hands[me.id] ?? null) : null,
    mySubmission: mine ? { optionId: mine.option.id, status: mine.status } : null,
    myVoteSubmissionId: round && me ? (round.votes[me.id] ?? null) : null,
    canStart: !state.matchStarted && eligible.length >= state.settings.minPlayers,
    matchStarted: state.matchStarted,
  }
}

/**
 * Points from a locked-but-unpublished round must not leak through the
 * scoreboard — they would reveal the winner before the Host announces it.
 */
function withoutUnpublishedPoints(state: RoomState, round: RoundState | null): RoomState {
  const result = round?.result
  if (!round || !result || round.resultPublished) return state
  const scores = JSON.parse(JSON.stringify(state.scores)) as RoomState['scores']
  for (const [playerId, pts] of Object.entries(result.pointsAwarded)) {
    const entry = scores[playerId]
    if (!entry) continue
    entry.points -= pts
    if (result.unique) entry.uniqueWins -= 1
  }
  return { ...state, scores }
}

function roundView(state: RoomState, round: RoundState, me: Member | null, viewer: ViewerKind, eligibleCount: number): RoundView {
  const phase = state.phase === 'PAUSED' || state.phase === 'HOST_RECONNECTING' || state.phase === 'HOST_TRANSFER' ? state.suspendedFrom : state.phase
  const approved = round.submissions.filter((s) => s.status === 'approved').sort((a, b) => a.order - b.order)
  const showApproved = phase === 'MEME_SHOWCASE' || phase === 'VOTING_OPEN' || (phase === 'RESULTS' && round.resultPublished)

  const submissions: PublicSubmission[] = showApproved
    ? approved.map((s) => ({ id: s.id, option: s.option, ...(me && s.playerId === me.id ? { mine: true } : {}) }))
    : []

  // Host reviews submissions anonymously — authors stay hidden until the result is published.
  const reviewList: HostSubmission[] | null =
    viewer === 'host' && phase === 'REVIEW'
      ? round.submissions
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ id: s.id, option: s.option, status: s.status }))
      : null

  const published = round.resultPublished && !!round.result
  const result = published && round.result
    ? {
        tallies: round.result.tallies.map((t) => {
          const sub = round.submissions.find((s) => s.id === t.submissionId)
          return {
            submissionId: t.submissionId,
            votes: t.votes,
            option: sub!.option,
            authorId: t.playerId,
            authorName: state.members[t.playerId]?.name ?? 'Người chơi',
          }
        }),
        winnerSubmissionIds: round.result.winnerSubmissionIds,
        unique: round.result.unique,
        noWinner: round.result.noWinner,
        multiplier: round.result.multiplier,
        pointsAwarded: round.result.pointsAwarded,
      }
    : null

  return {
    index: round.index,
    total: state.plan.length,
    mode: round.mode,
    modeLabel: MODE_LABEL[round.mode],
    special: round.special,
    chaosStyle: round.chaosStyle,
    prompt: round.prompt,
    skipped: round.skipped,
    reopenCount: round.reopenCount,
    submittedCount: new Set(round.submissions.filter((s) => s.status !== 'rejected').map((s) => s.playerId)).size,
    eligibleCount,
    votedCount: Object.keys(round.votes).length,
    validCount: new Set(approved.map((s) => s.playerId)).size,
    requiredValid: requiredValid(state),
    submissions,
    showcaseIndex: round.showcaseIndex,
    reviewList,
    resultLocked: !!round.result,
    result,
    award: published ? round.award : null,
  }
}
