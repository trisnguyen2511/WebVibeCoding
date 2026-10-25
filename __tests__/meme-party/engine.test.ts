/** @jest-environment node */
import { applyCommand, buildPlan, checkContent, joinRoom, reconcile, heartbeat } from '@/lib/meme-party/engine'
import { buildScoreboard } from '@/lib/meme-party/scoring'
import { viewFor } from '@/lib/meme-party/view'
import { GAME_MODES, type RoomState } from '@/lib/meme-party/types'
import { lobby, makeCtx, makePool, nextCmdId, playerIds, run, seededRng, started, submissionOf, submitAll, toVoting } from '../helpers/meme-party'

const P5 = playerIds(5)

describe('match setup', () => {
  it('requires at least 2 players to start', () => {
    const res = applyCommand(lobby(1), 'host', nextCmdId(), { type: 'START_MATCH' }, makeCtx())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('not_enough_players')
  })

  it('caps the room at 12 players', () => {
    const state = lobby(12)
    const res = joinRoom(state, { memberId: 'x', name: 'Extra', tokenHash: 'x' }, { now: 1 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('room_full')
  })

  it('rejects duplicate names', () => {
    const res = joinRoom(lobby(1), { memberId: 'x', name: 'player1', tokenHash: 'x' }, { now: 1 })
    expect(res.ok).toBe(false)
  })

  it('creates a 10-round plan containing every mode at least once, with exactly two special rounds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const plan = buildPlan(10, seededRng(seed))
      expect(plan).toHaveLength(10)
      for (const mode of GAME_MODES) expect(plan.some((p) => p.mode === mode)).toBe(true)
      const specials = plan.filter((p) => p.special)
      expect(specials).toHaveLength(2)
      expect(specials.some((p) => p.special === 'double')).toBe(true)
    }
  })

  it('randomises mode order between matches', () => {
    const orders = new Set(Array.from({ length: 20 }, (_, i) => buildPlan(10, seededRng(i + 1)).map((p) => p.mode).join()))
    expect(orders.size).toBeGreaterThan(5)
  })

  it('persists the plan: later commands never change it', () => {
    let s = started()
    const plan = JSON.stringify(s.plan)
    s = submitAll(s, P5)
    s = toVoting(s)
    expect(JSON.stringify(s.plan)).toBe(plan)
  })

  it('refuses to start when the content library is too thin', () => {
    const thin = { ...makePool(), prompts: makePool().prompts.filter((p) => p.mode !== 'reaction') }
    expect(checkContent(thin)).toMatch(/reaction/)
    const res = applyCommand(lobby(5), 'host', nextCmdId(), { type: 'START_MATCH' }, makeCtx({ content: thin }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('not_enough_content')
  })

  it('players who join after the start are spectators', () => {
    const s = started()
    const res = joinRoom(s, { memberId: 'late', name: 'Late', tokenHash: 'l' }, { now: 5 })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.state.members.late.role).toBe('spectator')
      expect(res.state.members.late.eligible).toBe(false)
    }
  })

  it('snapshots the prompt and hands at round start', () => {
    const s = started()
    const round = s.rounds[0]
    expect(round.prompt.text).toContain('prompt')
    for (const p of P5) expect(round.hands[p].length).toBeGreaterThanOrEqual(3)
  })
})

