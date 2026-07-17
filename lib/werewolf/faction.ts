import type { Faction, Player, RoleDef } from './types'

/** Phe thực sự của 1 người chơi — ưu tiên Sói nếu giữ bất kỳ vai Sói nào (trường hợp nhiều vai). */
export function factionOf(player: Player, roles: RoleDef[]): Faction {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  for (const roleId of player.roleIds) {
    const role = roleById.get(roleId)
    if (role?.faction === 'wolf') return 'wolf'
  }
  return roleById.get(player.roleIds[0])?.faction ?? 'village'
}
