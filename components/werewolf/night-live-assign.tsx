'use client'
import { useState } from 'react'
import type { GameEvent, Player, RoleDef } from '@/lib/werewolf/types'
import { getActiveNightActions } from '@/lib/werewolf/selectors'
import { factionOf } from '@/lib/werewolf/faction'
import { EFFECT_COLOR } from '@/lib/werewolf/effect-color'
import { TargetGraph } from './target-graph'
import { ListTargetPicker } from './list-target-picker'

const LIST_FALLBACK_THRESHOLD = 10

interface NightLiveAssignProps {
  roles: RoleDef[]
  players: Player[]
  night: number
  events: GameEvent[]
  onCommitAction: (roleId: string, actorPlayerId: string, targetPlayerIds: string[], skipped: boolean) => void
  onSeatCalled: (playerId: string) => void
  onEndNight: () => void
}

/**
 * Đêm 1 ở chế độ "gán vai ngay trong đêm" — MC đi lần lượt theo thứ tự chỗ
 * ngồi (players đã được sắp ở bước setup), báo vai cho từng người và để họ
 * hành động ngay lúc đó nếu vai có chức năng đêm. Người không có chức năng
 * (hoặc vai đã được quyết định bởi người khác, VD Sói thứ 2) chỉ cần xác
 * nhận đã gọi rồi qua người tiếp theo.
 */
export function NightLiveAssign({ roles, players, night, events, onCommitAction, onSeatCalled, onEndNight }: NightLiveAssignProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [useList, setUseList] = useState(players.length > LIST_FALLBACK_THRESHOLD)
  const [reveal, setReveal] = useState<{ targetName: string; isWolf: boolean } | null>(null)

  const roleById = new Map(roles.map((r) => [r.id, r]))
  const doneActions = getActiveNightActions(events, night)
  const calledIds = new Set(
    events
      .filter((e): e is Extract<GameEvent, { type: 'seat_called' }> => e.type === 'seat_called' && e.payload.night === night)
      .map((e) => e.payload.playerId)
  )

  const seatIndex = players.findIndex((p) => !calledIds.has(p.id))
  const calledCount = seatIndex === -1 ? players.length : seatIndex

  if (seatIndex === -1) {
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

  const player = players[seatIndex]
  const actionableRoles = player.roleIds
    .map((id) => roleById.get(id))
    .filter((r): r is RoleDef => !!r && r.actsAtNight && (!r.firstNightOnly || night === 1))
    .filter((r) => !doneActions.some((a) => a.roleId === r.id))
    .sort((a, b) => a.priority - b.priority)

  const allPlayerRoles = player.roleIds.map((id) => roleById.get(id)).filter((r): r is RoleDef => !!r)
  const progressPct = Math.round((calledCount / players.length) * 100)

  function confirmSeat() {
    onSeatCalled(player.id)
    setSelected([])
    setReveal(null)
  }

  if (actionableRoles.length === 0) {
    return (
      <div className="space-y-4">
        <ProgressHeader calledCount={calledCount} total={players.length} pct={progressPct} />
        <div className="rounded-2xl border border-accent/40 bg-surface px-4 py-6 text-center">
          <p className="text-xs text-muted">
            Chỗ {seatIndex + 1} —{' '}
            <span className="font-mono text-fg">{player.name}</span>
          </p>
          <p className="mt-2 font-display text-base font-semibold text-fg">
            {allPlayerRoles.length > 0 ? allPlayerRoles.map((r) => `${r.icon} ${r.name}`).join(', ') : 'Không có vai (lỗi gán)'}
          </p>
          {allPlayerRoles.some((r) => r.isCouncil) && (
            <p className="mt-2 text-xs text-muted">Bầy Sói đã quyết định trước đó — chỉ cần báo vai, không cần hành động thêm.</p>
          )}
          {allPlayerRoles.every((r) => !r.actsAtNight) && (
            <p className="mt-2 text-xs text-muted">Không có chức năng đêm nay.</p>
          )}
        </div>
        <button
          type="button"
          onClick={confirmSeat}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98]"
        >
          Đã báo vai — gọi người tiếp theo
        </button>
      </div>
    )
  }

  const role = actionableRoles[0]
  const edgeColor = EFFECT_COLOR[role.effect]
  const canConfirm = role.targetCount === 0 || selected.length === role.targetCount

  function confirmAction() {
    if (role.effect === 'inspect' && !reveal) {
      const target = players.find((p) => p.id === selected[0])
      if (!target) return
      setReveal({ targetName: target.name, isWolf: factionOf(target, roles) === 'wolf' })
      return
    }
    onCommitAction(role.id, player.id, selected, false)
    setSelected([])
    setReveal(null)
  }

  function skipAction() {
    onCommitAction(role.id, player.id, [], true)
    setSelected([])
    setReveal(null)
  }

  if (reveal) {
    return (
      <div className="space-y-4">
        <ProgressHeader calledCount={calledCount} total={players.length} pct={progressPct} />
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
      <ProgressHeader calledCount={calledCount} total={players.length} pct={progressPct} />

      <div className="rounded-2xl border border-accent/40 bg-surface px-4 py-4 text-center">
        <p className="text-xs text-muted">
          Chỗ {seatIndex + 1} — <span className="font-mono text-fg">{player.name}</span>
        </p>
        <p className="text-2xl leading-none">{role.icon}</p>
        <p className="mt-2 font-display text-base font-semibold text-fg">{role.name}</p>
        <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted">{role.description}</p>
        <button
          type="button"
          onClick={() => setUseList((v) => !v)}
          className="mt-2 text-xs text-muted underline underline-offset-2"
        >
          {useList ? 'Dùng graph kéo thả' : 'Dùng danh sách'}
        </button>
      </div>

      {role.targetCount > 0 &&
        (useList ? (
          <ListTargetPicker
            players={players}
            actorId={player.id}
            targetCount={role.targetCount}
            selected={selected}
            onChange={setSelected}
            canTargetSelf={role.canTargetSelf}
          />
        ) : (
          <TargetGraph
            players={players}
            roles={roles}
            actorId={player.id}
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

function ProgressHeader({ calledCount, total, pct }: { calledCount: number; total: number; pct: number }) {
  return (
    <div>
      <p className="font-mono text-xs text-muted">
        Gán vai đêm 1 · {calledCount}/{total} người đã được gọi
      </p>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