describe('small rooms (2 players)', () => {
  it('starts with 2 players and needs 2 valid submissions instead of 3', () => {
    let s = run(lobby(2), 'host', { type: 'START_MATCH' })
    expect(viewFor(s, 'host', 1).round?.requiredValid).toBe(2)
    s = submitAll(s, ['p1', 'p2'])
    s = toVoting(s)
    expect(s.phase).toBe('VOTING_OPEN')
  })

  it('each player can only vote for the other, a tie gives +1 each', () => {
    let s = toVoting(submitAll(run(lobby(2), 'host', { type: 'START_MATCH' }), ['p1', 'p2']))
    expect(applyCommand(s, 'p1', nextCmdId(), { type: 'VOTE', submissionId: submissionOf(s, 'p1') }, makeCtx()).ok).toBe(false)
    s = run(s, 'p1', { type: 'VOTE', submissionId: submissionOf(s, 'p2') })
    s = run(s, 'p2', { type: 'VOTE', submissionId: submissionOf(s, 'p1') })
    s = run(s, 'host', { type: 'CLOSE_VOTING' })
    expect(s.scores.p1.points).toBe(1)
    expect(s.scores.p2.points).toBe(1)
  })

  it('still refuses to vote with one submission, and 3+ players still need 3', () => {
    let s = submitAll(run(lobby(2), 'host', { type: 'START_MATCH' }), ['p1'])
    s = run(run(s, 'host', { type: 'CLOSE_SUBMISSION' }), 'host', { type: 'APPROVE_ALL_PENDING' })
    const res = applyCommand(s, 'host', nextCmdId(), { type: 'SKIP_SHOWCASE' }, makeCtx())
    expect(!res.ok && res.error.code).toBe('not_enough_submissions')
    expect(viewFor(started(5), 'host', 1).round?.requiredValid).toBe(3)
    expect(viewFor(started(4), 'host', 1).round?.requiredValid).toBe(3)
  })
})

describe('authorization and phase guards', () => {
  it('only the host may run host commands', () => {
    const s = started()
    const res = applyCommand(s, 'p1', nextCmdId(), { type: 'OPEN_SUBMISSION' }, makeCtx())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.status).toBe(403)
  })

  it('the host cannot submit or vote', () => {
    let s = started()
    s = run(s, 'host', { type: 'OPEN_SUBMISSION' })
    const res = applyCommand(s, 'host', nextCmdId(), { type: 'SUBMIT', optionId: 'a:as1' }, makeCtx())
    expect(res.ok).toBe(false)
  })

  it('rejects unknown actors (spoofed ids)', () => {
    const res = applyCommand(started(), 'ghost', nextCmdId(), { type: 'OPEN_SUBMISSION' }, makeCtx())
    expect(res.ok).toBe(false)
  })

  it('rejects invalid transitions', () => {
    const s = started()
    for (const type of ['CLOSE_SUBMISSION', 'CLOSE_VOTING', 'PUBLISH_RESULTS', 'NEXT_ROUND', 'END_SHOWCASE', 'RESUME'] as const) {
      const res = applyCommand(s, 'host', nextCmdId(), { type }, makeCtx())
      expect(res.ok).toBe(false)
    }
  })

  it('replaying a cmdId is a no-op (idempotent)', () => {
    const s = started()
    const ctx = makeCtx()
    const first = applyCommand(s, 'host', 'dup-1', { type: 'OPEN_SUBMISSION' }, ctx)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = applyCommand(first.state, 'host', 'dup-1', { type: 'OPEN_SUBMISSION' }, ctx)
    expect(second.ok && second.duplicate).toBe(true)
    if (second.ok) expect(second.state.stateVersion).toBe(first.state.stateVersion)
  })

  it('stateVersion increases monotonically on every command', () => {
    let s = started()
    let last = s.stateVersion
    for (const cmd of [{ type: 'OPEN_SUBMISSION' }, { type: 'CLOSE_SUBMISSION' }] as const) {
      s = run(s, 'host', cmd)
      expect(s.stateVersion).toBeGreaterThan(last)
      last = s.stateVersion
    }
  })
})

