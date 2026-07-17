'use client'
import type { Player, RoleDef } from '@/lib/werewolf/types'

interface RosterViewProps {
  players: Player[]
  roles: RoleDef[]
}

export function RosterView({ players, roles }: RosterViewProps) {
  const roleById = new Map(roles.map((r) => [r.id, r]))

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Danh sách vai trò đầy đủ — chỉ MC xem, không lộ cho người chơi.</p>
      <ul className="space-y-1.5">
        {players.map((player) => (
          <li
            key={player.id}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
              player.isAlive ? 'border-border bg-surface' : 'border-border bg-surface opacity-50'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">
                {player.name} {!player.isAlive && <span className="text-xs text-red-400">(đã chết)</span>}
              </span>
              <span className="block truncate text-xs text-muted">
                {player.roleIds
                  .map((id) => roleById.get(id))
                  .filter((r): r is RoleDef => !!r)
                  .map((r) => `${r.icon} ${r.name}`)
                  .join(', ') || '—'}
                {player.linkedWith.length > 0 && <span className="text-pink-400"> · 💘 Cặp đôi</span>}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
