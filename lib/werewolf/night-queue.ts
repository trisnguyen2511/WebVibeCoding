import type { GameEvent, Player, RoleDef } from './types'

export interface NightSlot {
  role: RoleDef
  actorPlayerId: string
}

/** Số lần vai này (gắn với 1 actor cụ thể) còn được dùng trong cả ván. null = không giới hạn. */
export function usesRemaining(role: RoleDef, actorPlayerId: string, events: GameEvent[]): number | null {
  if (role.usesPerGame === undefined) return null
  const used = events.filter(
    (e): e is Extract<GameEvent, { type: 'night_action' }> =>
      e.type === 'night_action' &&
      e.payload.roleId === role.id &&
      e.payload.actorPlayerId === actorPlayerId &&
      !e.payload.skipped
  ).length
  return role.usesPerGame - used
}

/** Thứ tự vai trò cần thức dậy đêm nay, mỗi vai gắn với 1 người chơi đại diện thao tác. */
export function getNightQueue(roles: RoleDef[], players: Player[], night: number, events: GameEvent[]): NightSlot[] {
  const eligibleRoles = roles
    .filter((r) => r.actsAtNight && (!r.firstNightOnly || night === 1))
    .sort((a, b) => a.priority - b.priority)

  const slots: NightSlot[] = []
  for (const role of eligibleRoles) {
    const holders = players.filter((p) => p.isAlive && p.roleIds.includes(role.id))
    if (holders.length === 0) continue
    if (role.isCouncil) {
      slots.push({ role, actorPlayerId: holders[0].id })
      continue
    }
    for (const holder of holders) {
      const remaining = usesRemaining(role, holder.id, events)
      if (remaining !== null && remaining <= 0) continue
      slots.push({ role, actorPlayerId: holder.id })
    }
  }
  return slots
}

export function findDeathTrigger(
  players: Player[],
  roles: RoleDef[],
  resolvedPlayerIds: Set<string>
): { playerId: string; roleId: string } | null {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  for (const player of players) {
    if (player.isAlive || resolvedPlayerIds.has(player.id)) continue
    for (const roleId of player.roleIds) {
      const role = roleById.get(roleId)
      if (role?.effect === 'kill' && role.canTargetDead) {
        return { playerId: player.id, roleId }
      }
    }
  }
  return null
}
