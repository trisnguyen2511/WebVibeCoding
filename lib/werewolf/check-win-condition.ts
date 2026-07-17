import type { Faction, Player, RoleDef } from './types'

export function checkWinCondition(players: Player[], roles: RoleDef[]): Faction | null {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const alive = players.filter((p) => p.isAlive)
  if (alive.length === 0) return null

  const factionOf = (player: Player): Faction => {
    for (const roleId of player.roleIds) {
      const role = roleById.get(roleId)
      if (role?.faction === 'wolf') return 'wolf'
    }
    return roleById.get(player.roleIds[0])?.faction ?? 'village'
  }

  const wolfCount = alive.filter((p) => factionOf(p) === 'wolf').length
  const villageCount = alive.length - wolfCount

  if (wolfCount === 0) return 'village'
  if (wolfCount >= villageCount) return 'wolf'
  return null
}
