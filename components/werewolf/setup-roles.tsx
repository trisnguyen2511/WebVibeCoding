'use client'
import { useState } from 'react'
import type { RoleDef } from '@/lib/werewolf/types'
import { groupRoles, type RoleGroup } from '@/lib/werewolf/role-bundles'
import { RoleEditorDialog } from './role-editor-dialog'

const FACTION_LABEL: Record<RoleDef['faction'], string> = {
  wolf: 'Sói',
  village: 'Dân làng',
  neutral: 'Trung lập',
}

const FACTION_COLOR: Record<RoleDef['faction'], string> = {
  wolf: 'text-red-400 border-red-400/30 bg-red-400/10',
  village: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  neutral: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
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
  const [selectedGroup, setSelectedGroup] = useState<RoleGroup | null>(null)
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
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-accent/40"
              onClick={() => setSelectedGroup(group)}
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
                    onClick={(e) => {
                      e.stopPropagation()
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
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(group.roles[0])
                    }}
                    className="h-7 w-7 rounded-md border border-border text-xs text-muted hover:border-red-500/50 hover:text-red-400"
                  >
                    🗑️
                  </button>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setGroupCount(group.roleIds, count - 1)
                  }}
                  className="h-7 w-7 rounded-md border border-border text-muted hover:text-fg"
                >
                  −
                </button>
                <span className="w-5 text-center font-mono text-sm text-fg">{count}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setGroupCount(group.roleIds, count + 1)
                  }}
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

      {/* Role description popup */}
      {selectedGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedGroup(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start gap-3">
              <span className="text-4xl leading-none">{selectedGroup.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-fg">{selectedGroup.name}</p>
                <span
                  className={`mt-1 inline-block rounded-full border px-2 py-0.5 font-mono text-xs ${FACTION_COLOR[selectedGroup.roles[0].faction]}`}
                >
                  {FACTION_LABEL[selectedGroup.roles[0].faction]}
                </span>
              </div>
            </div>

            {selectedGroup.roles.length > 1 ? (
              <div className="space-y-3">
                {selectedGroup.roles.map((r) => (
                  <div key={r.id}>
                    <p className="mb-0.5 text-xs font-medium text-accent-soft">{r.name}</p>
                    <p className="text-sm leading-relaxed text-fg/80">{r.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-fg/80">{selectedGroup.roles[0].description}</p>
            )}

            <button
              type="button"
              onClick={() => setSelectedGroup(null)}
              className="mt-5 w-full rounded-lg border border-border py-2 text-sm text-muted hover:border-accent/50 hover:text-fg"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
