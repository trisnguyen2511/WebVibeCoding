'use client'
import { useMemo, useState } from 'react'
import type { EffectType, GameEvent, Player, RoleDef } from '@/lib/werewolf/types'
import { getNightQueue } from '@/lib/werewolf/night-queue'
import { getActiveNightActions } from '@/lib/werewolf/selectors'
import { TargetGraph } from './target-graph'
import { ListTargetPicker } from './list-target-picker'

const EFFECT_COLOR: Record<EffectType, string> = {
  kill: '#DC2626',
  poison: '#EA580C',
  protect: '#A78BFA',
  inspect: '#2563EB',
  revive: '#16A34A',
  link: '#DB2777',
  swap: '#0891B2',
  silence: '#52525B',
  custom: '#9333EA',
}

const LIST_FALLBACK_THRESHOLD = 10

interface NightPanelProps {
  roles: RoleDef[]
  players: Player[]
  night: number
  events: GameEvent[]
  onCommitAction: (roleId: string, actorPlayerId: string, targetPlayerIds: string[]) => void
  onEndNight: () => void
}

export function NightPanel({ roles, players, night, events, onCommitAction, onEndNight }: NightPanelProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [useList, setUseList] = useState(players.length > LIST_FALLBACK_THRESHOLD)

  const queue = useMemo(() => getNightQueue(roles, players, night), [roles, players, night])
  const doneActions = getActiveNightActions(events, night)
  const isDone = (roleId: string, actorPlayerId: string) =>
    doneActions.some((a) => a.roleId === roleId && a.actorPlayerId === actorPlayerId)

  const currentSlot = queue.find((slot) => !isDone(slot.role.id, slot.actorPlayerId))
  const doneCount = queue.length - (currentSlot ? queue.filter((s) => !isDone(s.role.id, s.actorPlayerId)).length : 0)

  function confirm() {
    if (!currentSlot) return
    onCommitAction(currentSlot.role.id, currentSlot.actorPlayerId, selected)
    setSelected([])
  }

  if (!currentSlot) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted">
          Tất cả vai trò đêm {night} đã hành động xong ({queue.length}/{queue.length}).
        </p>
        <button
          type="button"
          onClick={onEndNight}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-fg hover:bg-accent/90"
        >
          🌙 Kết thúc đêm {night}
        </button>
      </div>
    )
  }

  const { role, actorPlayerId } = currentSlot
  const actor = players.find((p) => p.id === actorPlayerId)
  const edgeColor = EFFECT_COLOR[role.effect]
  const canConfirm = role.targetCount === 0 || selected.length === role.targetCount

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-muted">
          Đêm {night} — {doneCount}/{queue.length} vai đã xong
        </p>
        <button type="button" onClick={() => setUseList((v) => !v)} className="text-xs text-muted underline">
          {useList ? 'Dùng graph kéo thả' : 'Dùng danh sách'}
        </button>
      </div>

      <div className="rounded-lg border border-accent/40 bg-surface p-3 text-center">
        <p className="text-lg">
          {role.icon} <span className="font-medium text-fg">{role.name}</span>
        </p>
        <p className="text-sm text-muted">
          Người thao tác: <span className="text-fg">{actor?.name ?? '?'}</span>
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
            actorId={actorPlayerId}
            targetCount={role.targetCount}
            selected={selected}
            onChange={setSelected}
            edgeColor={edgeColor}
            canTargetSelf={role.canTargetSelf}
          />
        ))}

      <button
        type="button"
        onClick={confirm}
        disabled={!canConfirm}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-fg disabled:opacity-40"
      >
        Xác nhận vai này
      </button>
    </div>
  )
}
