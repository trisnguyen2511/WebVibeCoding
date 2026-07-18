'use client'
import { useMemo, useState } from 'react'
import type { GameEvent, Player, RoleDef } from '@/lib/werewolf/types'
import { getBlockedActorIds, getNightQueue, usesRemaining } from '@/lib/werewolf/night-queue'
import { getActiveNightActions } from '@/lib/werewolf/selectors'
import { factionOf } from '@/lib/werewolf/faction'
import { EFFECT_COLOR } from '@/lib/werewolf/effect-color'
import { TargetGraph } from './target-graph'
import { ListTargetPicker } from './list-target-picker'

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
  const [useList, setUseList] = useState(false)
  const [reveal, setReveal] = useState<{ targetName: string; isWolf: boolean; blocked: boolean } | null>(null)

  const roleById = new Map(roles.map((r) => [r.id, r]))
  const queue = useMemo(() => getNightQueue(roles, players, night, events), [roles, players, night, events])
  const blockedIds = useMemo(() => getBlockedActorIds(roles, players, events, night), [roles, players, events, night])
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
      setReveal({ targetName: target.name, isWolf: factionOf(target, roles) === 'wolf', blocked: blockedIds.has(actorPlayerId) })
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
  const actorRoles = actor?.roleIds.map((id) => roleById.get(id)).filter((r): r is RoleDef => !!r) ?? []
  const edgeColor = EFFECT_COLOR[role.effect]
  const canConfirm = role.targetCount === 0 || selected.length === role.targetCount
  const remaining = usesRemaining(role, actorPlayerId, events)
  const isBlocked = blockedIds.has(actorPlayerId)

  if (reveal) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-blue-500/40 bg-blue-500/10 px-5 py-8 text-center">
          <p className="text-3xl">{reveal.isWolf ? '🐺' : '🕊️'}</p>
          <p className="mt-3 text-sm text-muted">Kết quả soi thật (chỉ MC thấy)</p>
          <p className="mt-1 font-display text-lg font-semibold text-fg">
            {reveal.targetName} {reveal.isWolf ? 'LÀ phe Sói' : 'KHÔNG PHẢI phe Sói'}
          </p>
          {reveal.blocked && (
            <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              ⚠️ Tiên tri đã bị Nguyệt Nữ ngủ đêm nay — MC tự quyết định nói thật, nói ngược, hay không trả lời.
            </p>
          )}
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
        {actorRoles.length > 0 && (
          <p className="mt-1 text-xs text-muted">
            Vai trò của {actor?.name}: {actorRoles.map((r) => `${r.icon} ${r.name}`).join(', ')}
            {actor && actor.linkedWith.length > 0 && <span className="text-pink-400"> · 💘 Cặp đôi</span>}
          </p>
        )}
        <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted">{role.description}</p>
        {remaining !== null && (
          <p className="mt-2 inline-block rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] text-accent-soft">
            Còn {remaining} lần dùng
          </p>
        )}
      </div>

      {currentSlot.isFake ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-surface px-4 py-6 text-center">
            <p className="text-2xl">📢</p>
            <p className="mt-2 text-sm text-fg">
              {actor?.isAlive
                ? 'Đã dùng hết lượt — MC vẫn giả vờ gọi vai này để người chơi không đoán được ai còn khả năng.'
                : 'Người giữ vai này đã chết — MC vẫn giả vờ gọi tên vai để người chơi không đoán được ai đã chết.'}
            </p>
          </div>
          <button
            type="button"
            onClick={skip}
            className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98]"
          >
            Đã gọi giả — tiếp tục
          </button>
        </div>
      ) : isBlocked && role.effect !== 'inspect' ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-6 text-center">
            <p className="text-2xl">🔒</p>
            <p className="mt-2 text-sm text-fg">Bị Nguyệt Nữ khóa đêm nay — hành động sẽ không có hiệu lực.</p>
          </div>
          <button
            type="button"
            onClick={skip}
            className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98]"
          >
            Xác nhận (bị khóa, bỏ qua)
          </button>
        </div>
      ) : (
        <>
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
                {role.effect === 'revive' && role.targetCount === 0 ? 'Không cứu' : 'Bỏ qua lượt'}
              </button>
            )}
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              {role.effect === 'revive' && role.targetCount === 0 ? '🍵 Cứu' : 'Xác nhận vai này'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
