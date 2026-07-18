import type { GameEvent, Player, RoleDef } from './types'

export function describeEvent(event: GameEvent, players: Player[], roles: RoleDef[]): string {
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const name = (id: string) => nameById.get(id) ?? '?'

  switch (event.type) {
    case 'night_action': {
      const role = roleById.get(event.payload.roleId)
      if (event.payload.skipped) {
        return `Đêm ${event.payload.night} — ${role?.name ?? '?'} (${name(event.payload.actorPlayerId)}) bỏ qua lượt`
      }
      const targets = event.payload.targetPlayerIds.map(name).join(', ') || 'không ai'
      return `Đêm ${event.payload.night} — ${role?.name ?? '?'} (${name(event.payload.actorPlayerId)}) chọn ${targets}`
    }
    case 'night_resolved': {
      const { night, deaths, saved, blocked, conversions, healed } = event.payload
      const deathText = deaths.length ? deaths.map(name).join(', ') : 'không ai chết'
      const savedText = saved.length ? ` — được bảo vệ: ${saved.map(name).join(', ')}` : ''
      const healedText = healed.length ? ` — được cứu: ${healed.map((h) => name(h.playerId)).join(', ')}` : ''
      const blockedText = blocked.length ? ` — bị khóa: ${blocked.map(name).join(', ')}` : ''
      const convertText = conversions.length
        ? ` — biến thành Sói: ${conversions.map((c) => name(c.playerId)).join(', ')}`
        : ''
      return `Đêm ${night} kết thúc — ${deathText}${savedText}${healedText}${blockedText}${convertText}`
    }
    case 'day_resolved': {
      const { day, eliminatedPlayerId, foolWinnerId } = event.payload
      if (!eliminatedPlayerId) return `Ngày ${day} kết thúc — không ai bị loại`
      return foolWinnerId
        ? `Ngày ${day} kết thúc — ${name(eliminatedPlayerId)} bị loại nhưng là Thằng Đần, thắng cả ván!`
        : `Ngày ${day} kết thúc — ${name(eliminatedPlayerId)} bị loại`
    }
    case 'death_trigger_resolved': {
      const role = roleById.get(event.payload.roleId)
      const targets = event.payload.targetPlayerIds.map(name).join(', ') || 'không ai'
      return `${role?.name ?? '?'} (${name(event.payload.playerId)}) kích hoạt khi chết → ${targets}`
    }
    case 'manual_override':
      return `MC sửa tay — ${name(event.payload.playerId)} → ${event.payload.isAlive ? 'sống lại' : 'cho chết'}`
  }
}
