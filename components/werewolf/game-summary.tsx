'use client'
import { useState } from 'react'
import type { GameEvent, PlayerSetup, RoleDef } from '@/lib/werewolf/types'
import { derivePlayers } from '@/lib/werewolf/derive-game-state'
import { getActiveNightActions } from '@/lib/werewolf/selectors'
import { NightRecap } from './night-recap'

interface GameSummaryProps {
  events: GameEvent[]
  setupPlayers: PlayerSetup[]
  roles: RoleDef[]
}

/** Xem lại từng đêm sau khi ván kết thúc — dùng lại đúng vòng tròn NightRecap
 * của lúc review, nhưng snapshot trạng thái người chơi tại đúng thời điểm đó
 * (không phải trạng thái cuối ván) để không hiện sai người sống/chết. */
export function GameSummary({ events, setupPlayers, roles }: GameSummaryProps) {
  const [expanded, setExpanded] = useState(false)

  const nightResolutions = events
    .map((event, index) => ({ event, index }))
    .filter((x): x is { event: Extract<GameEvent, { type: 'night_resolved' }>; index: number } => x.event.type === 'night_resolved')

  if (nightResolutions.length === 0) return null

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-fg transition-colors hover:border-accent/40"
      >
        {expanded ? '✕ Đóng tóm tắt các đêm' : `📖 Xem lại ${nightResolutions.length} đêm đã qua`}
      </button>

      {expanded && (
        <div className="space-y-6">
          {nightResolutions.map(({ event, index }) => {
            const snapshotPlayers = derivePlayers(setupPlayers, roles, events.slice(0, index + 1))
            return (
              <NightRecap
                key={event.id}
                players={snapshotPlayers}
                roles={roles}
                night={event.payload.night}
                actions={getActiveNightActions(events, event.payload.night)}
                deaths={event.payload.deaths}
                healed={event.payload.healed}
                onToggleAlive={() => {}}
                onConfirm={() => {}}
                readOnly
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
