'use client'
import { useMemo, useState } from 'react'
import type { EffectType, GameEvent, Player, RoleDef } from '@/lib/werewolf/types'
import { getNightQueue, usesRemaining } from '@/lib/werewolf/night-queue'
import { getActiveNightActions } from '@/lib/werewolf/selectors'
import { factionOf } from '@/lib/werewolf/faction'
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
  onCommitAction: (roleId: string, actorPlayerId: string, targetPlayerIds: string[], skipped: boolean) => void
  onEndNight: () => void
}

export function NightPanel({ roles, players, night, events, onCommitAction, onEndNight }: NightPanelProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [useList, setUseList] = useState(players.length > LIST_FALLBACK_THRESHOLD)
  const [reveal, setReveal] = useState<{ targetName: string; isWolf: boolean } | null>(null)

  const queue = useMemo(() => getNightQueue(roles, players, night, events), [roles, players, night, events])
  const doneActions = getActiveNightActions(events, night)
  const isDone = (roleId: string, actorPlayerId: string) =>
    doneActions.some((a) => a.roleId === roleId && a.actorPlayerId === actorPlayerId)

  const currentSlot = queue.find((slot) => !isDone(slot.role.id, slot.actorPlayerId))
  const doneCount = queue.length - (currentSlot ? queue.filter((s) => !isDone(s.role.id, s.actorPlayerId)).length : 0)

  function confirm() {
    if (!currentSlot) return
    const { role, actorPlayerId } = currentSlot
    if (role.effect === 'inspect' && !reveal) {
      const target = players.find((p) => p.id === selected[0])
      if (!target) return
      setReveal({ targetName: target.name, isWolf: factionOf(target, roles) === 'wolf' })
      return
    }
    onCommitAction(role.id, actorPlayerId, selected, false)
    setSelected([])
    setReveal(null)
  }

  function skip() {
    if (!currentSlot) return
    onCommitAction(currentSlot.role.id, currentSlot.actorPlayerId, [], true)
    setSelected([])
    setReveal(null)
  }

  const progressPct = queue.length === 0 ? 100 : Math.round((doneCount / queue.length) * 100)

  if (!currentSlot) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-2xl border border-accent/30 bg-surface px-5 py-8">
          <p className="text-3xl">🌘</p>
          <p className="mt-3 text-sm text-muted">
            Tất cả vai trò đêm <span className="font-mono text-fg">{night}</span> đã hành động xong.
          </p>
        </div>
        <button
          type="button"
          onClick={onEndNight}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98]"
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
  const remaining = usesRemaining(role, actorPlayerId, events)

  if (reveal) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-blue-500/40 bg-blue-500/10 px-5 py-8 text-center">
          <p className="text-3xl">{reveal.isWolf ? '🐺' : '🕊️'}</p>
          <p className="mt-3 text-sm text-muted">Kết quả soi (chỉ MC thấy)</p>
          <p className="mt-1 font-display text-lg font-semibold text-fg">
            {reveal.targetName} {reveal.isWolf ? 'LÀ phe Sói' : 'KHÔNG PHẢI phe Sói'}
          </p>
        </div>
        <button
          type="button"
          onClick={confirm}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98]"
        >
          Đã xem — tiếp tục
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-muted">
            Đêm {night} · {doneCount}/{queue.length} vai đã xong
          </span>
          <button type="button" onClick={() => setUseList((v) => !v)} className="text-muted underline underline-offset-2">
            {useList ? 'Dùng graph kéo thả' : 'Dùng danh sách'}
          </button>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="rounded-2xl border border-accent/40 bg-surface px-4 py-4 text-center">
        <p className="text-2xl leading-none">{role.icon}</p>
        <p className="mt-2 font-display text-base font-semibold text-fg">{role.name}</p>
        <p className="text-sm text-muted">
          Người thao tác: <span className="text-fg">{actor?.name ?? '?'}</span>
        </p>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted">{role.description}</p>
        {remaining !== null && (
          <p className="mt-2 inline-block rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] text-accent-soft">
            Còn {remaining} lần dùng
          </p>
        )}
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

      <div className="flex gap-2">
        {role.skippable && (
          <button
            type="button"
            onClick={skip}
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-fg"
          >
            Bỏ qua lượt
          </button>
        )}
        <button
          type="button"
          onClick={confirm}
          disabled={!canConfirm}
          className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          Xác nhận vai này
        </button>
      </div>
    </div>
  )
}
