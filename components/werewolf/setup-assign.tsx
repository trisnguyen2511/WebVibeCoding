'use client'
import type { AssignMode, PlayerSetup, RoleDef } from '@/lib/werewolf/types'
import { groupRoles } from '@/lib/werewolf/role-bundles'
import { randomizeAssignment } from '@/lib/werewolf/randomize-assignment'

interface SetupAssignProps {
  players: PlayerSetup[]
  allRoles: RoleDef[]
  counts: Record<string, number>
  assignMode: AssignMode
  onAssignModeChange: (mode: AssignMode) => void
  onChange: (players: PlayerSetup[]) => void
}

export function SetupAssign({ players, allRoles, counts, assignMode, onAssignModeChange, onChange }: SetupAssignProps) {
  const groups = groupRoles(allRoles)
  const availableGroups = groups.filter((g) => (counts[g.roleIds[0]] ?? 0) > 0)

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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAssignModeChange('preset')}
          className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
            assignMode === 'preset' ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:border-accent/40'
          }`}
        >
          <p className="font-medium">Gán vai trước</p>
          <p className="mt-0.5 text-[11px] leading-snug opacity-80">Random hoặc chọn tay vai cho từng người ngay tại đây.</p>
        </button>
        <button
          type="button"
          onClick={() => onAssignModeChange('live')}
          className={`rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
            assignMode === 'live' ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:border-accent/40'
          }`}
        >
          <p className="font-medium">Gán vai ngay trong đêm 1</p>
          <p className="mt-0.5 text-[11px] leading-snug opacity-80">
            MC gọi từng người theo chỗ ngồi, vừa báo vai vừa cho họ hành động luôn (kể cả người không có chức năng).
          </p>
        </button>
      </div>

      {assignMode === 'preset' ? (
        <>
          <button
            type="button"
            onClick={() => onChange(randomizeAssignment(players, allRoles, counts))}
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
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted">
          <p className="text-xl">🌙</p>
          <p className="mt-2 leading-relaxed">
            Vai trò sẽ được random ngầm khi bấm &ldquo;Bắt đầu ván&rdquo;. Sang đêm 1, MC sẽ được dẫn đi lần lượt theo đúng thứ tự
            chỗ ngồi đã sắp — mỗi người được báo vai riêng và hành động (nếu có) ngay lúc đó.
          </p>
        </div>
      )}
    </div>
  )
}