describe('submission and review', () => {
  it('rejects submit before the phase opens and for spectators', () => {
    let s = started()
    const hand = s.rounds[0].hands.p1
    expect(applyCommand(s, 'p1', nextCmdId(), { type: 'SUBMIT', optionId: hand[0].id }, makeCtx()).ok).toBe(false)
    s = run(s, 'host', { type: 'OPEN_SUBMISSION' })
    const late = joinRoom(s, { memberId: 'late', name: 'Late', tokenHash: 'l' }, { now: 2 })
    if (!late.ok) throw new Error('join')
    const res = applyCommand(late.state, 'late', nextCmdId(), { type: 'SUBMIT', optionId: hand[0].id }, makeCtx())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('not_eligible')
  })

  it('keeps one submission per player and lets them change it before closing', () => {
    let s = started()
    s = run(s, 'host', { type: 'OPEN_SUBMISSION' })
    const hand = s.rounds[0].hands.p1
    s = run(s, 'p1', { type: 'SUBMIT', optionId: hand[0].id })
    s = run(s, 'p1', { type: 'SUBMIT', optionId: hand[1].id })
    const subs = s.rounds[0].submissions.filter((x) => x.playerId === 'p1')
    expect(subs).toHaveLength(1)
    expect(subs[0].option.id).toBe(hand[1].id)
  })

  it('refuses a card that is not in the player hand', () => {
    let s = started()
    s = run(s, 'host', { type: 'OPEN_SUBMISSION' })
    const foreign = s.rounds[0].hands.p2.find((o) => !s.rounds[0].hands.p1.some((h) => h.id === o.id))
    const id = foreign?.id ?? 'a:does-not-exist'
    expect(applyCommand(s, 'p1', nextCmdId(), { type: 'SUBMIT', optionId: id }, makeCtx()).ok).toBe(false)
  })

  it('requires three valid submissions from three players to proceed', () => {
    let s = started()
    s = submitAll(s, ['p1', 'p2'])
    s = run(s, 'host', { type: 'CLOSE_SUBMISSION' })
    s = run(s, 'host', { type: 'APPROVE_ALL_PENDING' })
    for (const type of ['OPEN_SHOWCASE', 'SKIP_SHOWCASE'] as const) {
      const res = applyCommand(s, 'host', nextCmdId(), { type }, makeCtx())
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe('not_enough_submissions')
    }
  })

  it('does not let the host proceed while submissions are still pending', () => {
    let s = submitAll(started(), P5)
    s = run(s, 'host', { type: 'CLOSE_SUBMISSION' })
    const res = applyCommand(s, 'host', nextCmdId(), { type: 'SKIP_SHOWCASE' }, makeCtx())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('review_incomplete')
  })

  it('rejected submissions never reach voting', () => {
    let s = submitAll(started(), P5)
    s = run(s, 'host', { type: 'CLOSE_SUBMISSION' })
    const rejected = submissionOf(s, 'p5')
    s = run(s, 'host', { type: 'REVIEW_SUBMISSION', submissionId: rejected, decision: 'reject' })
    s = run(s, 'host', { type: 'APPROVE_ALL_PENDING' })
    s = run(s, 'host', { type: 'SKIP_SHOWCASE' })
    expect(viewFor(s, 'p1', 1).round?.submissions.some((x) => x.id === rejected)).toBe(false)
    expect(applyCommand(s, 'p1', nextCmdId(), { type: 'VOTE', submissionId: rejected }, makeCtx()).ok).toBe(false)
  })

  it('reopen is only allowed with <3 valid, and skip needs a reopen first', () => {
    let s = submitAll(started(), ['p1', 'p2'])
    s = run(s, 'host', { type: 'CLOSE_SUBMISSION' })
    expect(applyCommand(s, 'host', nextCmdId(), { type: 'SKIP_ROUND' }, makeCtx()).ok).toBe(false)
    s = run(s, 'host', { type: 'REOPEN_SUBMISSION' })
    expect(s.phase).toBe('SUBMISSION_OPEN')
    s = run(s, 'host', { type: 'CLOSE_SUBMISSION' })
    s = run(s, 'host', { type: 'SKIP_ROUND' })
    expect(s.phase).toBe('ROUND_END')
    expect(s.rounds[0].skipped).toBe(true)
    expect(Object.values(s.scores).every((x) => x.points === 0)).toBe(true)

    let enough = submitAll(started(), P5)
    enough = run(run(enough, 'host', { type: 'CLOSE_SUBMISSION' }), 'host', { type: 'APPROVE_ALL_PENDING' })
    expect(applyCommand(enough, 'host', nextCmdId(), { type: 'REOPEN_SUBMISSION' }, makeCtx()).ok).toBe(false)
    expect(applyCommand(enough, 'host', nextCmdId(), { type: 'SKIP_ROUND' }, makeCtx()).ok).toBe(false)
  })

  it('a skipped round still counts toward the 10 and does not move its special effect', () => {
    let s = started()
    const plan = JSON.stringify(s.plan)
    s = run(s, 'host', { type: 'OPEN_SUBMISSION' })
    s = run(s, 'host', { type: 'CLOSE_SUBMISSION' })
    s = run(s, 'host', { type: 'REOPEN_SUBMISSION' })
    s = run(s, 'host', { type: 'CLOSE_SUBMISSION' })
    s = run(s, 'host', { type: 'SKIP_ROUND' })
    s = run(s, 'host', { type: 'NEXT_ROUND' })
    expect(s.roundIndex).toBe(1)
    expect(JSON.stringify(s.plan)).toBe(plan)
  })
})

