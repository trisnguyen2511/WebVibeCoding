'use client'
import type { GameEvent, Player, RoleDef } from '@/lib/werewolf/types'
import { describeEvent } from '@/lib/werewolf/describe-event'

interface TimelineViewProps {
  events: GameEvent[]
  players: Player[]
  roles: RoleDef[]
  onUndoTo: (index: number) => void
}

export function TimelineView({ events, players, roles, onUndoTo }: TimelineViewProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted">Chưa có lịch sử nào.</p>
  }

  return (
    <ul className="space-y-1.5">
      {events.map((event, i) => (
        <li
          key={event.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs"
        >
          <span className="font-mono text-muted">{describeEvent(event, players, roles)}</span>
          <button
            type="button"
            onClick={() => onUndoTo(i)}
            className="shrink-0 text-muted underline hover:text-fg"
            title="Xoá mọi thao tác từ đây trở về sau"
          >
            Undo tới đây
          </button>
        </li>
      ))}
    </ul>
  )
}
