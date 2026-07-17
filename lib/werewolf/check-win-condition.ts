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