describe('showcase', () => {
  const inReview = () => run(submitAll(started(), P5), 'host', { type: 'CLOSE_SUBMISSION' })

  it('is optional and controlled manually', () => {
    let s = run(inReview(), 'host', { type: 'APPROVE_ALL_PENDING' })
    s = run(s, 'host', { type: 'OPEN_SHOWCASE' })
    expect(s.phase).toBe('MEME_SHOWCASE')
    s = run(s, 'host', { type: 'SHOWCASE_GOTO', index: 2 })
    expect(viewFor(s, null, 1).round?.showcaseIndex).toBe(2)
    expect(applyCommand(s, 'host', nextCmdId(), { type: 'SHOWCASE_GOTO', index: 5 }, makeCtx()).ok).toBe(false)
    expect(applyCommand(s, 'host', nextCmdId(), { type: 'SHOWCASE_GOTO', index: -1 }, makeCtx()).ok).toBe(false)
    s = run(s, 'host', { type: 'END_SHOWCASE' })
    expect(s.phase).toBe('VOTING_OPEN')
  })

  it('goto is absolute, so a duplicated Next cannot skip a slide', () => {
    let s = run(run(inReview(), 'host', { type: 'APPROVE_ALL_PENDING' }), 'host', { type: 'OPEN_SHOWCASE' })
    s = run(s, 'host', { type: 'SHOWCASE_GOTO', index: 1 })
    s = run(s, 'host', { type: 'SHOWCASE_GOTO', index: 1 })
    expect(s.rounds[0].showcaseIndex).toBe(1)
  })

  it('does not change submissions, votes or scores', () => {
    let s = run(run(inReview(), 'host', { type: 'APPROVE_ALL_PENDING' }), 'host', { type: 'OPEN_SHOWCASE' })
    const before = JSON.stringify([s.rounds[0].submissions, s.rounds[0].votes, s.scores])
    s = run(s, 'host', { type: 'SHOWCASE_GOTO', index: 3 })
    expect(JSON.stringify([s.rounds[0].submissions, s.rounds[0].votes, s.scores])).toBe(before)
  })

  it('players and screens cannot control it', () => {
    const s = run(run(inReview(), 'host', { type: 'APPROVE_ALL_PENDING' }), 'host', { type: 'OPEN_SHOWCASE' })
    expect(applyCommand(s, 'p1', nextCmdId(), { type: 'SHOWCASE_GOTO', index: 1 }, makeCtx()).ok).toBe(false)
  })
})

