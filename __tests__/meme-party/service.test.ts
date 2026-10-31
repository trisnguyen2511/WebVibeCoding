/** @jest-environment node */
import { createNewRoom, getView, joinExistingRoom, runCommand } from '@/lib/meme-party/room-service'
import { MemoryRoomStore } from '@/lib/meme-party/room-store'
import type { Command, RoomView } from '@/lib/meme-party/types'

interface Client {
  token: string
  id: string
  name: string
}

let n = 0
const cmd = () => `c${++n}`

async function setup(players = 5) {
  const store = new MemoryRoomStore()
  const created = await createNewRoom('Host', store, 1_000)
  if (!created.ok) throw new Error('create')
  const host: Client = { token: created.hostToken, id: created.memberId, name: 'Host' }
  const clients: Client[] = []
  for (let i = 1; i <= players; i++) {
    const j = await joinExistingRoom(created.code, `Player${i}`, store, 1_000)
    if (!j.ok) throw new Error('join ' + j.error.message)
    clients.push({ token: j.token, id: j.memberId, name: `Player${i}` })
  }
  const code = created.code
  const send = async (c: Client, command: Command, now = 2_000) => runCommand(code, c.token, cmd(), command, store, now)
  const must = async (c: Client, command: Command, now = 2_000) => {
    const r = await send(c, command, now)
    if (!r.ok) throw new Error(`${command.type}: ${r.error.code}`)
    return r
  }
  const view = async (c: Client | null, now = 2_000): Promise<RoomView> => {
    const r = await getView(code, c?.token ?? null, store, now)
    if (!r.ok) throw new Error('view ' + r.error.code)
    return r.view
  }
  return { store, code, host, clients, send, must, view, created }
}

async function toVoting(t: Awaited<ReturnType<typeof setup>>, submitters = t.clients) {
  await t.must(t.host, { type: 'START_MATCH' })
  await t.must(t.host, { type: 'OPEN_SUBMISSION' })
  for (const c of submitters) {
    const v = await t.view(c)
    await t.must(c, { type: 'SUBMIT', optionId: v.myHand![0].id })
  }
  await t.must(t.host, { type: 'CLOSE_SUBMISSION' })
  await t.must(t.host, { type: 'APPROVE_ALL_PENDING' })
  await t.must(t.host, { type: 'SKIP_SHOWCASE' })
}

describe('rooms and sessions', () => {
  it('lets players join by code, keeps identity across reconnects, and rejects spoofed tokens', async () => {
    const t = await setup()
    expect((await t.view(t.host)).members).toHaveLength(6)
    const again = await t.view(t.clients[0], 5_000) // "reconnect" = same token, no duplicate player
    expect(again.me?.id).toBe(t.clients[0].id)
    expect(again.members).toHaveLength(6)
    const forged = await getView(t.code, 'not-a-real-token', t.store, 2_000)
    expect(!forged.ok && forged.error.status).toBe(403)
    const spoof = await runCommand(t.code, t.clients[0].token, cmd(), { type: 'KICK', playerId: t.clients[1].id }, t.store, 2_000)
    expect(spoof.ok).toBe(false)
  })

  it('does not leak data across rooms: a token from room A is useless in room B', async () => {
    const a = await setup()
    const store = a.store
    const b = await createNewRoom('Other host', store, 1_000)
    if (!b.ok) throw new Error()
    const res = await getView(b.code, a.host.token, store, 2_000)
    expect(res.ok).toBe(false)
    const r = await runCommand(b.code, a.host.token, cmd(), { type: 'START_MATCH' }, store, 2_000)
    expect(r.ok).toBe(false)
  })

  it('players cannot run host commands; the host cannot play', async () => {
    const t = await setup()
    expect((await t.send(t.clients[0], { type: 'START_MATCH' })).ok).toBe(false)
    await t.must(t.host, { type: 'START_MATCH' })
    await t.must(t.host, { type: 'OPEN_SUBMISSION' })
    expect((await t.send(t.host, { type: 'SUBMIT', optionId: 'x' })).ok).toBe(false)
  })

  it('late joiners become spectators and cannot act', async () => {
    const t = await setup()
    await t.must(t.host, { type: 'START_MATCH' })
    const late = await joinExistingRoom(t.code, 'Late', t.store, 2_000)
    if (!late.ok) throw new Error()
    expect(late.role).toBe('spectator')
    const v = await getView(t.code, late.token, t.store, 2_000)
    expect(v.ok && v.view.myHand).toBeNull()
  })
})

