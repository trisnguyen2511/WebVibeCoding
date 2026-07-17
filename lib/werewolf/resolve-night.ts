import type { NightAction, NightResolution, Player, RoleDef } from './types'

export function resolveNight(
  roles: RoleDef[],
  players: Player[],
  actions: NightAction[],
  night: number
): NightResolution {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const sorted = actions
    .filter((a) => !a.skipped)
    .sort((a, b) => {
    const pa = roleById.get(a.roleId)?.priority ?? 999
    const pb = roleById.get(b.roleId)?.priority ?? 999
    return pa - pb
  })

  const protectedIds = new Set<string>()
  const pendingDeath = new Map<string, string>() // playerId -> roleId gây chết
  const linked: [string, string][] = []
  const notes: string[] = []

  for (const action of sorted) {
    const role = roleById.get(action.roleId)
    if (!role) continue
    const actorName = nameById.get(action.actorPlayerId) ?? '?'
    const targetNames = action.targetPlayerIds.map((id) => nameById.get(id) ?? '?')

    switch (role.effect) {
      case 'protect':
        for (const id of action.targetPlayerIds) protectedIds.add(id)
        notes.push(`${role.name} (${actorName}) bảo vệ ${targetNames.join(', ')}`)
        break
      case 'inspect':
        notes.push(`${role.name} (${actorName}) soi ${targetNames.join(', ')} — MC tự thông báo kết quả`)
        break
      case 'link':
        if (action.targetPlayerIds.length === 2) {
          linked.push([action.targetPlayerIds[0], action.targetPlayerIds[1]])
          notes.push(`${role.name} (${actorName}) ghép cặp ${targetNames.join(' & ')}`)
        }
        break
      case 'kill':
        for (const id of action.targetPlayerIds) {
          if (!pendingDeath.has(id)) pendingDeath.set(id, role.id)
        }
        notes.push(`${role.name} (${actorName}) chọn giết ${targetNames.join(', ')}`)
        break
      case 'poison':
        for (const id of action.targetPlayerIds) pendingDeath.set(id, role.id)
        notes.push(`${role.name} (${actorName}) dùng thuốc độc trên ${targetNames.join(', ')}`)
        break
      case 'revive':
        for (const id of action.targetPlayerIds) {
          pendingDeath.delete(id)
          notes.push(`${role.name} (${actorName}) hồi sinh/cứu ${nameById.get(id) ?? '?'}`)
        }
        break
      case 'swap':
      case 'custom':
      case 'silence':
        notes.push(`${role.name} (${actorName}) → ${role.description} (MC tự xử lý với ${targetNames.join(', ') || 'không có mục tiêu'})`)
        break
    }
  }

  const saved: string[] = []
  const deaths: string[] = []
  for (const [playerId, causeRoleId] of Array.from(pendingDeath.entries())) {
    const role = roleById.get(causeRoleId)
    if (role?.effect === 'kill' && protectedIds.has(playerId)) {
      saved.push(playerId)
      continue
    }
    deaths.push(playerId)
  }

  return { night, deaths, saved, linked, notes }
}
