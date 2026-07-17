'use client'
import type { Player } from '@/lib/werewolf/types'

interface ListTargetPickerProps {
  players: Player[]
  actorId: string
  targetCount: 0 | 1 | 2
  selected: string[]
  onChange: (ids: string[]) => void
  canTargetSelf: boolean
}

export function ListTargetPicker({
  players,
  actorId,
  targetCount,
  selected,
  onChange,
  canTargetSelf,
}: ListTargetPickerProps) {
  const eligible = players.filter((p) => p.isAlive && (canTargetSelf || p.id !== actorId))

  function toggle(playerId: string) {
    if (selected.includes(playerId)) {
      onChange(selected.filter((id) => id !== playerId))
    } else if (selected.length < targetCount) {
      onChange([...selected, playerId])
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {eligible.map((player) => {
        const isSelected = selected.includes(player.id)
        return (
          <button
            key={player.id}
            type="button"
            onClick={() => toggle(player.id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              isSelected
                ? 'border-accent bg-accent/10 text-fg'
                : 'border-border bg-surface text-muted hover:border-accent/40'
            } ${!player.isAlive ? 'opacity-50' : ''}`}
          >
            {player.name}
          </button>
        )
      })}
    </div>
  )
}
