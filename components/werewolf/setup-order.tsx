'use client'
import type { PlayerSetup, RoleDef } from '@/lib/werewolf/types'

interface SetupOrderProps {
  players: PlayerSetup[]
  allRoles: RoleDef[]
  onChange: (players: PlayerSetup[]) => void
}

// Thứ tự trong mảng players quyết định vị trí trên vòng tròn của TargetGraph —
// sắp xếp lại đây để khớp với chỗ ngồi thật ngoài đời, giúp MC dễ hướng dẫn.
export function SetupOrder({ players, allRoles, onChange }: SetupOrderProps) {
  const roleById = new Map(allRoles.map((r) => [r.id, r]))

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= players.length) return
    const next = [...players]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Sắp xếp theo đúng vị trí ngồi ngoài đời để khi thao tác trên vòng tròn dễ chỉ tay hơn.
      </p>
      <ul className="space-y-1.5">
        {players.map((player, i) => (
          <li
            key={player.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-muted">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">{player.name}</p>
              <p className="truncate text-xs text-muted">
                {player.roleIds.map((id) => roleById.get(id)?.name).filter(Boolean).join(', ') || 'Chưa có vai trò'}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label={`Đưa ${player.name} lên trên`}
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-fg disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Đưa ${player.name} xuống dưới`}
                onClick={() => move(i, 1)}
                disabled={i === players.length - 1}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:text-fg disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
