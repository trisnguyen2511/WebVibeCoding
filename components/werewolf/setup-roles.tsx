'use client'
import { useState } from 'react'
import type { RoleDef } from '@/lib/werewolf/types'
import { groupRoles } from '@/lib/werewolf/role-bundles'
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
  onUpdateCustomRole: (role: RoleDef) => void
  onDeleteCustomRole: (roleId: string) => void
  totalPlayers: number
}

export function SetupRoles({
  allRoles,
  counts,
  onCountsChange,
  onAddCustomRole,
  onUpdateCustomRole,
  onDeleteCustomRole,
  totalPlayers,
}: SetupRolesProps) {
  const [showEditor, setShowEditor] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleDef | null>(null)
  const groups = groupRoles(allRoles)
  const totalAssigned = groups.reduce((sum, g) => sum + (counts[g.roleIds[0]] ?? 0), 0)

  function setGroupCount(roleIds: string[], count: number) {
    const clamped = Math.max(0, count)
    const next = { ...counts }
    for (const roleId of roleIds) next[roleId] = clamped
    onCountsChange(next)
  }

  function handleDelete(role: RoleDef) {
    if (!window.confirm(`Xoá vai trò tùy chỉnh "${role.name}"? Không thể hoàn tác.`)) return
    onDeleteCustomRole(role.id)
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {groups.map((group) => {
          const count = counts[group.roleIds[0]] ?? 0
          const atMax = group.maxCount !== undefined && count >= group.maxCount
          const isCustom = group.roles.length === 1 && !group.roles[0].isBuiltIn
          return (
            <li
              key={group.key}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              <span className="text-lg">{group.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">
                  {group.name}{' '}
                  <span className="font-mono text-xs text-muted">({FACTION_LABEL[group.roles[0].faction]})</span>
                </p>
                <p className="truncate text-xs text-muted">
                  {group.roles.length > 1 ? group.roles.map((r) => r.description).join(' ') : group.roles[0].description}
                </p>
              </div>
              {isCustom && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Sửa ${group.name}`}
                    onClick={() => {
                      setEditingRole(group.roles[0])
                      setShowEditor(false)
                    }}
                    className="h-7 w-7 rounded-md border border-border text-xs text-muted hover:border-accent/50 hover:text-fg"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    aria-label={`Xoá ${group.name}`}
                    onClick={() => handleDelete(group.roles[0])}
                    className="h-7 w-7 rounded-md border border-border text-xs text-muted hover:border-red-500/50 hover:text-red-400"
                  >
                    🗑️
                  </button>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setGroupCount(group.roleIds, count - 1)}
                  className="h-7 w-7 rounded-md border border-border text-muted hover:text-fg"
                >
                  −
                </button>
                <span className="w-5 text-center font-mono text-sm text-fg">{count}</span>
                <button
                  type="button"
                  onClick={() => setGroupCount(group.roleIds, count + 1)}
                  disabled={atMax}
                  className="h-7 w-7 rounded-md border border-border text-muted hover:text-fg disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {editingRole ? (
        <RoleEditorDialog
          editingRole={editingRole}
          onCreate={(role) => {
            onUpdateCustomRole(role)
            setEditingRole(null)
          }}
          onCancel={() => setEditingRole(null)}
        />
      ) : showEditor ? (
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