describe('authoritative snapshots and synchronisation', () => {
  it('every client sees the same state version, and reconnects restore state', async () => {
    const t = await setup()
    await t.must(t.host, { type: 'START_MATCH' })
    const views = await Promise.all([t.view(t.host), t.view(null), ...t.clients.map((c) => t.view(c))])
    expect(new Set(views.map((v) => v.stateVersion)).size).toBe(1)
    expect(new Set(views.map((v) => v.phase))).toEqual(new Set(['ROUND_BRIEFING']))
    expect(new Set(views.map((v) => v.round?.prompt.text)).size).toBe(1)
  })

  it('showcase: Next/Previous synchronise to the shared screen, players and a reconnecting client', async () => {
    const t = await setup()
    await t.must(t.host, { type: 'START_MATCH' })
    await t.must(t.host, { type: 'OPEN_SUBMISSION' })
    for (const c of t.clients) await t.must(c, { type: 'SUBMIT', optionId: (await t.view(c)).myHand![0].id })
    await t.must(t.host, { type: 'CLOSE_SUBMISSION' })
    await t.must(t.host, { type: 'APPROVE_ALL_PENDING' })
    await t.must(t.host, { type: 'OPEN_SHOWCASE' })
    await t.must(t.host, { type: 'SHOWCASE_GOTO', index: 3 })
    for (const viewer of [null, t.clients[0], t.host]) {
      const v = await t.view(viewer)
      expect(v.phase).toBe('MEME_SHOWCASE')
      expect(v.round?.showcaseIndex).toBe(3)
      expect(v.round?.submissions).toHaveLength(5)
    }
    await t.must(t.host, { type: 'SHOWCASE_GOTO', index: 2 })
    expect((await t.view(null)).round?.showcaseIndex).toBe(2)
    expect((await t.send(t.clients[0], { type: 'SHOWCASE_GOTO', index: 0 })).ok).toBe(false)
    await t.must(t.host, { type: 'END_SHOWCASE' })
    expect((await t.view(null)).phase).toBe('VOTING_OPEN')
  })

  it('players only ever receive their own hand and anonymous submissions', async () => {
    const t = await setup()
    await toVoting(t)
    for (const c of t.clients) {
      const json = JSON.stringify(await t.view(c))
      expect(json).not.toContain('authorId')
      expect(json).not.toContain('tokenHash')
      for (const other of t.clients) if (other.id !== c.id) expect(json).not.toContain(`"mine":true,"id":"${other.id}"`)
    }
    const screen = await t.view(null)
    expect(screen.myHand).toBeNull()
    expect(JSON.stringify(screen)).not.toContain('"hands"')
  })
})

