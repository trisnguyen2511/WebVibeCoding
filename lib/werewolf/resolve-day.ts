import type { DayResolution, Player, RoleDef } from './types'

export function resolveDay(eliminatedPlayerId: string | null, players: Player[], roles: RoleDef[], day: number): DayResolution {
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const roleById = new Map(roles.map((r) => [r.id, r]))

  if (!eliminatedPlayerId) {
    return { day, eliminatedPlayerId: null, foolWinnerId: null, notes: ['MC bỏ qua, không loại ai hôm nay.'] }
  }

  const eliminated = players.find((p) => p.id === eliminatedPlayerId)
  const isFool = eliminated?.roleIds.some((rid) => roleById.get(rid)?.winsIfVotedOut) ?? false

  return {
    day,
    eliminatedPlayerId,
    foolWinnerId: isFool ? eliminatedPlayerId : null,
    notes: isFool
      ? [`${nameById.get(eliminatedPlayerId) ?? '?'} là Thằng Đần — thắng cả ván ngay lập tức!`]
      : [`${nameById.get(eliminatedPlayerId) ?? '?'} bị dân làng loại.`],
  }
}
