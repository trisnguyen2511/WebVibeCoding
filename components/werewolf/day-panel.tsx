'use client'
import { useState } from 'react'
import type { Player } from '@/lib/werewolf/types'

interface DayPanelProps {
  players: Player[]
  day: number
  onEliminate: (playerId: string) => void
  onSkip: () => void
}

export function DayPanel({ players, day, onEliminate, onSkip }: DayPanelProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const alive = players.filter((p) => p.isAlive)
  const selectedPlayer = alive.find((p) => p.id === selected)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-accent/40 bg-surface px-4 py-4 text-center">
        <p className="text-2xl">☀️</p>
        <p className="mt-1 font-display text-base font-semibold text-fg">Ngày {day}</p>
        <p className="mt-1 text-xs text-muted">Chọn người bị dân làng bỏ phiếu loại, hoặc bỏ qua để sang đêm tiếp theo.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {alive.map((player) => {
          const isSelected = selected === player.id
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => setSelected(isSelected ? null : player.id)}
              className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                isSelected ? 'border-red-500 bg-red-500/10 text-fg' : 'border-border bg-surface text-fg hover:border-red-500/40'
              }`}
            >
              {player.name}
            </button>
          )
        })}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-xl border border-border px-4 py-3 text-sm text-muted transition-colors hover:border-accent/40 hover:text-fg"
        >
          Bỏ qua, sang đêm
        </button>
        <button
          type="button"
          onClick={() => selectedPlayer && onEliminate(selectedPlayer.id)}
          disabled={!selectedPlayer}
          className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-red-600/20 transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          {selectedPlayer ? `⚖️ Loại ${selectedPlayer.name}` : 'Chọn 1 người để loại'}
        </button>
      </div>
    </div>
  )
}
