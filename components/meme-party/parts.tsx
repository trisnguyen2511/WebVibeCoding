'use client'
import { useEffect, useState } from 'react'
import type { Option, RoomView, RoundView, ScoreRow } from '@/lib/meme-party/types'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' | 'danger'; block?: boolean }

export function Btn({ tone = 'ghost', block, className, ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'primary' && 'bg-accent text-white shadow-lg shadow-accent/20 hover:brightness-110 active:scale-[0.98]',
        tone === 'ghost' && 'border border-border bg-surface text-fg hover:border-accent/50',
        tone === 'danger' && 'border border-border bg-surface text-red-400 hover:border-red-400/50',
        block && 'w-full',
        className,
      )}
    />
  )
}

export function ModeBadge({ round }: { round: RoundView }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-display text-xs font-semibold text-accent-soft">{round.modeLabel}</span>
      <span className="font-mono text-xs text-muted">
        Vòng {round.index + 1}/{round.total}
      </span>
      {round.special === 'double' && <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-white">x2 ĐIỂM</span>}
      {round.special === 'chaos' && <span className="rounded-full border border-accent px-2.5 py-1 text-xs font-bold text-accent-soft">🌀 CHAOS</span>}
      {round.special === 'award' && <span className="rounded-full border border-accent px-2.5 py-1 text-xs font-bold text-accent-soft">🏅 GIẢI ĐẶC BIỆT</span>}
    </div>
  )
}

const chaosClass = (round: RoundView) => (round.special === 'chaos' && round.chaosStyle ? `mp-chaos-${round.chaosStyle}` : '')

export function PromptCard({ round, big = false }: { round: RoundView; big?: boolean }) {
  const chaos = chaosClass(round)
  return (
    <div className={cx('rounded-2xl border border-border bg-surface', big ? 'p-8' : 'p-4')}>
      <div className={cx(chaos === 'mp-chaos-mirror' ? '' : chaos)}>
        {round.prompt.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={round.prompt.imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className={cx('mx-auto mb-4 w-auto rounded-xl object-contain', big ? 'max-h-[34vh]' : 'max-h-44', chaos === 'mp-chaos-mirror' && 'mp-mirror-img')}
          />
        )}
        <p
          className={cx(
            'text-center font-display font-semibold leading-snug text-fg',
            big ? 'text-4xl' : 'text-lg',
            chaos === 'mp-chaos-rainbow' && 'mp-chaos-rainbow',
          )}
        >
          {round.prompt.text}
        </p>
      </div>
    </div>
  )
}

export function MemeCard({
  option,
  selected,
  disabled,
  onClick,
  badge,
  big,
}: {
  option: Option
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  badge?: string
  big?: boolean
}) {
  const interactive = !!onClick && !disabled
  return (
    <button
      type="button"
      disabled={!onClick || disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'relative flex min-h-24 w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 bg-surface p-2 text-center transition-all',
        selected ? 'border-accent shadow-lg shadow-accent/30' : 'border-border',
        interactive && 'hover:border-accent/60 active:scale-[0.98]',
        !onClick && 'cursor-default',
        disabled && onClick && 'opacity-50',
      )}
    >
      {option.kind === 'asset' && option.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={option.imageUrl} alt={option.title ?? 'meme'} referrerPolicy="no-referrer" className={cx('w-full object-contain', big ? 'max-h-[56vh]' : 'max-h-48')} />
      ) : (
        <span className={cx('px-2 py-3 font-medium leading-snug text-fg', big ? 'text-2xl' : 'text-sm')}>{option.text}</span>
      )}
      {badge && <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">{badge}</span>}
      {selected && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-white">✓</span>}
    </button>
  )
}

export function Scoreboard({ rows, meId, highlight, big }: { rows: ScoreRow[]; meId?: string | null; highlight?: Record<string, number>; big?: boolean }) {
  return (
    <ol className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.playerId}
          className={cx(
            'flex items-center gap-3 rounded-xl border bg-surface',
            big ? 'px-5 py-3' : 'px-3 py-2.5',
            row.playerId === meId ? 'border-accent/60' : 'border-border',
          )}
        >
          <span className={cx('flex shrink-0 items-center justify-center rounded-full bg-background font-mono font-bold text-accent-soft', big ? 'h-10 w-10 text-lg' : 'h-8 w-8 text-sm')}>
            {row.rank === 1 && row.points > 0 ? '🏆' : row.rank}
          </span>
          <span className={cx('min-w-0 flex-1 truncate font-medium text-fg', big ? 'text-xl' : 'text-sm')}>
            {row.name}
            {row.playerId === meId && <span className="ml-1.5 text-xs text-accent-soft">(bạn)</span>}
          </span>
          {highlight?.[row.playerId] ? <span className="font-mono text-xs font-bold text-accent-soft">+{highlight[row.playerId]}</span> : null}
          <span className={cx('font-mono font-bold text-fg', big ? 'text-2xl' : 'text-base')}>{row.points}</span>
          <span className="hidden font-mono text-[10px] text-muted sm:inline" title="Số lần thắng một mình">
            ★{row.uniqueWins}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Countdown until the Host's reconnection window ends. */
export function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [deadline])
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null
}

