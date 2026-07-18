import type { Player, RoleDef } from './types'

/** Vai trò "chính" để hiển thị icon đại diện — ưu tiên vai có hành động đêm sớm nhất. */
export function primaryRole(player: Player, roleById: Map<string, RoleDef>): RoleDef | undefined {
  const owned = player.roleIds.map((id) => roleById.get(id)).filter((r): r is RoleDef => !!r)
  const acting = owned.filter((r) => r.actsAtNight).sort((a, b) => a.priority - b.priority)
  return acting[0] ?? owned[0]
}
