'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { cloneBuiltInRoles, syncBuiltInRoles } from '@/lib/werewolf/built-in-roles'
import { derivePlayers } from '@/lib/werewolf/derive-game-state'
import { checkWinCondition, checkLoversWin } from '@/lib/werewolf/check-win-condition'
import { phaseAfterTruncate, phaseAfterUndo, popLastEvent } from '@/lib/werewolf/game-actions'
import { findDeathTrigger } from '@/lib/werewolf/night-queue'
import { resolveDay } from '@/lib/werewolf/resolve-day'
import { resolveNight } from '@/lib/werewolf/resolve-night'
import { getActiveNightActions } from '@/lib/werewolf/selectors'
import { totalRoleSlots } from '@/lib/werewolf/role-bundles'
import { clearGameState, loadGameState, saveGameState } from '@/lib/werewolf/storage'
import type { GameEvent, GameState, RoleDef } from '@/lib/werewolf/types'
import { getGmDeviceId, loadGmOnlineSession, saveGmOnlineSession, clearGmOnlineSession } from '@/lib/werewolf/online-storage'
import type { OnlineRoomRef } from '@/components/werewolf/online-lobby-gm'

import { SetupPlayers } from '@/components/werewolf/setup-players'
import { OnlineLobbyGM } from '@/components/werewolf/online-lobby-gm'
import { SetupRoles } from '@/components/werewolf/setup-roles'
import { SetupAssign } from '@/components/werewolf/setup-assign'
import { SetupOrder } from '@/components/werewolf/setup-order'
import { NightPanel } from '@/components/werewolf/night-panel'
import { NightLiveAssign } from '@/components/werewolf/night-live-assign'
import { NightRecap } from '@/components/werewolf/night-recap'
import { DayPanel } from '@/components/werewolf/day-panel'
import { DeathTriggerPanel } from '@/components/werewolf/death-trigger-panel'
import { TimelineView } from '@/components/werewolf/timeline-view'
import { RosterView } from '@/components/werewolf/roster-view'
import { WinBanner } from '@/components/werewolf/win-banner'
import { GameSummary } from '@/components/werewolf/game-summary'

function initialState(): GameState {
  return {
    setupPlayers: [],
    roles: cloneBuiltInRoles(),
    setupRoleCounts: {},
    assignMode: 'preset',
    events: [],
    currentNight: 1,
    currentDay: 1,
    currentPhase: 'setup',
  }
}

type SetupStep = 'players' | 'order' | 'roles' | 'assign'