export function StatusBanner({ view, isHostView }: { view: RoomView; isHostView?: boolean }) {
  const left = useCountdown(view.hostDeadline)
  if (view.phase === 'PAUSED') {
    return <Banner icon="⏸️" title="Ván đang tạm dừng" text={isHostView ? 'Nhấn Tiếp tục để chơi tiếp.' : 'Host sẽ tiếp tục sớm thôi.'} />
  }
  if (view.phase === 'HOST_RECONNECTING') {
    return (
      <Banner
        icon="📡"
        title="Host đang mất kết nối"
        text={`Chờ Host quay lại${left !== null ? ` (${left}s)` : ''} — nếu không, quyền Host sẽ chuyển cho người chơi khác. Dữ liệu ván vẫn được giữ nguyên.`}
      />
    )
  }
  if (view.phase === 'HOST_TRANSFER') {
    return <Banner icon="🔁" title="Đang chuyển quyền Host" text="Chưa có người chơi online phù hợp — ván được giữ nguyên, chờ ai đó kết nối lại." />
  }
  return null
}

export function Banner({ icon, title, text, tone = 'info' }: { icon: string; title: string; text?: string; tone?: 'info' | 'warn' }) {
  return (
    <div role="status" className={cx('flex items-start gap-3 rounded-xl border bg-surface p-3', tone === 'warn' ? 'border-accent/60' : 'border-border')}>
      <span className="text-xl leading-none">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {text && <p className="mt-0.5 text-xs text-muted">{text}</p>}
      </div>
    </div>
  )
}

export function PlayerChips({ view }: { view: RoomView }) {
  const players = view.members.filter((m) => m.role === 'player')
  return (
    <div className="flex flex-wrap gap-2">
      {players.map((m) => (
        <span key={m.id} className={cx('inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-fg', !m.connected && 'opacity-50')}>
          <span className={cx('h-1.5 w-1.5 rounded-full', m.connected ? 'bg-accent-soft' : 'bg-muted')} />
          {m.name}
        </span>
      ))}
    </div>
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-mono">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ResultPanel({ view, big }: { view: RoomView; big?: boolean }) {
  const round = view.round
  const result = round?.result
  if (!round || !result) return null
  const winners = result.tallies.filter((t) => result.winnerSubmissionIds.includes(t.submissionId))
  return (
    <div className="space-y-4">
      {result.noWinner ? (
        <Banner icon="🤷" title="Không ai nhận được phiếu" text="Vòng này không có người thắng và không ai được điểm." />
      ) : (
        <div className={cx('grid gap-4', winners.length > 1 && 'sm:grid-cols-2')}>
          {winners.map((w) => (
            <div key={w.submissionId} className="rounded-2xl border-2 border-accent bg-accent/10 p-3 text-center">
              <p className="mb-2 font-display text-sm font-semibold text-accent-soft">{result.unique ? '🏆 Người thắng' : '🤝 Đồng hạng nhất'}</p>
              <MemeCard option={w.option} big={big} />
              <p className={cx('mt-2 font-display font-semibold text-fg', big ? 'text-2xl' : 'text-base')}>{w.authorName}</p>
              <p className="font-mono text-sm text-accent-soft">
                +{result.pointsAwarded[w.authorId]} điểm{result.multiplier === 2 ? ' (x2)' : ''} · {w.votes} phiếu
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        {result.tallies.map((t) => (
          <div key={t.submissionId} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-fg">{t.authorName}</span>
            <span className="min-w-0 max-w-[40%] truncate text-xs text-muted">{t.option.text ?? t.option.title}</span>
            <span className="font-mono font-bold text-accent-soft">{t.votes}</span>
          </div>
        ))}
      </div>
      {round.award && (
        <Banner icon="🏅" tone="warn" title={round.award.title} text={`Giải của Host — ${result.tallies.find((t) => t.submissionId === round.award?.submissionId)?.authorName ?? ''} (không ảnh hưởng điểm)`} />
      )}
    </div>
  )
}
