import type { Player, RoleDef } from './types'

export interface NightSlot {
  role: RoleDef
  actorPlayerId: string
}

/** Thứ tự vai trò cần thức dậy đêm nay, mỗi vai gắn với 1 người chơi đại diện thao tác. */
export function getNightQueue(roles: RoleDef[], players: Player[], night: number): NightSlot[] {
  const eligibleRoles = roles
    .filter((r) => r.actsAtNight && (!r.firstNightOnly || night === 1))
    .sort((a, b) => a.priority - b.priority)

  const slots: NightSlot[] = []
  for (const role of eligibleRoles) {
    const holders = players.filter((p) => p.isAlive && p.roleIds.includes(role.id))
    if (holders.length === 0) continue
    if (role.isCouncil) {
      slots.push({ role, actorPlayerId: holders[0].id })
    } else {
      for (const holder of holders) slots.push({ role, actorPlayerId: holder.id })
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