describe('voting', () => {
  const voting = () => toVoting(submitAll(started(), P5))

  it('blocks self votes, double votes and votes outside the phase', () => {
    const s = voting()
    const own = submissionOf(s, 'p1')
    const other = submissionOf(s, 'p2')
    const self = applyCommand(s, 'p1', nextCmdId(), { type: 'VOTE', submissionId: own }, makeCtx())
    expect(!self.ok && self.error.code).toBe('self_vote')
    const voted = run(s, 'p1', { type: 'VOTE', submissionId: other })
    const again = applyCommand(voted, 'p1', nextCmdId(), { type: 'VOTE', submissionId: submissionOf(s, 'p3') }, makeCtx())
    expect(!again.ok && again.error.code).toBe('already_voted')
    const early = applyCommand(started(), 'p1', nextCmdId(), { type: 'VOTE', submissionId: other }, makeCtx())
    expect(early.ok).toBe(false)
  })

  it('lets players who did not submit vote, but not spectators', () => {
    let s = toVoting(submitAll(started(), ['p1', 'p2', 'p3']))
    s = run(s, 'p5', { type: 'VOTE', submissionId: submissionOf(s, 'p1') })
    expect(s.rounds[0].votes.p5).toBeDefined()
    const late = joinRoom(s, { memberId: 'late', name: 'Late', tokenHash: 'l' }, { now: 2 })
    if (!late.ok) throw new Error()
    const res = applyCommand(late.state, 'late', nextCmdId(), { type: 'VOTE', submissionId: submissionOf(s, 'p1') }, makeCtx())
    expect(res.ok).toBe(false)
  })

  it('rejects votes after voting is closed', () => {
    let s = voting()
    s = run(s, 'host', { type: 'CLOSE_VOTING' })
    const res = applyCommand(s, 'p1', nextCmdId(), { type: 'VOTE', submissionId: submissionOf(s, 'p2') }, makeCtx())
    expect(res.ok).toBe(false)
  })

  it('hides authors and per-submission totals until the result is published', () => {
    let s = voting()
    s = run(s, 'p1', { type: 'VOTE', submissionId: submissionOf(s, 'p2') })
    const playerJson = JSON.stringify(viewFor(s, 'p3', 5))
    const hostJson = JSON.stringify(viewFor(s, 'host', 5))
    const screenJson = JSON.stringify(viewFor(s, null, 5))
    for (const json of [playerJson, hostJson, screenJson]) {
      expect(json).not.toContain('authorId')
      expect(json).not.toContain('tokenHash')
      expect(json).not.toContain('"tallies"')
    }
    for (const id of ['p3', 'host', null]) {
      expect(JSON.stringify(viewFor(s, id, 5).round)).not.toContain('playerId')
    }
    expect(viewFor(s, 'p1', 5).myVoteSubmissionId).toBe(submissionOf(s, 'p2'))
    expect(viewFor(s, 'p3', 5).myVoteSubmissionId).toBeNull()
    s = run(s, 'host', { type: 'CLOSE_VOTING' })
    expect(JSON.stringify(viewFor(s, null, 5))).not.toContain('authorId') // locked but not published
    s = run(s, 'host', { type: 'PUBLISH_RESULTS' })
    expect(JSON.stringify(viewFor(s, null, 5))).toContain('authorId')
  })

  it('does not leak the winner through the scoreboard before results are published', () => {
    let s = voting()
    s = run(s, 'p1', { type: 'VOTE', submissionId: submissionOf(s, 'p2') })
    s = run(s, 'p3', { type: 'VOTE', submissionId: submissionOf(s, 'p2') })
    s = run(s, 'host', { type: 'CLOSE_VOTING' })
    for (const id of ['p1', 'host', null]) {
      expect(viewFor(s, id, 5).scoreboard.every((r) => r.points === 0 && r.uniqueWins === 0)).toBe(true)
    }
    s = run(s, 'host', { type: 'PUBLISH_RESULTS' })
    expect(viewFor(s, null, 5).scoreboard.find((r) => r.playerId === 'p2')).toMatchObject({ points: 3, uniqueWins: 1, rank: 1 })
  })

  it("never sends a player another player's hand", () => {
    const s = run(started(), 'host', { type: 'OPEN_SUBMISSION' })
    const v = viewFor(s, 'p1', 5)
    expect(v.myHand).toEqual(s.rounds[0].hands.p1)
    expect(JSON.stringify(viewFor(s, null, 5))).not.toContain('"hands"')
    expect(viewFor(s, null, 5).myHand).toBeNull()
  })
})

