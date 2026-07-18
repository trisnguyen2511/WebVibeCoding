'use client'
import type { PlayerSetup, RoleDef } from '@/lib/werewolf/types'
import { groupRoles } from '@/lib/werewolf/role-bundles'

interface SetupAssignProps {
  players: PlayerSetup[]
  allRoles: RoleDef[]
  counts: Record<string, number>
  onChange: (players: PlayerSetup[]) => void
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function SetupAssign({ players, allRoles, counts, onChange }: SetupAssignProps) {
  const groups = groupRoles(allRoles)

  function randomize() {
    const pool: string[][] = []
    for (const group of groups) {
      const count = counts[group.roleIds[0]] ?? 0
      for (let i = 0; i < count; i++) pool.push(group.roleIds)
    }
    const shuffled = shuffle(pool)
    onChange(players.map((p, i) => ({ ...p, roleIds: shuffled[i] ?? [] })))
  }

  function toggleGroup(playerId: string, roleIds: string[]) {
    onChange(
      players.map((p) => {
        if (p.id !== playerId) return p
        const hasAll = roleIds.every((id) => p.roleIds.includes(id))
        return {
          ...p,
          roleIds: hasAll ? p.roleIds.filter((id) => !roleIds.includes(id)) : [...p.roleIds, ...roleIds.filter((id) => !p.roleIds.includes(id))],
        }
      })
    )
  }

  const availableGroups = groups.filter((g) => (counts[g.roleIds[0]] ?? 0) > 0)

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={randomize}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fg hover:bg-accent/90"
      >
        🎲 Random chia vai
      </button>

      <ul className="space-y-2">
        {players.map((player) => (
          <li key={player.id} className="rounded-lg border border-border bg-surface p-2.5">
            <p className="mb-1.5 text-sm font-medium text-fg">{player.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {availableGroups.map((group) => {
                const active = group.roleIds.every((id) => player.roleIds.includes(id))
                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => toggleGroup(player.id, group.roleIds)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? 'border-accent bg-accent/15 text-fg'
                        : 'border-border text-muted hover:border-accent/40'
                    }`}
                  >
                    {group.icon} {group.name}
                  </button>
                )
              })}
            </div>
            {player.roleIds.length > 1 && (
              <p className="mt-1 font-mono text-[10px] text-accent-soft">Nhiều vai trò</p>
            )}
            {player.roleIds.length === 0 && (
              <p className="mt-1 text-[10px] text-amber-400">Chưa có vai trò</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
