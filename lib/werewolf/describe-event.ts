import type { GameEvent, Player, RoleDef } from './types'

const EFFECT_VERB: Partial<Record<string, string>> = {
  kill: 'giết',
  protect: 'bảo vệ',
  inspect: 'soi bói',
  poison: 'đầu độc',
  revive: 'dùng thuốc cứu',
  link: 'kết đôi',
  block: 'khóa',
}

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
      const targets = event.payload.targetPlayerIds.map(name).join(' & ') || 'không ai'
      const verb = (role?.effect && EFFECT_VERB[role.effect]) ?? 'chọn'
      return `Đêm ${event.payload.night} — ${role?.name ?? '?'} (${name(event.payload.actorPlayerId)}) ${verb} ${targets}`
    }
    case 'night_resolved': {
      const { night, deaths, saved, blocked, conversions, healed } = event.payload
      const parts: string[] = []

      if (deaths.length) {
        parts.push(`Chết: ${deaths.map(name).join(', ')}`)
      } else {
        parts.push('Không ai chết')
      }

      if (saved.length) {
        parts.push(`Sói cắn trượt (được bảo vệ): ${saved.map(name).join(', ')}`)
      }

      if (healed.length) {
        parts.push(`Phù thủy cứu: ${healed.map((h) => name(h.playerId)).join(', ')}`)
      }

      if (conversions.length) {
        parts.push(`Biến thành Sói: ${conversions.map((c) => name(c.playerId)).join(', ')}`)
      }

      if (blocked.length) {
        parts.push(`Bị khóa: ${blocked.map(name).join(', ')}`)
      }

      return `Đêm ${night} kết thúc — ${parts.join(' · ')}`
    }
    case 'day_resolved': {
      const { day, eliminatedPlayerId, foolWinnerId } = event.payload
      if (!eliminatedPlayerId) return `Ngày ${day} kết thúc — không ai bị treo cổ`
      return foolWinnerId
        ? `Ngày ${day} kết thúc — ${name(eliminatedPlayerId)} bị treo cổ nhưng là Thằng Đần, thắng cả ván!`
        : `Ngày ${day} kết thúc — ${name(eliminatedPlayerId)} bị treo cổ`
    }
    case 'death_trigger_resolved': {
      const role = roleById.get(event.payload.roleId)
      const targets = event.payload.targetPlayerIds.map(name).join(', ') || 'không ai'
      return `${role?.name ?? '?'} (${name(event.payload.playerId)}) kích hoạt khi chết → bắn ${targets}`
    }
    case 'manual_override':
      return `MC sửa tay — ${name(event.payload.playerId)} → ${event.payload.isAlive ? 'sống lại' : 'cho chết'}`
  }
}
