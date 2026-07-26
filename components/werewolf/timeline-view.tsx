'use client'
import type { GameEvent, Player, RoleDef } from '@/lib/werewolf/types'
import { describeEvent } from '@/lib/werewolf/describe-event'

interface TimelineViewProps {
  events: GameEvent[]
  players: Player[]
  roles: RoleDef[]
  onUndoTo: (index: number) => void
}

function getEventMeta(event: GameEvent): { icon: string; colorClass: string } {
  switch (event.type) {
    case 'night_action':
      return { icon: '🌙', colorClass: 'text-muted' }
    case 'night_resolved':
      if (event.payload.deaths.length > 0) return { icon: '💀', colorClass: 'text-red-400' }
      if (event.payload.saved.length > 0 || event.payload.healed.length > 0)
        return { icon: '🛡️', colorClass: 'text-emerald-400' }
      return { icon: '🌙', colorClass: 'text-muted' }
    case 'day_resolved':
      return event.payload.eliminatedPlayerId
        ? { icon: '⚖️', colorClass: 'text-orange-400' }
        : { icon: '☀️', colorClass: 'text-muted' }
    case 'death_trigger_resolved':
      return { icon: '💥', colorClass: 'text-red-300' }
    case 'manual_override':
      return { icon: '✏️', colorClass: 'text-yellow-400' }
  }
}

export function TimelineView({ events, players, roles, onUndoTo }: TimelineViewProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted">Chưa có lịch sử nào.</p>
  }

  return (
    <ul className="space-y-1.5">
      {events.map((event, i) => {
        const { icon, colorClass } = getEventMeta(event)
        return (
          <li
            key={event.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs"
          >
            <div className="flex min-w-0 flex-1 items-start gap-1.5">
              <span className="mt-px shrink-0 text-sm leading-none">{icon}</span>
              <span className={`font-mono ${colorClass} min-w-0 break-words`}>
                {describeEvent(event, players, roles)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onUndoTo(i)}
              className="shrink-0 text-muted underline hover:text-fg"
              title="Xoá mọi thao tác từ đây trở về sau"
            >
              Undo tới đây
            </button>
          </li>
        )
      })}
    </ul>
  )
}
