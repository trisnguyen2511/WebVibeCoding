'use client'
import type { PlayerSetup, RoleDef } from '@/lib/werewolf/types'

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
  const roleById = new Map(allRoles.map((r) => [r.id, r]))

  function randomize() {
    const pool: string[] = []
    for (const [roleId, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) pool.push(roleId)
    }
    const shuffled = shuffle(pool)
    onChange(players.map((p, i) => ({ ...p, roleIds: shuffled[i] ? [shuffled[i]] : [] })))
  }

  function toggleRole(playerId: string, roleId: string) {
    onChange(
      players.map((p) => {
        if (p.id !== playerId) return p
        const has = p.roleIds.includes(roleId)
        return { ...p, roleIds: has ? p.roleIds.filter((id) => id !== roleId) : [...p.roleIds, roleId] }
      })
    )
  }

  const availableRoles = allRoles.filter((r) => (counts[r.id] ?? 0) > 0)

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
              {availableRoles.map((role) => {
                const active = player.roleIds.includes(role.id)
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(player.id, role.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? 'border-accent bg-accent/15 text-fg'
                        : 'border-border text-muted hover:border-accent/40'
                    }`}
                  >
                    {role.icon} {role.name}
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
