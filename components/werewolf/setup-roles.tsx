'use client'
import { useState } from 'react'
import type { RoleDef } from '@/lib/werewolf/types'
import { RoleEditorDialog } from './role-editor-dialog'

const FACTION_LABEL: Record<RoleDef['faction'], string> = {
  wolf: 'Sói',
  village: 'Dân làng',
  neutral: 'Trung lập',
}

interface SetupRolesProps {
  allRoles: RoleDef[]
  counts: Record<string, number>
  onCountsChange: (counts: Record<string, number>) => void
  onAddCustomRole: (role: RoleDef) => void
  totalPlayers: number
}

export function SetupRoles({ allRoles, counts, onCountsChange, onAddCustomRole, totalPlayers }: SetupRolesProps) {
  const [showEditor, setShowEditor] = useState(false)
  const totalAssigned = Object.values(counts).reduce((sum, n) => sum + n, 0)

  function setCount(roleId: string, count: number) {
    onCountsChange({ ...counts, [roleId]: Math.max(0, count) })
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {allRoles.map((role) => (
          <li
            key={role.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
          >
            <span className="text-lg">{role.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">
                {role.name}{' '}
                <span className="font-mono text-xs text-muted">({FACTION_LABEL[role.faction]})</span>
              </p>
              <p className="truncate text-xs text-muted">{role.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCount(role.id, (counts[role.id] ?? 0) - 1)}
                className="h-7 w-7 rounded-md border border-border text-muted hover:text-fg"
              >
                −
              </button>
              <span className="w-5 text-center font-mono text-sm text-fg">{counts[role.id] ?? 0}</span>
              <button
                type="button"
                onClick={() => setCount(role.id, (counts[role.id] ?? 0) + 1)}
                className="h-7 w-7 rounded-md border border-border text-muted hover:text-fg"
              >
                +
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showEditor ? (
        <RoleEditorDialog
          onCreate={(role) => {
            onAddCustomRole(role)
            setShowEditor(false)
          }}
          onCancel={() => setShowEditor(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowEditor(true)}
          className="w-full rounded-lg border border-dashed border-border py-2 text-sm text-muted hover:border-accent/50 hover:text-fg"
        >
          + Vai trò tùy chỉnh
        </button>
      )}

      <p className={`font-mono text-xs ${totalAssigned === totalPlayers ? 'text-emerald-400' : 'text-amber-400'}`}>
        Đã chọn {totalAssigned}/{totalPlayers} vai trò
      </p>
    </div>
  )
}
