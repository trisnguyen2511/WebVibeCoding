import type { GameEvent, Player, PlayerSetup, RoleDef } from './types'

function initialPlayers(setupPlayers: PlayerSetup[], roles: RoleDef[]): Player[] {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  return setupPlayers.map((sp) => {
    const extraLives = sp.roleIds.reduce((sum, rid) => sum + (roleById.get(rid)?.extraLives ?? 0), 0)
    return {
      id: sp.id,
      name: sp.name,
      roleIds: sp.roleIds,
      isAlive: true,
      linkedWith: [],
      deathNight: null,
      deathDay: null,
      deathCause: null,
      livesLeft: 1 + extraLives,
    }
  })
}

function killPlayer(players: Map<string, Player>, playerId: string, cause: string, night: number | null, day: number | null) {
  const player = players.get(playerId)
  if (!player || !player.isAlive) return
  player.livesLeft -= 1
  if (player.livesLeft > 0) return
  player.isAlive = false
  player.deathNight = night
  player.deathDay = day
  player.deathCause = cause
}

/** Nếu 1 người trong cặp linked chết, người kia chết theo — lặp tới khi ổn định. */
function applyLinkChains(players: Map<string, Player>, night: number, cause: string) {
  let changed = true
  while (changed) {
    changed = false
    for (const player of Array.from(players.values())) {
      if (!player.isAlive) continue
      for (const linkedId of player.linkedWith) {
        const linked = players.get(linkedId)
        if (linked && !linked.isAlive) {
          killPlayer(players, player.id, cause, night, null)
          changed = true
        }
      }
    }
  }
}

/** Replay toàn bộ event log thành trạng thái người chơi hiện tại. Undo = xoá event khỏi mảng trước khi gọi hàm này. */
export function derivePlayers(setupPlayers: PlayerSetup[], roles: RoleDef[], events: GameEvent[]): Player[] {
  const players = new Map(initialPlayers(setupPlayers, roles).map((p) => [p.id, p]))

  for (const event of events) {
    if (event.type === 'night_resolved') {
      const { night, deaths, linked } = event.payload
      for (const [a, b] of linked) {
        const pa = players.get(a)
        const pb = players.get(b)
        if (pa && !pa.linkedWith.includes(b)) pa.linkedWith.push(b)
        if (pb && !pb.linkedWith.includes(a)) pb.linkedWith.push(a)
      }
      for (const playerId of deaths) {
        killPlayer(players, playerId, 'night', night, null)
      }
      applyLinkChains(players, night, 'link')
    } else if (event.type === 'day_resolved') {
      const { day, eliminatedPlayerId } = event.payload
      if (eliminatedPlayerId) {
        killPlayer(players, eliminatedPlayerId, 'vote', null, day)
        applyLinkChains(players, day, 'link')
      }
    } else if (event.type === 'death_trigger_resolved') {
      for (const targetId of event.payload.targetPlayerIds) {
        killPlayer(players, targetId, event.payload.roleId, null, null)
      }
    }
  }

  return Array.from(players.values())
}
