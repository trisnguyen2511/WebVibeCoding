import type { PlayerSetup, RoleDef } from './types'
import { groupRoles } from './role-bundles'

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Random 1 vai (hoặc cả bó, VD 2 bình Phù thủy) cho mỗi người chơi theo số lượng đã chọn. */
export function randomizeAssignment(players: PlayerSetup[], allRoles: RoleDef[], counts: Record<string, number>): PlayerSetup[] {
  const groups = groupRoles(allRoles)
  const pool: string[][] = []
  for (const group of groups) {
    const count = counts[group.roleIds[0]] ?? 0
    for (let i = 0; i < count; i++) pool.push(group.roleIds)
  }
  const shuffled = shuffle(pool)
  return players.map((p, i) => ({ ...p, roleIds: shuffled[i] ?? [] }))
}