export default function WerewolfGmPage() {
  const [state, setState] = useState<GameState>(initialState)
  const [setupStep, setSetupStep] = useState<SetupStep>('players')
  const [showTimeline, setShowTimeline] = useState(false)
  const [showRoster, setShowRoster] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'offline' | 'online'>('offline')
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomRef | null>(null)
  const [onlineRealtimeEnabled, setOnlineRealtimeEnabled] = useState(true)
  const roomEndedNotifiedRef = useRef(false)
  // Ngăn xếp redo — event cuối mảng là cái sắp được redo tiếp theo. Bị xoá
  // sạch bất cứ khi nào có 1 event MỚI được ghi (không phải do undo/redo),
  // vì lúc đó "tương lai" đã undo không còn hợp lệ nữa.
  const [redoStack, setRedoStack] = useState<GameEvent[]>([])

  useEffect(() => {
    try {
      const saved = loadGameState()
      if (saved) {
        const roles = syncBuiltInRoles(saved.roles)
        // Replay thử ngay tại đây để phát hiện ván cũ không còn tương thích
        // với schema hiện tại (VD event thiếu field mới) trước khi nó lọt vào
        // useMemo của render và làm crash cả trang.
        derivePlayers(saved.setupPlayers, roles, saved.events)
        setState({ ...saved, roles })
      }
    } catch {
      clearGameState()
    }
    setLoaded(true)

    const onlineSession = loadGmOnlineSession()
    if (onlineSession) {
      setMode('online')
      setOnlineRoom(onlineSession)
    }
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
    setRedoStack([])
    setState((s) => ({ ...s, events: [...s.events, event] }))
  }

  function handleCommitNightAction(roleId: string, actorPlayerId: string, targetPlayerIds: string[], skipped: boolean) {
    pushEvent({
      id: crypto.randomUUID(),
      type: 'night_action',
      payload: { id: crypto.randomUUID(), night: state.currentNight, roleId, actorPlayerId, targetPlayerIds, skipped, createdAt: Date.now() },
    })
  }

  /** Gán tay 1 vai (hoặc cả bó, VD 2 bình Phù thủy) cho 1 người ngay lúc MC gọi chức năng đó trong đêm 1. */
  function handleAssignRole(playerId: string, roleIds: string[]) {
    setState((s) => ({
      ...s,
      setupPlayers: s.setupPlayers.map((p) => (p.id === playerId ? { ...p, roleIds: [...p.roleIds, ...roleIds] } : p)),
    }))
    if (mode === 'online' && onlineRoom) {
      fetch('/api/werewolf/room/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: onlineRoom.roomId, gmDeviceId: getGmDeviceId(), playerId, roleIds }),
      }).catch(() => {
        // best-effort — MC still announces the role out loud regardless
      })
    }
  }

  function handleEndNight() {
    const actions = getActiveNightActions(state.events, state.currentNight)
    const resolution = resolveNight(state.roles, players, actions, state.currentNight)
    pushEvent({ id: crypto.randomUUID(), type: 'night_resolved', payload: resolution })
    setState((s) => ({ ...s, currentPhase: 'recap' }))
  }

  function handleManualOverride(playerId: string, isAlive: boolean) {
    pushEvent({ id: crypto.randomUUID(), type: 'manual_override', payload: { playerId, isAlive } })
  }

  function handleConfirmRecap() {
    const ended = !!checkWinCondition(players, state.roles) || !!checkLoversWin(players)
    setState((s) => ({ ...s, currentPhase: ended ? 'ended' : 'day', currentDay: s.currentNight }))
  }

  function handleEliminate(playerId: string) {
    const resolution = resolveDay(playerId, players, state.roles, state.currentDay)
    const nextEvents: GameEvent[] = [...state.events, { id: crypto.randomUUID(), type: 'day_resolved', payload: resolution }]
    const nextPlayers = derivePlayers(state.setupPlayers, state.roles, nextEvents)
    const ended = !!resolution.foolWinnerId || !!checkWinCondition(nextPlayers, state.roles) || !!checkLoversWin(nextPlayers)
    setRedoStack([])
    setState((s) => ({
      ...s,
      events: nextEvents,
      currentPhase: ended ? 'ended' : 'night',
      currentNight: ended ? s.currentNight : s.currentDay + 1,
      currentDay: ended ? s.currentDay : s.currentDay + 1,
    }))
  }

  function handleSkipDay() {
    const resolution = resolveDay(null, players, state.roles, state.currentDay)
    pushEvent({ id: crypto.randomUUID(), type: 'day_resolved', payload: resolution })
    setState((s) => ({ ...s, currentPhase: 'night', currentNight: s.currentDay + 1, currentDay: s.currentDay + 1 }))
  }

  const lastNightResolution = [...state.events].reverse().find(
    (e): e is Extract<GameEvent, { type: 'night_resolved' }> => e.type === 'night_resolved' && e.payload.night === state.currentNight
  )
  const foolWinEvent = [...state.events].reverse().find(
    (e): e is Extract<GameEvent, { type: 'day_resolved' }> => e.type === 'day_resolved' && !!e.payload.foolWinnerId
  )

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
    const ended = !!checkWinCondition(nextPlayers, state.roles) || !!checkLoversWin(nextPlayers)
    setRedoStack([])
    setState((s) => ({ ...s, events: nextEvents, currentPhase: ended ? 'ended' : s.currentPhase }))
  }

  function handleUndo() {
    const { events: nextEvents, popped } = popLastEvent(state.events)
    if (!popped) return
    const transition = phaseAfterUndo(popped)
    setRedoStack((r) => [...r, popped])
    setState((s) => ({
      ...s,
      events: nextEvents,
      currentPhase: transition?.phase ?? s.currentPhase,
      currentNight: transition?.night ?? s.currentNight,
      currentDay: transition?.day ?? s.currentDay,
    }))
  }

  /** Redo lại đúng 1 event vừa undo — suy ra phase tương ứng theo loại event,
   * giống hệt logic của các hàm push tương ứng lúc event đó lần đầu xảy ra. */
  function handleRedo() {
    if (redoStack.length === 0) return
    const event = redoStack[redoStack.length - 1]
    const nextEvents = [...state.events, event]
    const nextPlayers = derivePlayers(state.setupPlayers, state.roles, nextEvents)

    let nextPhase = state.currentPhase
    let nextNight = state.currentNight
    let nextDay = state.currentDay

    if (event.type === 'night_resolved') {
      nextPhase = 'recap'
    } else if (event.type === 'day_resolved') {
      const ended = !!event.payload.foolWinnerId || !!checkWinCondition(nextPlayers, state.roles) || !!checkLoversWin(nextPlayers)
      nextPhase = ended ? 'ended' : 'night'
      nextNight = ended ? state.currentNight : state.currentDay + 1
      nextDay = ended ? state.currentDay : state.currentDay + 1
    } else if (event.type === 'death_trigger_resolved') {
      const ended = !!checkWinCondition(nextPlayers, state.roles) || !!checkLoversWin(nextPlayers)
      if (ended) nextPhase = 'ended'
    }
    // 'manual_override' và 'night_action' không đổi phase/đêm/ngày.

    setRedoStack((r) => r.slice(0, -1))
    setState((s) => ({ ...s, events: nextEvents, currentPhase: nextPhase, currentNight: nextNight, currentDay: nextDay }))
  }

  function handleUndoTo(index: number) {
    const removed = state.events.slice(index)
    const nextEvents = state.events.slice(0, index)
    const transition = phaseAfterTruncate(nextEvents)
    const nextPlayers = derivePlayers(state.setupPlayers, state.roles, nextEvents)
    const ended = !!checkWinCondition(nextPlayers, state.roles) || !!checkLoversWin(nextPlayers)
    setRedoStack([...removed].reverse())
    setState((s) => ({
      ...s,
      events: nextEvents,
      currentPhase: ended ? 'ended' : transition.phase,
      currentNight: transition.night,
      currentDay: transition.day,
    }))
  }

  /**
   * Chơi ván mới nhưng giữ nguyên danh sách người chơi, số lượng vai đã chọn
   * và chế độ gán vai (chỉ cần assign lại người cho vai) — MC không phải
   * nhập/chọn lại từ đầu, chỉ cần đi qua bước "Gán vai" một lần nữa.
   */
  function handlePlayAgain() {
    // Natural game-overs already reopened the online room the instant they
    // ended (see the currentPhase 'ended' effect below) — this only needs to
    // reopen it itself for the "abandon mid-game and restart" path.
    if (mode === 'online' && onlineRoom && state.currentPhase !== 'ended') {
      fetch('/api/werewolf/room/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: onlineRoom.roomId, gmDeviceId: getGmDeviceId() }),
      }).catch(() => {})
    }
    setRedoStack([])
    setState((s) => ({
      ...s,
      setupPlayers: s.setupPlayers.map((p) => ({ ...p, roleIds: [] })),
      events: [],
      currentNight: 1,
      currentDay: 1,
      currentPhase: 'setup',
    }))
    setSetupStep('players')
    setShowTimeline(false)
  }

  /** Nút "Chơi lại" giữa ván đang chơi — hỏi xác nhận vì sẽ hủy toàn bộ tiến trình đêm/ngày hiện tại. */
  function handleRestartGame() {
    if (!window.confirm('Hủy ván đang chơi và quay lại màn hình thêm người chơi? (vẫn giữ danh sách tên hiện tại)')) return
    handlePlayAgain()
  }

  function handleResetEverything() {
    if (onlineRoom) {
      fetch('/api/werewolf/room/dissolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: onlineRoom.roomId, gmDeviceId: getGmDeviceId() }),
      }).catch(() => {})
      clearGmOnlineSession()
      setOnlineRoom(null)
      setMode('offline')
    }
    clearGameState()
    setState(initialState())
    setRedoStack([])
    setSetupStep('players')
    setShowTimeline(false)
  }

  function addCustomRole(role: RoleDef) {
    setState((s) => ({ ...s, roles: [...s.roles, role] }))
  }

  function updateCustomRole(role: RoleDef) {
    setState((s) => ({ ...s, roles: s.roles.map((r) => (r.id === role.id ? role : r)) }))
  }

  /** Xoá vai trò tùy chỉnh — bỏ luôn số lượng đã chọn cho vai này ở bước chọn vai. */
  function removeCustomRole(roleId: string) {
    setState((s) => {
      const { [roleId]: _removed, ...restCounts } = s.setupRoleCounts
      return { ...s, roles: s.roles.filter((r) => r.id !== roleId), setupRoleCounts: restCounts }
    })
  }

  const totalAssigned = totalRoleSlots(state.setupRoleCounts, state.roles)
  const rolesFullyChosen = totalAssigned === state.setupPlayers.length
  const everyoneHasRole = state.setupPlayers.every((p) => p.roleIds.length > 0)
  const canStart =
    state.setupPlayers.length >= 4 && rolesFullyChosen && (state.assignMode === 'live' || everyoneHasRole)

  async function handleStartGame() {
    if (mode === 'online' && onlineRoom) {
      try {
        const res = await fetch('/api/werewolf/room/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: onlineRoom.roomId,
            gmDeviceId: getGmDeviceId(),
            roles: state.roles,
            roleCounts: state.setupRoleCounts,
            assignMode: state.assignMode,
            players: state.setupPlayers.map((p, i) => ({ id: p.id, seat: i, roleIds: p.roleIds })),
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          window.alert(data.error ?? 'Không thể bắt đầu ván online — vui lòng thử lại.')
          return
        }
        setOnlineRealtimeEnabled(true)
      } catch {
        window.alert('Lỗi kết nối — không thể bắt đầu ván online.')
        return
      }
    }
    // Chế độ 'live' cố tình KHÔNG random trước — vai được MC gán tay ngay lúc
    // gọi từng chức năng trong đêm 1 (xem NightLiveAssign).
    setState((s) => ({ ...s, currentPhase: 'night', currentNight: 1, currentDay: 1 }))
  }

  // Reopen the online room the instant a round ends (win condition confirmed
  // by the MC) — players can then hit "Chơi lại" on their phones right away,
  // independently of whether the MC has clicked "Chơi lại" locally yet.
  useEffect(() => {
    if (state.currentPhase === 'ended') {
      if (mode === 'online' && onlineRoom && !roomEndedNotifiedRef.current) {
        roomEndedNotifiedRef.current = true
        fetch('/api/werewolf/room/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: onlineRoom.roomId, gmDeviceId: getGmDeviceId() }),
        }).catch(() => {})
      }
    } else {
      roomEndedNotifiedRef.current = false
    }
  }, [state.currentPhase, mode, onlineRoom])

  async function handleToggleRealtime() {
    if (!onlineRoom) return
    const next = !onlineRealtimeEnabled
    setOnlineRealtimeEnabled(next)
    try {
      await fetch('/api/werewolf/room/toggle-realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: onlineRoom.roomId, gmDeviceId: getGmDeviceId(), enabled: next }),
      })
    } catch {
      // best-effort — worst case players just keep seeing the old banner
    }
  }

  function handleModeChange(next: 'offline' | 'online') {
    if (next === mode) return
    if (state.setupPlayers.length > 0 && !window.confirm('Chuyển chế độ sẽ xoá danh sách người chơi hiện tại. Tiếp tục?')) return
    setState((s) => ({ ...s, setupPlayers: [] }))
    setMode(next)
  }

  const SETUP_STEPS: { key: SetupStep; label: string }[] = [
    { key: 'players', label: 'Người chơi' },
    { key: 'order', label: 'Sắp xếp' },
    { key: 'roles', label: 'Vai trò' },
    { key: 'assign', label: 'Gán vai' },
  ]
  const stepIndex = SETUP_STEPS.findIndex((s) => s.key === setupStep)

  return (
    <ToolShell name="Werewolf GM" icon="🐺" description="Quản trò Ma Sói — chia vai, điều hành đêm, undo, lịch sử ván">
      <div className="space-y-4">
        {mode === 'online' && onlineRoom && state.currentPhase !== 'setup' && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
            <span>
              📡 Online · Mã phòng <span className="font-mono text-fg">{onlineRoom.code}</span>
            </span>
            {state.currentPhase !== 'ended' && (
              <button type="button" onClick={handleToggleRealtime} className="underline underline-offset-2 hover:text-fg">
                {onlineRealtimeEnabled ? 'Tắt đồng bộ trực tuyến' : 'Bật lại đồng bộ trực tuyến'}
              </button>
            )}
          </div>
        )}

        {state.currentPhase !== 'setup' && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowTimeline((v) => !v)
                  setShowRoster(false)
                }}
                className="rounded-lg px-1 py-1.5 text-xs text-muted underline underline-offset-2 transition-colors hover:text-fg"
              >
                {showTimeline ? '✕ Đóng lịch sử' : '📜 Lịch sử'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRoster((v) => !v)
                  setShowTimeline(false)
                }}
                className="rounded-lg px-1 py-1.5 text-xs text-muted underline underline-offset-2 transition-colors hover:text-fg"
              >
                {showRoster ? '✕ Đóng vai trò' : '👥 Vai trò'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              {state.currentPhase !== 'ended' && (
                <button
                  type="button"
                  onClick={handleRestartGame}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/10"
                >
                  🔄 Chơi lại
                </button>
              )}
              {state.events.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-fg"
                >
                  ↩ Hoàn tác
                </button>
              )}
              {redoStack.length > 0 && (
                <button
                  type="button"
                  onClick={handleRedo}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-fg"
                >
                  ↪ Làm lại
                </button>
              )}
            </div>
          </div>
        )}

        {showTimeline && state.currentPhase !== 'setup' && (
          <TimelineView events={state.events} players={players} roles={state.roles} onUndoTo={handleUndoTo} />
        )}

        {showRoster && !showTimeline && state.currentPhase !== 'setup' && (
          <RosterView players={players} roles={state.roles} />
        )}

        {!showTimeline && state.currentPhase === 'setup' && (
          <div className="space-y-4">
            <div className="flex items-center gap-1.5">
              {SETUP_STEPS.map((step, i) => (
                <div key={step.key} className="flex flex-1 items-center gap-1.5">
                  <div className="flex flex-1 flex-col items-center gap-1">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] transition-colors ${
                        i <= stepIndex ? 'bg-accent text-fg' : 'border border-border text-muted'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className={`text-[10px] ${i === stepIndex ? 'text-accent-soft' : 'text-muted'}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < SETUP_STEPS.length - 1 && (
                    <div className={`mb-4 h-px flex-1 ${i < stepIndex ? 'bg-accent' : 'bg-border'}`} />
                  )}
                </div>
              ))}
            </div>

            {setupStep === 'players' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleModeChange('offline')}
                    className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      mode === 'offline' ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:border-accent/40'
                    }`}
                  >
                    💻 Offline
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('online')}
                    className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      mode === 'online' ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:border-accent/40'
                    }`}
                  >
                    📡 Online — phát thẻ qua điện thoại
                  </button>
                </div>

                {mode === 'offline' ? (
                  <>
                    <SetupPlayers
                      players={state.setupPlayers}
                      onChange={(setupPlayers) => setState((s) => ({ ...s, setupPlayers }))}
                    />
                    <button
                      type="button"
                      disabled={state.setupPlayers.length < 4}
                      onClick={() => setSetupStep('order')}
                      className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg transition-transform active:scale-[0.98] disabled:opacity-40"
                    >
                      Tiếp: sắp xếp vị trí
                    </button>
                  </>
                ) : (
                  <OnlineLobbyGM
                    room={onlineRoom}
                    onRoomCreated={(room) => {
                      setOnlineRoom(room)
                      saveGmOnlineSession(room)
                    }}
                    players={state.setupPlayers}
                    onPlayersChange={(setupPlayers) => setState((s) => ({ ...s, setupPlayers }))}
                    onLocked={() => setSetupStep('order')}
                    onDissolved={() => {
                      clearGmOnlineSession()
                      setOnlineRoom(null)
                      setState((s) => ({ ...s, setupPlayers: [] }))
                    }}
                  />
                )}
              </>
            )}

            {setupStep === 'order' && (
              <>
                <SetupOrder
                  players={state.setupPlayers}
                  onChange={(setupPlayers) => setState((s) => ({ ...s, setupPlayers }))}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSetupStep('players')}
                    className="rounded-xl border border-border px-4 py-3 text-sm text-muted transition-colors hover:text-fg"
                  >
                    Quay lại
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetupStep('roles')}
                    className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg transition-transform active:scale-[0.98]"
                  >
                    Tiếp: chọn vai trò
                  </button>
                </div>
              </>
            )}

            {setupStep === 'roles' && (
              <>
                <SetupRoles
                  allRoles={state.roles}
                  counts={state.setupRoleCounts}
                  onCountsChange={(setupRoleCounts) => setState((s) => ({ ...s, setupRoleCounts }))}
                  onAddCustomRole={addCustomRole}
                  onUpdateCustomRole={updateCustomRole}
                  onDeleteCustomRole={removeCustomRole}
                  totalPlayers={state.setupPlayers.length}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSetupStep('order')}
                    className="rounded-xl border border-border px-4 py-3 text-sm text-muted transition-colors hover:text-fg"
                  >
                    Quay lại
                  </button>
                  <button
                    type="button"
                    disabled={!rolesFullyChosen}
                    onClick={() => setSetupStep('assign')}
                    className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg transition-transform active:scale-[0.98] disabled:opacity-40"
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
                  assignMode={state.assignMode}
                  onAssignModeChange={(assignMode) => setState((s) => ({ ...s, assignMode }))}
                  onChange={(setupPlayers) => setState((s) => ({ ...s, setupPlayers }))}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSetupStep('roles')}
                    className="rounded-xl border border-border px-4 py-3 text-sm text-muted transition-colors hover:text-fg"
                  >
                    Quay lại
                  </button>
                  <button
                    type="button"
                    disabled={!canStart}
                    onClick={handleStartGame}
                    className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
                  >
                    🌙 Bắt đầu ván
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {!showTimeline && !showRoster && state.currentPhase === 'ended' && (
          <>
            <WinBanner
              winner={checkWinCondition(players, state.roles) ?? 'village'}
              soloWinnerName={foolWinEvent ? players.find((p) => p.id === foolWinEvent.payload.foolWinnerId)?.name : undefined}
              loverNames={(() => {
                const lovers = checkLoversWin(players)
                if (!lovers) return undefined
                const [a, b] = lovers
                const nameA = players.find((p) => p.id === a)?.name
                const nameB = players.find((p) => p.id === b)?.name
                return nameA && nameB ? ([nameA, nameB] as [string, string]) : undefined
              })()}
              onPlayAgain={handlePlayAgain}
              onResetAll={handleResetEverything}
            />
            <GameSummary events={state.events} setupPlayers={state.setupPlayers} roles={state.roles} />
          </>
        )}

        {!showTimeline && !showRoster && state.currentPhase === 'recap' && lastNightResolution && (
          <NightRecap
            players={players}
            roles={state.roles}
            night={state.currentNight}
            actions={getActiveNightActions(state.events, state.currentNight)}
            deaths={lastNightResolution.payload.deaths}
            healed={lastNightResolution.payload.healed}
            onToggleAlive={handleManualOverride}
            onConfirm={handleConfirmRecap}
          />
        )}

        {!showTimeline &&
          !showRoster &&
          state.currentPhase !== 'setup' &&
          state.currentPhase !== 'ended' &&
          state.currentPhase !== 'recap' &&
          pendingTrigger && (
            <DeathTriggerPanel
              role={state.roles.find((r) => r.id === pendingTrigger.roleId)!}
              roles={state.roles}
              actorPlayerId={pendingTrigger.playerId}
              players={players}
              onCommit={handleDeathTriggerCommit}
            />
          )}

        {!showTimeline &&
          !showRoster &&
          state.currentPhase === 'night' &&
          !pendingTrigger &&
          (state.currentNight === 1 && state.assignMode === 'live' ? (
            <NightLiveAssign
              roles={state.roles}
              players={players}
              setupRoleCounts={state.setupRoleCounts}
              night={state.currentNight}
              events={state.events}
              onCommitAction={handleCommitNightAction}
              onAssignRole={handleAssignRole}
              onEndNight={handleEndNight}
            />
          ) : (
            <NightPanel
              roles={state.roles}
              players={players}
              night={state.currentNight}
              events={state.events}
              onCommitAction={handleCommitNightAction}
              onEndNight={handleEndNight}
            />
          ))}

        {!showTimeline && !showRoster && state.currentPhase === 'day' && !pendingTrigger && (
          <DayPanel players={players} day={state.currentDay} onEliminate={handleEliminate} onSkip={handleSkipDay} />
        )}
      </div>
    </ToolShell>
  )
}