describe('scoring', () => {
  /** Plays a round to RESULTS with the given votes (voter → author of the voted submission). */
  function play(votes: Record<string, string>, special?: 'double'): RoomState {
    const ctx = makeCtx()
    let s = started(5, ctx)
    s.rounds[0].special = special ?? null
    s = toVoting(submitAll(s, P5, ctx), ctx)
    for (const [voter, author] of Object.entries(votes)) {
      s = run(s, voter, { type: 'VOTE', submissionId: submissionOf(s, author) }, ctx)
    }
    return run(s, 'host', { type: 'CLOSE_VOTING' }, ctx)
  }

  it('unique winner earns +3', () => {
    const s = play({ p1: 'p2', p3: 'p2', p4: 'p2', p5: 'p1' })
    expect(s.scores.p2).toEqual({ points: 3, uniqueWins: 1 })
    expect(s.scores.p1.points).toBe(0)
  })

  it('shared first place earns +1 each and no unique win', () => {
    const s = play({ p1: 'p2', p3: 'p2', p4: 'p5', p2: 'p5' })
    expect(s.scores.p2).toEqual({ points: 1, uniqueWins: 0 })
    expect(s.scores.p5).toEqual({ points: 1, uniqueWins: 0 })
  })

  it('double points: +6 unique / +2 shared', () => {
    expect(play({ p1: 'p2', p3: 'p2' }, 'double').scores.p2.points).toBe(6)
    const shared = play({ p1: 'p2', p3: 'p4' }, 'double')
    expect(shared.scores.p2.points).toBe(2)
    expect(shared.scores.p4.points).toBe(2)
  })

  it('no votes means no winner and no points', () => {
    const s = play({})
    expect(s.rounds[0].result?.noWinner).toBe(true)
    expect(Object.values(s.scores).every((x) => x.points === 0)).toBe(true)
  })

  it('locks the result once and rejects a second close', () => {
    const s = play({ p1: 'p2' })
    const again = applyCommand(s, 'host', nextCmdId(), { type: 'CLOSE_VOTING' }, makeCtx())
    expect(again.ok).toBe(false)
    expect(s.scores.p2.points).toBe(3)
  })

  it('ranks by points then unique wins, ties share a rank', () => {
    const s = play({ p1: 'p2', p3: 'p2' })
    s.scores = {
      p1: { points: 6, uniqueWins: 2 },
      p2: { points: 6, uniqueWins: 0 },
      p3: { points: 6, uniqueWins: 0 },
      p4: { points: 1, uniqueWins: 0 },
      p5: { points: 0, uniqueWins: 0 },
    }
    const rows = buildScoreboard(s)
    expect(rows.map((r) => [r.playerId, r.rank])).toEqual([
      ['p1', 1],
      ['p2', 2],
      ['p3', 2],
      ['p4', 4],
      ['p5', 5],
    ])
  })

  it('the host award does not change points or the official winner', () => {
    const ctx = makeCtx()
    let s = started(5, ctx)
    s.plan[0].special = 'award'
    s.rounds[0].special = 'award'
    s = toVoting(submitAll(s, P5, ctx), ctx)
    s = run(s, 'p1', { type: 'VOTE', submissionId: submissionOf(s, 'p2') }, ctx)
    s = run(s, 'host', { type: 'CLOSE_VOTING' }, ctx)
    expect(applyCommand(s, 'host', nextCmdId(), { type: 'SET_AWARD', submissionId: submissionOf(s, 'p3'), title: 'x' }, ctx).ok).toBe(false) // not published yet
    s = run(s, 'host', { type: 'PUBLISH_RESULTS' }, ctx)
    const before = JSON.stringify([s.scores, s.rounds[0].result])
    s = run(s, 'host', { type: 'SET_AWARD', submissionId: submissionOf(s, 'p3'), title: 'Meme khó hiểu nhất' }, ctx)
    expect(JSON.stringify([s.scores, s.rounds[0].result])).toBe(before)
    expect(s.rounds[0].award?.title).toBe('Meme khó hiểu nhất')
  })

  it('has no command that lets the host edit votes, scores or the winner', () => {
    const s = play({ p1: 'p2' })
    for (const bad of [{ type: 'SET_SCORE' }, { type: 'SET_WINNER' }, { type: 'EDIT_VOTE' }] as unknown as Parameters<typeof applyCommand>[3][]) {
      expect(applyCommand(s, 'host', nextCmdId(), bad, makeCtx()).ok).toBe(false)
    }
    expect(s.scores.p2.points).toBe(3)
  })
})

