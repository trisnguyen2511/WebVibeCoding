'use client'
import { useState } from 'react'
import type { Player } from '@/lib/werewolf/types'
import { getActiveDayVotes } from '@/lib/werewolf/selectors'
import type { GameEvent } from '@/lib/werewolf/types'

interface DayPanelProps {
  players: Player[]
  day: number
  events: GameEvent[]
  onVote: (voterPlayerId: string, targetPlayerId: string) => void
  onResolveDay: () => void
}

export function DayPanel({ players, day, events, onVote, onResolveDay }: DayPanelProps) {
  const [voter, setVoter] = useState<string | null>(null)
  const alive = players.filter((p) => p.isAlive)
  const votes = getActiveDayVotes(events, day)
  const voteByVoter = new Map(votes.map((v) => [v.voterPlayerId, v.targetPlayerId]))
  const nameById = new Map(players.map((p) => [p.id, p.name]))

  const tally = new Map<string, number>()
  for (const vote of votes) tally.set(vote.targetPlayerId, (tally.get(vote.targetPlayerId) ?? 0) + 1)

  function pickTarget(targetId: string) {
    if (!voter) return
    onVote(voter, targetId)
    setVoter(null)
  }

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-muted">
        Ngày {day} — {votes.length}/{alive.length} người đã bỏ phiếu
      </p>

      <div>
        <p className="mb-1.5 text-sm text-muted">1. Chọn người bỏ phiếu</p>
        <div className="flex flex-wrap gap-1.5">
          {alive.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setVoter(p.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                voter === p.id
                  ? 'border-accent bg-accent/15 text-fg'
                  : voteByVoter.has(p.id)
                    ? 'border-border bg-surface text-muted'
                    : 'border-border text-muted hover:border-accent/40'
              }`}
            >
              {p.name}
              {voteByVoter.has(p.id) && ` → ${nameById.get(voteByVoter.get(p.id)!) ?? '?'}`}
            </button>
          ))}
        </div>
      </div>

      {voter && (
        <div>
          <p className="mb-1.5 text-sm text-muted">2. {nameById.get(voter)} bỏ phiếu cho ai?</p>
          <div className="flex flex-wrap gap-1.5">
            {alive
              .filter((p) => p.id !== voter)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickTarget(p.id)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-fg hover:border-accent/50"
                >
                  {p.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {tally.size > 0 && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="mb-1 text-sm font-medium text-fg">Kiểm phiếu</p>
          <ul className="space-y-1 font-mono text-sm">
            {Array.from(tally.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([playerId, count]) => (
                <li key={playerId} className="flex justify-between text-muted">
                  <span>{nameById.get(playerId) ?? '?'}</span>
                  <span className="text-fg">{count} phiếu</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onResolveDay}
        disabled={votes.length === 0}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-fg disabled:opacity-40"
      >
        ⚖️ Chốt phiếu ngày {day}
      </button>
    </div>
  )
}
