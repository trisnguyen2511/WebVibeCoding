'use client'
import type { Faction } from '@/lib/werewolf/types'

const FACTION_LABEL: Record<Faction, string> = {
  wolf: 'Phe Sói',
  village: 'Phe Dân làng',
  neutral: 'Phe Trung lập',
}

interface WinBannerProps {
  winner: Faction
  onPlayAgain: () => void
  onResetAll: () => void
}

export function WinBanner({ winner, onPlayAgain, onResetAll }: WinBannerProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-accent/40 bg-surface px-6 py-8 text-center">
      <p className="text-4xl">🏆</p>
      <p className="font-display text-xl font-semibold text-fg">{FACTION_LABEL[winner]} chiến thắng!</p>
      <div className="space-y-2">
        <button
          type="button"
          onClick={onPlayAgain}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-accent/20 transition-transform active:scale-[0.98]"
        >
          🔁 Chơi ván mới (giữ danh sách người chơi)
        </button>
        <button type="button" onClick={onResetAll} className="text-xs text-muted underline underline-offset-2">
          Xóa hết, làm lại từ đầu
        </button>
      </div>
    </div>
  )
}