describe('voting integrity under concurrency', () => {
  it('exactly one of many simultaneous duplicate votes from one player is accepted', async () => {
    const t = await setup()
    await toVoting(t)
    const voter = t.clients[0]
    const targets = (await t.view(voter)).round!.submissions.filter((s) => !s.mine)
    const results = await Promise.all(targets.concat(targets).map((s) => t.send(voter, { type: 'VOTE', submissionId: s.id })))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok).length).toBe(targets.length * 2 - 1)
    const v = await t.view(voter)
    expect(v.round?.votedCount).toBe(1)
  })

  it('simultaneous votes from different players are all recorded (CAS retries)', async () => {
    const t = await setup(8)
    await toVoting(t)
    const views = await Promise.all(t.clients.map((c) => t.view(c)))
    const results = await Promise.all(
      t.clients.map((c, i) => {
        const target = views[i].round!.submissions.find((s) => !s.mine)!
        return t.send(c, { type: 'VOTE', submissionId: target.id })
      }),
    )
    expect(results.every((r) => r.ok)).toBe(true)
    expect((await t.view(t.host)).round?.votedCount).toBe(8)
  })

  it('same cmdId retried after a network blip is idempotent; voting after close is rejected', async () => {
    const t = await setup()
    await toVoting(t)
    const c = t.clients[1]
    const sub = (await t.view(c)).round!.submissions.find((s) => !s.mine)!
    const first = await runCommand(t.code, c.token, 'same-id', { type: 'VOTE', submissionId: sub.id }, t.store, 2_000)
    const replay = await runCommand(t.code, c.token, 'same-id', { type: 'VOTE', submissionId: sub.id }, t.store, 2_000)
    expect(first.ok && replay.ok && replay.duplicate).toBe(true)
    await t.must(t.host, { type: 'CLOSE_VOTING' })
    expect((await t.send(t.clients[2], { type: 'VOTE', submissionId: sub.id })).ok).toBe(false)
  })

  it('results are locked once: scores are applied exactly once even with parallel closes', async () => {
    const t = await setup()
    await toVoting(t)
    const views = await Promise.all(t.clients.slice(0, 3).map((c) => t.view(c)))
    const target = views[0].round!.submissions.find((s) => !s.mine)!
    for (let i = 1; i < 3; i++) await t.must(t.clients[i], { type: 'VOTE', submissionId: views[i].round!.submissions.find((s) => s.id === target.id && !s.mine)?.id ?? target.id }).catch(() => undefined)
    const closes = await Promise.all([t.send(t.host, { type: 'CLOSE_VOTING' }), t.send(t.host, { type: 'CLOSE_VOTING' }), t.send(t.host, { type: 'CLOSE_VOTING' })])
    expect(closes.filter((r) => r.ok)).toHaveLength(1)
    await t.must(t.host, { type: 'PUBLISH_RESULTS' })
    const v = await t.view(null)
    const total = v.scoreboard.reduce((sum, row) => sum + row.points, 0)
    expect(total === 0 || total === 3 || total === 6 || total === 1 || total === 2).toBe(true)
    const again = await t.view(null)
    expect(again.scoreboard.reduce((s, r) => s + r.points, 0)).toBe(total)
  })
})

describe('host disconnection through the service', () => {
  it('locks the host, then transfers after the grace window and the old host stays a spectator', async () => {
    const t = await setup()
    await toVoting(t)
    const start = 3_000
    // players keep polling (heartbeats); the host is silent
    for (const c of t.clients) await t.view(c, start + 25_000)
    const mid = await t.view(t.clients[0], start + 30_000)
    expect(mid.phase).toBe('HOST_RECONNECTING')
    expect(mid.hostDeadline).not.toBeNull()
    for (const c of t.clients) await t.view(c, start + 95_000)
    const after = await t.view(t.clients[0], start + 96_000)
    expect(after.phase).toBe('VOTING_OPEN')
    expect(after.me?.role).toBe('host') // earliest-joined online player
    const oldHost = await t.view(t.host, start + 97_000)
    expect(oldHost.me?.role).toBe('spectator')
    expect((await t.send(t.host, { type: 'CLOSE_VOTING' }, start + 97_500)).ok).toBe(false)
    expect((await t.send(t.clients[0], { type: 'CLOSE_VOTING' }, start + 98_000)).ok).toBe(true)
  })

  it('preserves everything when the original host returns within the window', async () => {
    const t = await setup()
    await toVoting(t)
    for (const c of t.clients) await t.view(c, 25_000)
    expect((await t.view(t.clients[0], 30_000)).phase).toBe('HOST_RECONNECTING')
    const back = await t.view(t.host, 40_000)
    expect(back.phase).toBe('VOTING_OPEN')
    expect(back.me?.role).toBe('host')
  })
})

describe('input hardening', () => {
  it('ignores forged fields: commands are applied by type only', async () => {
    const t = await setup()
    await toVoting(t)
    const forged = { type: 'CLOSE_VOTING', points: { [t.clients[0].id]: 999 }, winner: 'x' } as unknown as Command
    await t.must(t.host, forged)
    await t.must(t.host, { type: 'PUBLISH_RESULTS' })
    expect((await t.view(null)).scoreboard.every((r) => r.points === 0)).toBe(true)
  })
})
