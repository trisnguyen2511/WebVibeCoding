'use client'
import { useState } from 'react'
import type { PlayerSetup } from '@/lib/werewolf/types'

interface SetupPlayersProps {
  players: PlayerSetup[]
  onChange: (players: PlayerSetup[]) => void
}

export function SetupPlayers({ players, onChange }: SetupPlayersProps) {
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  function addPlayer() {
    const trimmed = name.trim()
    if (!trimmed) return
    onChange([...players, { id: crypto.randomUUID(), name: trimmed, roleIds: [] }])
    setName('')
  }

  function removePlayer(id: string) {
    onChange(players.filter((p) => p.id !== id))
  }

  function startEdit(player: PlayerSetup) {
    setEditingId(player.id)
    setEditingName(player.name)
  }

  function saveEdit() {
    const trimmed = editingName.trim()
    if (trimmed && editingId) {
      onChange(players.map((p) => (p.id === editingId ? { ...p, name: trimmed } : p)))
    }
    setEditingId(null)
    setEditingName('')
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
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-fg outline-none transition-colors focus:border-accent"
        />
        <button
          type="button"
          onClick={addPlayer}
          disabled={!name.trim()}
          className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-fg transition-transform active:scale-95 disabled:opacity-40"
        >
          Thêm
        </button>
      </div>

      {players.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-2xl">🧑‍🤝‍🧑</p>
          <p className="mt-2 text-sm text-muted">Chưa có người chơi nào — thêm ít nhất 4 người để bắt đầu.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {players.map((player, i) => (
            <li
              key={player.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-muted">
                {i + 1}
              </span>
              {editingId === player.id ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={saveEdit}
                  className="min-w-0 flex-1 rounded-lg border border-accent bg-background px-2 py-1.5 text-sm text-fg outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(player)}
                  className="min-w-0 flex-1 truncate text-left text-sm text-fg"
                  title="Nhấn để sửa tên"
                >
                  {player.name}
                </button>
              )}
              <button
                type="button"
                onClick={() => removePlayer(player.id)}
                aria-label={`Xóa ${player.name}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {players.length > 0 && players.length < 4 && (
        <p className="text-xs text-amber-400">Cần tối thiểu 4 người chơi để bắt đầu ván.</p>
      )}
    </div>
  )
}
