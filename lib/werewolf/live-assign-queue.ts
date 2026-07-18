import type { GameEvent, Player, RoleDef } from './types'
import { groupRoles, type RoleGroup } from './role-bundles'
import { getActiveNightActions } from './selectors'

export interface LiveAssignStep {
  group: RoleGroup
  needed: number
  /** Người đã được gán đủ roleIds của nhóm này (theo thứ tự chỗ ngồi). */
  assignedPlayers: Player[]
  /** Vai (trong nhóm) đang cần hành động — null nếu chưa gán đủ người hoặc đã xong hết. */
  pendingRole: RoleDef | null
  /** Người sẽ thao tác cho pendingRole (đại diện cả bầy nếu isCouncil). */
  actorPlayer: Player | null
}

/**
 * Hàng đợi gán vai trực tiếp đêm 1 theo THỨ TỰ VAI TRÒ (không phải theo chỗ
 * ngồi) — MC gọi từng chức năng, tự chọn ai đang giữ vai đó ngay lúc gọi,
 * rồi thao tác luôn nếu vai có hành động đêm.
 */
export function getLiveAssignQueue(
  roles: RoleDef[],
  players: Player[],
  counts: Record<string, number>,
  night: number,
  events: GameEvent[]
): LiveAssignStep[] {
  const doneActions = getActiveNightActions(events, night)
  const isRoleDone = (roleId: string) => doneActions.some((a) => a.roleId === roleId)

  const groups = groupRoles(roles)
    .filter(
      (g) =>
        (counts[g.roleIds[0]] ?? 0) > 0 && g.roles.some((r) => r.actsAtNight && (!r.firstNightOnly || night === 1))
    )
    .sort((a, b) => Math.min(...a.roles.map((r) => r.priority)) - Math.min(...b.roles.map((r) => r.priority)))

  return groups.map((group) => {
    const needed = counts[group.roleIds[0]] ?? 0
    const assignedPlayers = players.filter((p) => group.roleIds.every((id) => p.roleIds.includes(id)))

    let pendingRole: RoleDef | null = null
    let actorPlayer: Player | null = null
    if (assignedPlayers.length >= needed) {
      const actingRoles = group.roles
        .filter((r) => r.actsAtNight && (!r.firstNightOnly || night === 1))
        .sort((a, b) => a.priority - b.priority)
      for (const role of actingRoles) {
        if (role.isCouncil) {
          if (isRoleDone(role.id)) continue
          pendingRole = role
          actorPlayer = assignedPlayers[0] ?? null
          break
        }
        const nextHolder = assignedPlayers.find(
          (p) => !doneActions.some((a) => a.roleId === role.id && a.actorPlayerId === p.id)
        )
        if (nextHolder) {
          pendingRole = role
          actorPlayer = nextHolder
          break
        }
      }
    }

    return { group, needed, assignedPlayers, pendingRole, actorPlayer }
  })
}
