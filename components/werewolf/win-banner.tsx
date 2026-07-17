'use client'
import type { Faction } from '@/lib/werewolf/types'

const FACTION_LABEL: Record<Faction, string> = {
  wolf: 'Phe Sói',
  village: 'Phe Dân làng',
  neutral: 'Phe Trung lập',
}

interface WinBannerProps {
  winner: Faction
  onNewGame: () => void
}

export function WinBanner({ winner, onNewGame }: WinBannerProps) {
  return (
    <div className="space-y-4 rounded-lg border border-accent/50 bg-surface p-6 text-center">
      <p className="text-2xl">🏆</p>
      <p className="font-display text-lg font-semibold text-fg">{FACTION_LABEL[winner]} chiến thắng!</p>
      <button
        type="button"
        onClick={onNewGame}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fg hover:bg-accent/90"
      >
        Bắt đầu ván mới
      </button>
    </div>
  )
}
