'use client'
import { useState } from 'react'
import type { PlayerSetup } from '@/lib/werewolf/types'

interface SetupPlayersProps {
  players: PlayerSetup[]
  onChange: (players: PlayerSetup[]) => void
}

export function SetupPlayers({ players, onChange }: SetupPlayersProps) {
  const [name, setName] = useState('')

  function addPlayer() {
    const trimmed = name.trim()
    if (!trimmed) return
    onChange([...players, { id: crypto.randomUUID(), name: trimmed, roleIds: [] }])
    setName('')
  }

  function removePlayer(id: string) {
    onChange(players.filter((p) => p.id !== id))
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addPlayer()
          }}
          placeholder="Tên người chơi..."
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={addPlayer}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-accent/90"
        >
          Thêm
        </button>
      </div>

      <ul className="space-y-1.5">
        {players.map((player, i) => (
          <li
            key={player.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <span className="text-fg">
              <span className="mr-2 font-mono text-xs text-muted">{i + 1}</span>
              {player.name}
            </span>
            <button
              type="button"
              onClick={() => removePlayer(player.id)}
              aria-label={`Xóa ${player.name}`}
              className="text-muted transition-colors hover:text-fg"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {players.length === 0 && <p className="text-sm text-muted">Chưa có người chơi nào.</p>}
      {players.length > 0 && players.length < 4 && (
        <p className="text-xs text-amber-400">Cần tối thiểu 4 người chơi để bắt đầu ván.</p>
      )}
    </div>
  )
}