describe('full match', () => {
  it('runs 10 rounds to GAME_FINISHED with a consistent scoreboard', () => {
    const ctx = makeCtx()
    let s = started(5, ctx)
    for (let r = 0; r < 10; r++) {
      s = submitAll(s, P5, ctx)
      s = toVoting(s, ctx)
      s = run(s, 'p1', { type: 'VOTE', submissionId: submissionOf(s, 'p2') }, ctx)
      s = run(s, 'p3', { type: 'VOTE', submissionId: submissionOf(s, 'p2') }, ctx)
      s = run(s, 'host', { type: 'CLOSE_VOTING' }, ctx)
      s = run(s, 'host', { type: 'PUBLISH_RESULTS' }, ctx)
      if (s.rounds[r].special === 'award') {
        s = run(s, 'host', { type: 'SET_AWARD', submissionId: submissionOf(s, 'p4'), title: 'Bất ngờ nhất' }, ctx)
      }
      s = run(s, 'host', { type: 'FINISH_ROUND' }, ctx)
      s = run(s, 'host', { type: 'NEXT_ROUND' }, ctx)
    }
    expect(s.phase).toBe('GAME_FINISHED')
    expect(s.rounds).toHaveLength(10)
    // 9 single-point-value rounds x3 + 1 double round x6 = 33.
    expect(s.scores.p2.points).toBe(33)
    expect(buildScoreboard(s)[0]).toMatchObject({ playerId: 'p2', rank: 1, uniqueWins: 10 })
  })
})

describe('pause, kick, cancel', () => {
  it('pausing locks players and host phase commands; resume restores the phase', () => {
    let s = run(started(), 'host', { type: 'OPEN_SUBMISSION' })
    s = run(s, 'host', { type: 'PAUSE' })
    expect(s.phase).toBe('PAUSED')
    expect(applyCommand(s, 'p1', nextCmdId(), { type: 'SUBMIT', optionId: s.rounds[0].hands.p1[0].id }, makeCtx()).ok).toBe(false)
    expect(applyCommand(s, 'host', nextCmdId(), { type: 'CLOSE_SUBMISSION' }, makeCtx()).ok).toBe(false)
    s = run(s, 'host', { type: 'RESUME' })
    expect(s.phase).toBe('SUBMISSION_OPEN')
  })

  it('kicking keeps already-confirmed votes valid once voting is open', () => {
    let s = toVoting(submitAll(started(), P5))
    s = run(s, 'p1', { type: 'VOTE', submissionId: submissionOf(s, 'p2') })
    s = run(s, 'host', { type: 'KICK', playerId: 'p1' })
    expect(s.rounds[0].votes.p1).toBeDefined()
    expect(applyCommand(s, 'p1', nextCmdId(), { type: 'VOTE', submissionId: submissionOf(s, 'p3') }, makeCtx()).ok).toBe(false)
    s = run(s, 'host', { type: 'CLOSE_VOTING' })
    expect(s.scores.p2.points).toBe(3)
    expect(viewFor(s, 'p1', 5).me).toBeNull()
  })

  it('kicking before voting withdraws the pending submission', () => {
    let s = submitAll(started(), P5)
    s = run(s, 'host', { type: 'KICK', playerId: 'p5' })
    expect(s.rounds[0].submissions.some((x) => x.playerId === 'p5')).toBe(false)
  })

  it('kicking in the lobby removes the member; the host cannot be kicked', () => {
    let s = lobby(5)
    s = run(s, 'host', { type: 'KICK', playerId: 'p5' })
    expect(s.members.p5).toBeUndefined()
    expect(applyCommand(s, 'host', nextCmdId(), { type: 'KICK', playerId: 'host' }, makeCtx()).ok).toBe(false)
  })

  it('cancel moves to CANCELLED and blocks everything', () => {
    let s = run(started(), 'host', { type: 'CANCEL_MATCH' })
    expect(s.phase).toBe('CANCELLED')
    expect(applyCommand(s, 'host', nextCmdId(), { type: 'OPEN_SUBMISSION' }, makeCtx()).ok).toBe(false)
  })
})

