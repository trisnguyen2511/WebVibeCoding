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
      const { night, deaths, saved } = event.payload
      const deathText = deaths.length ? deaths.map(name).join(', ') : 'không ai chết'
      const savedText = saved.length ? ` — được cứu: ${saved.map(name).join(', ')}` : ''
      return `Đêm ${night} kết thúc — ${deathText}${savedText}`
    }
    case 'day_vote':
      return `Ngày ${event.payload.day} — ${name(event.payload.voterPlayerId)} bỏ phiếu cho ${name(event.payload.targetPlayerId)}`
    case 'day_resolved': {
      const { day, eliminatedPlayerId } = event.payload
      return eliminatedPlayerId
        ? `Ngày ${day} kết thúc — ${name(eliminatedPlayerId)} bị loại`
        : `Ngày ${day} kết thúc — không ai bị loại`
    }
    case 'death_trigger_resolved': {
      const role = roleById.get(event.payload.roleId)
      const targets = event.payload.targetPlayerIds.map(name).join(', ') || 'không ai'
      return `${role?.name ?? '?'} (${name(event.payload.playerId)}) kích hoạt khi chết → ${targets}`
    }
  }
}
