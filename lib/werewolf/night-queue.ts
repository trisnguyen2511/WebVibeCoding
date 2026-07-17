import type { GameEvent, Player, RoleDef } from './types'
import { getActiveNightActions } from './selectors'

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

/**
 * Người bị Nguyệt Nữ khóa đêm nay (VD: nếu ngủ với 1 Sói duy nhất thì Sói đó
 * bị khóa; nếu bầy Sói còn nhiều người thì bầy vẫn cắn bình thường).
 */
export function getBlockedActorIds(roles: RoleDef[], players: Player[], events: GameEvent[], night: number): Set<string> {
  const actions = getActiveNightActions(events, night)
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const blocked = new Set<string>()

  for (const action of actions) {
    const role = roleById.get(action.roleId)
    if (role?.effect !== 'block' || action.skipped) continue
    for (const targetId of action.targetPlayerIds) {
      const target = players.find((p) => p.id === targetId)
      if (!target) continue
      const targetRoles = target.roleIds.map((id) => roleById.get(id)).filter((r): r is RoleDef => !!r)
      const isSoloWolfPack = targetRoles.some((r) => r.isCouncil) &&
        players.filter((p) => p.isAlive && p.roleIds.some((rid) => targetRoles.some((r) => r.isCouncil && r.id === rid))).length <= 1
      const blocksNormalRole = targetRoles.some((r) => !r.isCouncil)
      if (blocksNormalRole || isSoloWolfPack) blocked.add(targetId)
    }
  }
  return blocked
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
