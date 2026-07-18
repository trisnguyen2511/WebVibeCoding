'use client'
import { useState } from 'react'
import type { Player, RoleDef } from '@/lib/werewolf/types'
import { TargetGraph } from './target-graph'
import { ListTargetPicker } from './list-target-picker'

interface DeathTriggerPanelProps {
  role: RoleDef
  roles: RoleDef[]
  actorPlayerId: string
  players: Player[]
  onCommit: (targetPlayerIds: string[]) => void
}

export function DeathTriggerPanel({ role, roles, actorPlayerId, players, onCommit }: DeathTriggerPanelProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [useList, setUseList] = useState(false)
  const actor = players.find((p) => p.id === actorPlayerId)
  const canConfirm = role.targetCount === 0 || selected.length === role.targetCount

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-500/40 bg-surface p-3 text-center">
        <p className="text-sm text-muted">
          <span className="text-fg">{actor?.name ?? '?'}</span> vừa chết và giữ vai{' '}
          <span className="text-fg">
            {role.icon} {role.name}
          </span>
        </p>
        <p className="mt-1 text-xs text-muted">{role.description}</p>
      </div>

      {role.targetCount > 0 &&
        (useList ? (
          <ListTargetPicker
            players={players}
            actorId={actorPlayerId}
            targetCount={role.targetCount}
            selected={selected}
            onChange={setSelected}
            canTargetSelf={role.canTargetSelf}
          />
        ) : (
          <TargetGraph
            players={players}
            roles={roles}
            actorId={actorPlayerId}
            targetCount={role.targetCount}
            selected={selected}
            onChange={setSelected}
            edgeColor="#DC2626"
            canTargetSelf={role.canTargetSelf}
          />
        ))}

      <button type="button" onClick={() => setUseList((v) => !v)} className="text-xs text-muted underline">
        {useList ? 'Dùng graph kéo thả' : 'Dùng danh sách'}
      </button>

      <div className="flex gap-2">
        {role.skippable && (
          <button
            type="button"
            onClick={() => onCommit([])}
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-fg"
          >
            Bỏ qua
          </button>
        )}
        <button
          type="button"
          onClick={() => onCommit(selected)}
          disabled={!canConfirm}
          className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-fg transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          Xác nhận
        </button>
      </div>
    </div>
  )
}