describe('host disconnection and transfer', () => {
  const T0 = 1_000_000
  /** All players heartbeat at `now`; the host does not. */
  const withPlayersAlive = (state: RoomState, now: number) => P5.reduce((s, p) => heartbeat(s, p, now), state)

  function votingRoom() {
    let s = toVoting(submitAll(started(), P5))
    s = run(s, 'p1', { type: 'VOTE', submissionId: submissionOf(s, 'p2') })
    return s
  }

  it('enters HOST_RECONNECTING, locks host controls, then restores when the host returns', () => {
    let s = votingRoom()
    const now = T0 + 30_000
    s = withPlayersAlive(s, now)
    let r = reconcile(s, now)
    expect(r.state.phase).toBe('HOST_RECONNECTING')
    expect(r.state.suspendedFrom).toBe('VOTING_OPEN')
    const locked = applyCommand(r.state, 'host', nextCmdId(), { type: 'CLOSE_VOTING' }, makeCtx())
    expect(!locked.ok && locked.error.code).toBe('host_locked')
    // players can still vote while the host is away
    expect(applyCommand(r.state, 'p3', nextCmdId(), { type: 'VOTE', submissionId: submissionOf(s, 'p2') }, makeCtx()).ok).toBe(true)
    r = reconcile(heartbeat(r.state, 'host', now + 5_000), now + 5_000)
    expect(r.state.phase).toBe('VOTING_OPEN')
    expect(r.state.hostLostAt).toBeNull()
  })

  it('does not transfer before the 60s window ends and never auto-closes voting', () => {
    let s = votingRoom()
    s = withPlayersAlive(s, T0 + 30_000)
    s = reconcile(s, T0 + 30_000).state
    const mid = withPlayersAlive(s, T0 + 80_000)
    const r = reconcile(mid, T0 + 80_000)
    expect(r.state.members.host.role).toBe('host')
    expect(r.state.phase).toBe('HOST_RECONNECTING')
    expect(r.state.rounds[0].votingClosed).toBe(false)
  })

  it('transfers to the earliest-joined online eligible player and preserves all data', () => {
    let s = votingRoom()
    const before = JSON.stringify([s.rounds[0].votes, s.rounds[0].submissions, s.scores, s.rounds[0].showcaseIndex])
    s = withPlayersAlive(s, T0 + 30_000)
    s = reconcile(s, T0 + 30_000).state
    // p1 goes offline; p2 is the earliest online player
    const later = T0 + 30_000 + 61_000
    s = ['p2', 'p3', 'p4', 'p5'].reduce((acc, p) => heartbeat(acc, p, later), s)
    const r = reconcile(s, later)
    expect(r.state.members.p2.role).toBe('host')
    expect(r.state.members.host.role).toBe('spectator')
    expect(r.state.phase).toBe('VOTING_OPEN')
    expect(JSON.stringify([r.state.rounds[0].votes, r.state.rounds[0].submissions, r.state.scores, r.state.rounds[0].showcaseIndex])).toBe(before)
    // the new host controls the game; the old host cannot regain control
    expect(applyCommand(r.state, 'p2', nextCmdId(), { type: 'CLOSE_VOTING' }, makeCtx()).ok).toBe(true)
    expect(applyCommand(r.state, 'host', nextCmdId(), { type: 'CLOSE_VOTING' }, makeCtx()).ok).toBe(false)
    // a returning old host stays a spectator
    const back = reconcile(heartbeat(r.state, 'host', later + 1000), later + 1000)
    expect(back.state.members.host.role).toBe('spectator')
  })

  it('waits in HOST_TRANSFER when nobody is online, and the original host can still return', () => {
    let s = votingRoom()
    s = reconcile(s, T0 + 30_000).state
    s = reconcile(s, T0 + 100_000).state
    expect(s.phase).toBe('HOST_TRANSFER')
    s = reconcile(heartbeat(s, 'host', T0 + 110_000), T0 + 110_000).state
    expect(s.phase).toBe('VOTING_OPEN')
    expect(s.members.host.role).toBe('host')
  })

  it('does nothing in the lobby or when everyone is offline (room state preserved)', () => {
    expect(reconcile(lobby(5), T0 + 10_000_000).changed).toBe(false)
  })

  it('does not run the host timer while the match is finished', () => {
    const s = { ...votingRoom(), phase: 'GAME_FINISHED' as const }
    expect(reconcile(s, T0 + 10_000_000).changed).toBe(false)
  })
})
