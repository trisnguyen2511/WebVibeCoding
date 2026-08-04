import type { NightAction, NightResolution, Player, RoleDef } from './types'

interface NightOutcome {
  blocked: Set<string>
  protectedIds: Set<string>
  pendingDeath: Map<string, string> // playerId -> roleId gây chết
  linked: [string, string][]
  healed: { actorPlayerId: string; playerId: string }[]
  notes: string[]
}

/**
 * Chạy toàn bộ hành động (đã sort theo thứ tự thức dậy) và tính ra ai đang
 * "chờ chết" tại thời điểm cuối danh sách — dùng chung cho cả resolveNight
 * (tính kết quả cuối đêm) lẫn getPendingDeathIds (Phù thủy cần biết đang có
 * bao nhiêu người sắp chết NGAY LÚC thao tác, trước khi đêm kết thúc).
 */
function runNightActions(roleById: Map<string, RoleDef>, players: Player[], sorted: NightAction[]): NightOutcome {
  const nameById = new Map(players.map((p) => [p.id, p.name]))

  // Nguyệt Nữ khóa ai đêm nay — tính trước để các vai xử lý sau (priority lớn hơn) bị vô hiệu hoá.
  const blocked = new Set<string>()
  for (const action of sorted) {
    const role = roleById.get(action.roleId)
    if (role?.effect !== 'block') continue
    for (const targetId of action.targetPlayerIds) {
      const target = players.find((p) => p.id === targetId)
      if (!target) continue
      const targetRoles = target.roleIds.map((id) => roleById.get(id)).filter((r): r is RoleDef => !!r)
      const inSoloWolfPack =
        targetRoles.some((r) => r.isCouncil) &&
        players.filter((p) => p.isAlive && p.roleIds.some((rid) => targetRoles.some((r) => r.isCouncil && r.id === rid)))
          .length <= 1
      const blocksNormalRole = targetRoles.some((r) => !r.isCouncil)
      if (blocksNormalRole || inSoloWolfPack) blocked.add(targetId)
    }
  }

  const protectedIds = new Set<string>()
  const pendingDeath = new Map<string, string>()
  const linked: [string, string][] = []
  const healed: { actorPlayerId: string; playerId: string }[] = []
  const notes: string[] = []

  for (const action of sorted) {
    const role = roleById.get(action.roleId)
    if (!role) continue
    const actorName = nameById.get(action.actorPlayerId) ?? '?'
    const targetNames = action.targetPlayerIds.map((id) => nameById.get(id) ?? '?')

    // 'link' (Cupid) is always priority 1 — Moonmaiden can't retroactively block
    // an action that already happened before she acted.
    if (role.effect !== 'block' && role.effect !== 'link' && blocked.has(action.actorPlayerId)) {
      notes.push(`${role.name} (${actorName}) bị Nguyệt Nữ khóa — hành động không có hiệu lực đêm nay`)
      continue
    }

    switch (role.effect) {
      case 'block':
        notes.push(`${role.name} (${actorName}) ngủ với ${targetNames.join(', ') || 'không ai'}`)
        break
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
        if (action.targetPlayerIds.length === 0) {
          // Bình thuốc giải kiểu Phù thủy khi chỉ có tối đa 1 người sắp chết —
          // cứu người đó (nếu có) mà không cần chỉ định. Khi có từ 2 người
          // sắp chết trở lên, UI đêm sẽ bắt MC chọn cụ thể 1 người (xem
          // getPendingDeathIds) nên nhánh này chỉ còn gặp lúc ≤1 ứng viên.
          const savedIds = Array.from(pendingDeath.keys())
          pendingDeath.clear()
          for (const id of savedIds) healed.push({ actorPlayerId: action.actorPlayerId, playerId: id })
          const savedNames = savedIds.map((id) => nameById.get(id) ?? '?')
          notes.push(
            savedNames.length
              ? `${role.name} (${actorName}) dùng thuốc giải — cứu ${savedNames.join(', ')}`
              : `${role.name} (${actorName}) dùng thuốc giải nhưng không có ai sắp chết đêm nay`
          )
        } else {
          for (const id of action.targetPlayerIds) {
            pendingDeath.delete(id)
            healed.push({ actorPlayerId: action.actorPlayerId, playerId: id })
            notes.push(`${role.name} (${actorName}) hồi sinh/cứu ${nameById.get(id) ?? '?'}`)
          }
        }
        break
      case 'swap':
      case 'custom':
      case 'silence':
        notes.push(`${role.name} (${actorName}) → ${role.description} (MC tự xử lý với ${targetNames.join(', ') || 'không có mục tiêu'})`)
        break
    }
  }

  return { blocked, protectedIds, pendingDeath, linked, healed, notes }
}

/**
 * Những ai đang "chờ chết" ngay TRƯỚC 1 hành động cụ thể trong đêm (chưa xử
 * lý xong đêm) — dùng để Phù thủy biết đang có bao nhiêu người sắp chết lúc
 * bình cứu (không chỉ định) được thao tác. Nếu ≥2 người, MC cần tự chọn cứu
 * ai thay vì tự động cứu hết.
 */
export function getPendingDeathIds(roles: RoleDef[], players: Player[], actionsSoFar: NightAction[]): string[] {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const sorted = actionsSoFar
    .filter((a) => !a.skipped)
    .sort((a, b) => (roleById.get(a.roleId)?.priority ?? 999) - (roleById.get(b.roleId)?.priority ?? 999))

  const { protectedIds, pendingDeath } = runNightActions(roleById, players, sorted)

  return Array.from(pendingDeath.entries())
    .filter(([id, causeRoleId]) => !(roleById.get(causeRoleId)?.effect === 'kill' && protectedIds.has(id)))
    .map(([id]) => id)
}

export function resolveNight(
  roles: RoleDef[],
  players: Player[],
  actions: NightAction[],
  night: number
): NightResolution {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const sorted = actions
    .filter((a) => !a.skipped)
    .sort((a, b) => {
      const pa = roleById.get(a.roleId)?.priority ?? 999
      const pb = roleById.get(b.roleId)?.priority ?? 999
      return pa - pb
    })

  const { blocked, protectedIds, pendingDeath, linked, healed, notes } = runNightActions(roleById, players, sorted)
  const nameById = new Map(players.map((p) => [p.id, p.name]))

  const saved: string[] = []
  const deaths: string[] = []
  const conversions: { playerId: string; addRoleId: string }[] = []
  for (const [playerId, causeRoleId] of Array.from(pendingDeath.entries())) {
    const causeRole = roleById.get(causeRoleId)
    if (causeRole?.effect === 'kill' && protectedIds.has(playerId)) {
      saved.push(playerId)
      continue
    }
    if (causeRole?.isWolfBite) {
      const target = players.find((p) => p.id === playerId)
      const holdsHalfWolf = target?.roleIds.some((rid) => roleById.get(rid)?.turnsWolfOnBite)
      const wolfRole = roles.find((r) => r.isWolfBite)
      if (holdsHalfWolf && wolfRole && !target?.roleIds.includes(wolfRole.id)) {
        conversions.push({ playerId, addRoleId: wolfRole.id })
        notes.push(`${nameById.get(playerId) ?? '?'} bị Sói cắn nhưng biến thành Sói từ đêm sau!`)
        continue
      }
    }
    deaths.push(playerId)
  }

  return { night, deaths, saved, linked, blocked: Array.from(blocked), conversions, healed, notes }
}
