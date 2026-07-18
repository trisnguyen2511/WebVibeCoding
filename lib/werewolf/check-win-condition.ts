import type { Faction, Player, RoleDef } from './types'
import { factionOf } from './faction'

export function checkWinCondition(players: Player[], roles: RoleDef[]): Faction | null {
  const alive = players.filter((p) => p.isAlive)
  if (alive.length === 0) return null

  const wolfCount = alive.filter((p) => factionOf(p, roles) === 'wolf').length
  const villageCount = alive.length - wolfCount

  if (wolfCount === 0) return 'village'
  if (wolfCount >= villageCount) return 'wolf'
  return null
}

/**
 * Cặp đôi Cupid thắng riêng nếu họ là 2 người cuối cùng còn sống, bất kể
 * phe — kiểm tra trước checkWinCondition vì ghi đè kết quả thắng theo phe.
 */
export function checkLoversWin(players: Player[]): [string, string] | null {
  const alive = players.filter((p) => p.isAlive)
  if (alive.length !== 2) return null
  const [a, b] = alive
  if (a.linkedWith.includes(b.id) && b.linkedWith.includes(a.id)) return [a.id, b.id]
  return null
}
