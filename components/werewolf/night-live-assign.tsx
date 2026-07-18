'use client'
import { useState } from 'react'
import type { GameEvent, Player, RoleDef } from '@/lib/werewolf/types'
import { getLiveAssignQueue } from '@/lib/werewolf/live-assign-queue'
import { getPendingDeathIds } from '@/lib/werewolf/resolve-night'
import { getActiveNightActions } from '@/lib/werewolf/selectors'
import { factionOf } from '@/lib/werewolf/faction'
import { EFFECT_COLOR } from '@/lib/werewolf/effect-color'
import { TargetGraph } from './target-graph'
import { ListTargetPicker } from './list-target-picker'

interface NightLiveAssignProps {
  roles: RoleDef[]
  players: Player[]
  setupRoleCounts: Record<string, number>
  night: number
  events: GameEvent[]
  onCommitAction: (roleId: string, actorPlayerId: string, targetPlayerIds: string[], skipped: boolean) => void
  onAssignRole: (playerId: string, roleIds: string[]) => void
  onEndNight: () => void
}

/**
 * Đêm 1 ở chế độ "gán vai ngay trong đêm" — đi theo THỨ TỰ VAI TRÒ như đêm
 * bình thường (Sói trước, Bảo vệ sau...), gọi TẤT CẢ vai đã chọn kể cả vai
 * không có hành động đêm (Dân thường...) để không ai bị lộ qua việc "vai
 * nào được gọi". Mỗi vai: MC chọn đủ số người đang giữ vai đó ngay lúc gọi
 * (MC tự biết mặt nhờ đã sắp xếp ngoài đời), rồi thao tác luôn (kéo mũi
 * tên) nếu vai có hành động đêm.
 */
