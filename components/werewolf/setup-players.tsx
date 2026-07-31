'use client'
import { useState } from 'react'
import Link from 'next/link'
import { MIN_PLAYERS, type PlayerSetup } from '@/lib/werewolf/types'

interface SetupPlayersProps {
  players: PlayerSetup[]
  onChange: (players: PlayerSetup[]) => void
}

interface PlayerGroup {
  id: string
  name: string
  playerNames: string[]
}

export function SetupPlayers({ players, onChange }: SetupPlayersProps) {
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showGroups, setShowGroups] = useState(false)
  const [groups, setGroups] = useState<PlayerGroup[] | null>(null)
  const [loadingGroups, setLoadingGroups] = useState(false)

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

  async function toggleGroups() {
    const next = !showGroups
    setShowGroups(next)
    if (next && groups === null) {
      setLoadingGroups(true)
      try {
        const res = await fetch('/api/werewolf/groups')
        const data = await res.json()
        setGroups(data.groups ?? [])
      } catch {
        setGroups([])
      } finally {
        setLoadingGroups(false)
      }
    }
  }

  function applyGroup(group: PlayerGroup, mode: 'replace' | 'append') {
    if (mode === 'replace' && players.length > 0) {
      if (!window.confirm(`Thay thế toàn bộ ${players.length} người chơi hiện tại bằng nhóm "${group.name}"?`)) return
    }
    const newPlayers = group.playerNames.map((n) => ({ id: crypto.randomUUID(), name: n, roleIds: [] }))
    onChange(mode === 'replace' ? newPlayers : [...players, ...newPlayers])
    setShowGroups(false)
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

      <div className="flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={toggleGroups}
          className="text-muted underline underline-offset-2 hover:text-fg"
        >
          {showGroups ? '✕ Đóng danh sách nhóm' : '📋 Chọn nhóm có sẵn'}
        </button>
        <Link href="/tools/werewolf-gm/admin" className="text-muted underline underline-offset-2 hover:text-fg">
          ⚙️ Quản lý nhóm
        </Link>
      </div>

      {showGroups && (
        <div className="space-y-1.5 rounded-xl border border-border bg-surface p-2.5">
          {loadingGroups ? (
            <p className="px-1 py-2 text-xs text-muted">Đang tải...</p>
          ) : !groups || groups.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted">Chưa có nhóm nào được lưu — tạo ở trang Quản lý nhóm.</p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
                <p className="font-medium text-fg">{group.name}</p>
                <p className="truncate text-muted">
                  {group.playerNames.length} người · {group.playerNames.join(', ')}
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyGroup(group, 'append')}
                    className="flex-1 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-fg"
                  >
                    ➕ Thêm vào danh sách
                  </button>
                  <button
                    type="button"
                    onClick={() => applyGroup(group, 'replace')}
                    className="flex-1 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-fg"
                  >
                    🔄 Thay thế danh sách
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

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

      {players.length > 0 && players.length < MIN_PLAYERS && (
        <p className="text-xs text-amber-400">Cần tối thiểu {MIN_PLAYERS} người chơi để bắt đầu ván.</p>
      )}
    </div>
  )
}
