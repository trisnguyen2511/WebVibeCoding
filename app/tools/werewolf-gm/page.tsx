'use client'
import { useEffect, useMemo, useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { cloneBuiltInRoles } from '@/lib/werewolf/built-in-roles'
import { derivePlayers } from '@/lib/werewolf/derive-game-state'
import { checkWinCondition } from '@/lib/werewolf/check-win-condition'
import { phaseAfterTruncate, phaseAfterUndo, popLastEvent } from '@/lib/werewolf/game-actions'
import { findDeathTrigger } from '@/lib/werewolf/night-queue'
import { resolveDay } from '@/lib/werewolf/resolve-day'
import { resolveNight } from '@/lib/werewolf/resolve-night'
import { getActiveDayVotes, getActiveNightActions } from '@/lib/werewolf/selectors'
import { clearGameState, loadGameState, saveGameState } from '@/lib/werewolf/storage'
import type { GameEvent, GameState, RoleDef } from '@/lib/werewolf/types'

import { SetupPlayers } from '@/components/werewolf/setup-players'
import { SetupRoles } from '@/components/werewolf/setup-roles'
import { SetupAssign } from '@/components/werewolf/setup-assign'
import { NightPanel } from '@/components/werewolf/night-panel'
import { DayPanel } from '@/components/werewolf/day-panel'
import { DeathTriggerPanel } from '@/components/werewolf/death-trigger-panel'
import { TimelineView } from '@/components/werewolf/timeline-view'
import { WinBanner } from '@/components/werewolf/win-banner'

function initialState(): GameState {
  return {
    setupPlayers: [],
    roles: cloneBuiltInRoles(),
    setupRoleCounts: {},
    events: [],
    currentNight: 1,
    currentDay: 1,
    currentPhase: 'setup',
  }
}

type SetupStep = 'players' | 'roles' | 'assign'

export default function WerewolfGmPage() {
  const [state, setState] = useState<GameState>(initialState)
  const [setupStep, setSetupStep] = useState<SetupStep>('players')
  const [showTimeline, setShowTimeline] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const saved = loadGameState()
    if (saved) setState(saved)
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) saveGameState(state)
  }, [state, loaded])

  const players = useMemo(
    () => derivePlayers(state.setupPlayers, state.roles, state.events),
    [state.setupPlayers, state.roles, state.events]
  )

  const resolvedTriggerIds = useMemo(
    () =>
      new Set(
        state.events
          .filter((e): e is Extract<GameEvent, { type: 'death_trigger_resolved' }> => e.type === 'death_trigger_resolved')
          .map((e) => e.payload.playerId)
      ),
    [state.events]
  )
  const pendingTrigger = useMemo(
    () => findDeathTrigger(players, state.roles, resolvedTriggerIds),
    [players, state.roles, resolvedTriggerIds]
  )

  function pushEvent(event: GameEvent) {
    setState((s) => ({ ...s, events: [...s.events, event] }))
  }

  function afterResolution(nextEvents: GameEvent[], night: number, day: number, advance: 'to-day' | 'to-next-night') {
    const nextPlayers = derivePlayers(state.setupPlayers, state.roles, nextEvents)
    const winner = checkWinCondition(nextPlayers, state.roles)
    if (winner) {
      setState((s) => ({ ...s, events: nextEvents, currentPhase: 'ended' }))
      return
    }
    if (advance === 'to-day') {
      setState((s) => ({ ...s, events: nextEvents, currentPhase: 'day', currentDay: night }))
    } else {
      setState((s) => ({ ...s, events: nextEvents, currentPhase: 'night', currentNight: day + 1, currentDay: day + 1 }))
    }
  }

  function handleCommitNightAction(roleId: string, actorPlayerId: string, targetPlayerIds: string[]) {
    pushEvent({
      id: crypto.randomUUID(),
      type: 'night_action',
      payload: { id: crypto.randomUUID(), night: state.currentNight, roleId, actorPlayerId, targetPlayerIds, createdAt: Date.now() },
    })
  }

  function handleEndNight() {
    const actions = getActiveNightActions(state.events, state.currentNight)
    const resolution = resolveNight(state.roles, players, actions, state.currentNight)
    const nextEvents: GameEvent[] = [...state.events, { id: crypto.randomUUID(), type: 'night_resolved', payload: resolution }]
    afterResolution(nextEvents, state.currentNight, state.currentDay, 'to-day')
  }

  function handleVote(voterPlayerId: string, targetPlayerId: string) {
    pushEvent({
      id: crypto.randomUUID(),
      type: 'day_vote',
      payload: { id: crypto.randomUUID(), day: state.currentDay, voterPlayerId, targetPlayerId, createdAt: Date.now() },
    })
  }

  function handleResolveDay() {
    const votes = getActiveDayVotes(state.events, state.currentDay)
    const resolution = resolveDay(votes, players, state.currentDay)
    const nextEvents: GameEvent[] = [...state.events, { id: crypto.randomUUID(), type: 'day_resolved', payload: resolution }]
    afterResolution(nextEvents, state.currentNight, state.currentDay, 'to-next-night')
  }

  function handleDeathTriggerCommit(targetPlayerIds: string[]) {
    if (!pendingTrigger) return
    const nextEvents: GameEvent[] = [
      ...state.events,
      {
        id: crypto.randomUUID(),
        type: 'death_trigger_resolved',
        payload: { playerId: pendingTrigger.playerId, targetPlayerIds, roleId: pendingTrigger.roleId },
      },
    ]
    // Không tự chuyển phase — chỉ ghi nhận rồi ở nguyên đêm/ngày hiện tại để MC tiếp tục;
    // chỉ kết thúc ván sớm nếu phát bắn này vừa phân định thắng thua.
    const nextPlayers = derivePlayers(state.setupPlayers, state.roles, nextEvents)
    const winner = checkWinCondition(nextPlayers, state.roles)
    setState((s) => ({ ...s, events: nextEvents, currentPhase: winner ? 'ended' : s.currentPhase }))
  }

  function handleUndo() {
    const { events: nextEvents, popped } = popLastEvent(state.events)
    if (!popped) return
    const transition = phaseAfterUndo(popped)
    setState((s) => ({
      ...s,
      events: nextEvents,
      currentPhase: transition?.phase ?? s.currentPhase,
      currentNight: transition?.night ?? s.currentNight,
      currentDay: transition?.day ?? s.currentDay,
    }))
  }

  function handleUndoTo(index: number) {
    const nextEvents = state.events.slice(0, index)
    const transition = phaseAfterTruncate(nextEvents)
    const nextPlayers = derivePlayers(state.setupPlayers, state.roles, nextEvents)
    const winner = checkWinCondition(nextPlayers, state.roles)
    setState((s) => ({
      ...s,
      events: nextEvents,
      currentPhase: winner ? 'ended' : transition.phase,
      currentNight: transition.night,
      currentDay: transition.day,
    }))
  }

  function handleNewGame() {
    clearGameState()
    setState(initialState())
    setSetupStep('players')
    setShowTimeline(false)
  }

  function addCustomRole(role: RoleDef) {
    setState((s) => ({ ...s, roles: [...s.roles, role] }))
  }

  const totalAssigned = Object.values(state.setupRoleCounts).reduce((sum, n) => sum + n, 0)
  const everyoneHasRole = state.setupPlayers.every((p) => p.roleIds.length > 0)
  const canStart = state.setupPlayers.length >= 4 && totalAssigned === state.setupPlayers.length && everyoneHasRole

  return (
    <ToolShell name="Werewolf GM" icon="🐺" description="Quản trò Ma Sói — chia vai, điều hành đêm, undo, lịch sử ván">
      <div className="space-y-4">
        {state.currentPhase !== 'setup' && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowTimeline((v) => !v)}
              className="text-xs text-muted underline"
            >
              {showTimeline ? 'Đóng lịch sử' : '📜 Xem lịch sử'}
            </button>
            {state.events.length > 0 && (
              <button
                type="button"
                onClick={handleUndo}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-fg"
              >
                ↩ Hoàn tác
              </button>
            )}
          </div>
        )}

        {showTimeline && state.currentPhase !== 'setup' && (
          <TimelineView events={state.events} players={players} roles={state.roles} onUndoTo={handleUndoTo} />
        )}

        {!showTimeline && state.currentPhase === 'setup' && (
          <div className="space-y-4">
            <div className="flex gap-1.5 font-mono text-xs text-muted">
              <span className={setupStep === 'players' ? 'text-accent-soft' : ''}>1. Người chơi</span>
              <span>→</span>
              <span className={setupStep === 'roles' ? 'text-accent-soft' : ''}>2. Vai trò</span>
              <span>→</span>
              <span className={setupStep === 'assign' ? 'text-accent-soft' : ''}>3. Gán vai</span>
            </div>

            {setupStep === 'players' && (
              <>
                <SetupPlayers
                  players={state.setupPlayers}
                  onChange={(setupPlayers) => setState((s) => ({ ...s, setupPlayers }))}
                />
                <button
                  type="button"
                  disabled={state.setupPlayers.length < 4}
                  onClick={() => setSetupStep('roles')}
                  className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fg disabled:opacity-40"
                >
                  Tiếp: chọn vai trò
                </button>
              </>
            )}

            {setupStep === 'roles' && (
              <>
                <SetupRoles
                  allRoles={state.roles}
                  counts={state.setupRoleCounts}
                  onCountsChange={(setupRoleCounts) => setState((s) => ({ ...s, setupRoleCounts }))}
                  onAddCustomRole={addCustomRole}
                  totalPlayers={state.setupPlayers.length}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSetupStep('players')}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-muted"
                  >
                    Quay lại
                  </button>
                  <button
                    type="button"
                    disabled={totalAssigned !== state.setupPlayers.length}
                    onClick={() => setSetupStep('assign')}
                    className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fg disabled:opacity-40"
                  >
                    Tiếp: gán vai
                  </button>
                </div>
              </>
            )}

            {setupStep === 'assign' && (
              <>
                <SetupAssign
                  players={state.setupPlayers}
                  allRoles={state.roles}
                  counts={state.setupRoleCounts}
                  onChange={(setupPlayers) => setState((s) => ({ ...s, setupPlayers }))}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSetupStep('roles')}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-muted"
                  >
                    Quay lại
                  </button>
                  <button
                    type="button"
                    disabled={!canStart}
                    onClick={() => setState((s) => ({ ...s, currentPhase: 'night', currentNight: 1, currentDay: 1 }))}
                    className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fg disabled:opacity-40"
                  >
                    🌙 Bắt đầu ván
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {!showTimeline && state.currentPhase === 'ended' && (
          <WinBanner winner={checkWinCondition(players, state.roles) ?? 'village'} onNewGame={handleNewGame} />
        )}

        {!showTimeline && state.currentPhase !== 'setup' && state.currentPhase !== 'ended' && pendingTrigger && (
          <DeathTriggerPanel
            role={state.roles.find((r) => r.id === pendingTrigger.roleId)!}
            actorPlayerId={pendingTrigger.playerId}
            players={players}
            onCommit={handleDeathTriggerCommit}
          />
        )}

        {!showTimeline && state.currentPhase === 'night' && !pendingTrigger && (
          <NightPanel
            roles={state.roles}
            players={players}
            night={state.currentNight}
            events={state.events}
            onCommitAction={handleCommitNightAction}
            onEndNight={handleEndNight}
          />
        )}

        {!showTimeline && state.currentPhase === 'day' && !pendingTrigger && (
          <DayPanel
            players={players}
            day={state.currentDay}
            events={state.events}
            onVote={handleVote}
            onResolveDay={handleResolveDay}
          />
        )}
      </div>
    </ToolShell>
  )
}