export function NightLiveAssign({
  roles,
  players,
  setupRoleCounts,
  night,
  events,
  onCommitAction,
  onAssignRole,
  onEndNight,
}: NightLiveAssignProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [useList, setUseList] = useState(false)
  const [reveal, setReveal] = useState<{ targetName: string; isWolf: boolean } | null>(null)

  const queue = getLiveAssignQueue(roles, players, setupRoleCounts, night, events)
  const totalSteps = queue.length
  const doneSteps = queue.filter((s) => s.assignedPlayers.length >= s.needed && !s.pendingRole).length
  const currentStep = queue.find((s) => s.assignedPlayers.length < s.needed || s.pendingRole)

  const unassigned = players.filter((p) => p.roleIds.length === 0)

  if (!currentStep) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-2xl border border-accent/30 bg-surface px-5 py-8">
          <p className="text-3xl">🌘</p>
          <p className="mt-3 text-sm text-muted">Đã gọi và gán vai xong cho tất cả mọi người.</p>
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

  const { group, needed, assignedPlayers, pendingRole, actorPlayer } = currentStep

  function confirmAssign(playerId: string) {
    onAssignRole(playerId, group.roleIds)
  }

  if (assignedPlayers.length < needed) {
    return (
      <div className="space-y-4">
        <ProgressHeader done={doneSteps} total={totalSteps} />
        <div className="rounded-2xl border border-accent/40 bg-surface px-4 py-4 text-center">
          <p className="text-2xl leading-none">{group.icon}</p>
          <p className="mt-2 font-display text-base font-semibold text-fg">{group.name}</p>
          <p className="mt-1 text-xs text-muted">
            Gọi &ldquo;{group.name} dậy đi&rdquo; — chọn {needed - assignedPlayers.length} người còn lại đang giữ vai này
            {assignedPlayers.length > 0 && ` (đã chọn ${assignedPlayers.map((p) => p.name).join(', ')})`}.
          </p>
          {!group.roles.some((r) => r.actsAtNight && (!r.firstNightOnly || night === 1)) && (
            <p className="mt-1 text-[11px] text-muted">Vai này không có hành động đêm — chỉ cần gọi và gán tên.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {unassigned.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => confirmAssign(player.id)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-fg transition-colors hover:border-accent/40"
            >
              {player.name}
            </button>
          ))}
        </div>
        {unassigned.length === 0 && (
          <p className="text-center text-xs text-amber-400">Không còn ai chưa được gán vai — kiểm tra lại số lượng vai đã chọn.</p>
        )}
      </div>
    )
  }

  const role = pendingRole!
  const actor = actorPlayer!
  const edgeColor = EFFECT_COLOR[role.effect]
  const canConfirm = role.targetCount === 0 || selected.length === role.targetCount
  const doneActions = getActiveNightActions(events, night)

  // Bình cứu không chỉ định (Phù thủy) — nếu có từ 2 người trở lên đang sắp
  // chết cùng đêm, bắt MC tự chọn cứu ai thay vì tự động cứu hết.
  const isUntargetedRevive = role.effect === 'revive' && role.targetCount === 0
  const reviveCandidates = isUntargetedRevive ? getPendingDeathIds(roles, players, doneActions) : []
  const needsReviveChoice = isUntargetedRevive && reviveCandidates.length > 1
  const reviveChoice = selected[0] ?? reviveCandidates[0]

  function confirmAction() {
    if (role.effect === 'inspect' && !reveal) {
      const target = players.find((p) => p.id === selected[0])
      if (!target) return
      setReveal({ targetName: target.name, isWolf: factionOf(target, roles) === 'wolf' })
      return
    }
    if (isUntargetedRevive) {
      const candidates = getPendingDeathIds(roles, players, doneActions)
      const chosen = candidates.length > 1 ? (selected[0] ?? candidates[0]) : undefined
      onCommitAction(role.id, actor.id, chosen ? [chosen] : [], false)
    } else {
      onCommitAction(role.id, actor.id, selected, false)
    }
    setSelected([])
    setReveal(null)
  }

  function skipAction() {
    onCommitAction(role.id, actor.id, [], true)
    setSelected([])
    setReveal(null)
  }

  if (reveal) {
    return (
      <div className="space-y-4">
        <ProgressHeader done={doneSteps} total={totalSteps} />
        <div className="rounded-2xl border border-blue-500/40 bg-blue-500/10 px-5 py-8 text-center">
          <p className="text-3xl">{reveal.isWolf ? '🐺' : '🕊️'}</p>
          <p className="mt-3 text-sm text-muted">Kết quả soi (chỉ MC thấy)</p>
          <p className="mt-1 font-display text-lg font-semibold text-fg">
            {reveal.targetName} {reveal.isWolf ? 'LÀ phe Sói' : 'KHÔNG PHẢI phe Sói'}
          </p>
        </div>
        <button
          type="button"
          onClick={confirmAction}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98]"
        >
          Đã xem — tiếp tục
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ProgressHeader done={doneSteps} total={totalSteps} />

      <div className="rounded-2xl border border-accent/40 bg-surface px-4 py-4 text-center">
        <p className="text-2xl leading-none">{role.icon}</p>
        <p className="mt-2 font-display text-base font-semibold text-fg">{role.name}</p>
        <p className="text-sm text-muted">
          Người thao tác: <span className="text-fg">{actor.name}</span>
        </p>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted">{role.description}</p>
        <button
          type="button"
          onClick={() => setUseList((v) => !v)}
          className="mt-2 text-xs text-muted underline underline-offset-2"
        >
          {useList ? 'Dùng graph kéo thả' : 'Dùng danh sách'}
        </button>
      </div>

      {needsReviveChoice && (
        <div className="space-y-2">
          <p className="text-center text-xs text-muted">
            Có {reviveCandidates.length} người đang sắp chết đêm nay — chọn 1 người để cứu:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {reviveCandidates.map((id) => {
              const p = players.find((pl) => pl.id === id)
              if (!p) return null
              const isChosen = reviveChoice === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelected([id])}
                  className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    isChosen ? 'border-accent bg-accent/10 text-fg' : 'border-border bg-surface text-fg hover:border-accent/40'
                  }`}
                >
                  {p.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {role.targetCount > 0 &&
        (useList ? (
          <ListTargetPicker
            players={players}
            actorId={actor.id}
            targetCount={role.targetCount}
            selected={selected}
            onChange={setSelected}
            canTargetSelf={role.canTargetSelf}
          />
        ) : (
          <TargetGraph
            players={players}
            roles={roles}
            actorId={actor.id}
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
            onClick={skipAction}
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-fg"
          >
            {role.effect === 'revive' && role.targetCount === 0 ? 'Không cứu' : 'Bỏ qua lượt'}
          </button>
        )}
        <button
          type="button"
          onClick={confirmAction}
          disabled={!canConfirm}
          className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          {role.effect === 'revive' && role.targetCount === 0 ? '🍵 Cứu' : 'Xác nhận vai này'}
        </button>
      </div>
    </div>
  )
}

function ProgressHeader({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100)
  return (
    <div>
      <p className="font-mono text-xs text-muted">
        Gán vai đêm 1 · {done}/{total} vai đã xong
      </p>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
