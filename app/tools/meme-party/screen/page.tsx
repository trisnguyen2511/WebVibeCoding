'use client'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { Suspense, useEffect, useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { Banner, MemeCard, ModeBadge, PlayerChips, PromptCard, ResultPanel, Scoreboard, StatusBanner } from '@/components/meme-party/parts'
import { useRoom } from '@/components/meme-party/use-room'
import type { RoomView } from '@/lib/meme-party/types'

function Stage({ view, joinUrl }: { view: RoomView; joinUrl: string }) {
  const round = view.round
  const phase = view.phase === 'PAUSED' || view.phase === 'HOST_RECONNECTING' || view.phase === 'HOST_TRANSFER' ? (view.suspendedFrom ?? view.phase) : view.phase

  if (view.phase === 'LOBBY') {
    return (
      <div className="grid h-full items-center gap-10 lg:grid-cols-[auto_1fr]">
        <div className="mx-auto rounded-3xl bg-white p-6">{joinUrl && <QRCodeSVG value={joinUrl} size={320} />}</div>
        <div className="space-y-6">
          <p className="font-display text-3xl font-semibold text-fg">Quét QR hoặc nhập mã để vào phòng</p>
          <p className="font-mono text-8xl font-bold tracking-[0.2em] text-accent-soft">{view.code}</p>
          <p className="text-xl text-muted">
            {view.members.filter((m) => m.role === 'player').length}/{view.settings.maxPlayers} người chơi · cần tối thiểu {view.settings.minPlayers}
          </p>
          <PlayerChips view={view} />
        </div>
      </div>
    )
  }
  if (!round) return null

  if (view.phase === 'GAME_FINISHED') {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h2 className="text-center font-display text-5xl font-bold text-fg">🎉 Kết quả chung cuộc</h2>
        <Scoreboard rows={view.scoreboard} big />
      </div>
    )
  }

  if (phase === 'MEME_SHOWCASE') {
    const slide = round.submissions[round.showcaseIndex]
    return (
      <div className="flex flex-col items-center gap-3" style={{ height: 'calc(100dvh - 9rem)' }}>
        <p className="max-w-4xl text-center font-display text-2xl text-muted">{round.prompt.text}</p>
        <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">{slide && <div className="max-h-full w-full max-w-3xl [&_img]:max-h-[52dvh]"><MemeCard option={slide.option} big /></div>}</div>
        <p className="font-mono text-3xl font-bold text-accent-soft">{round.showcaseIndex + 1} / {round.submissions.length}</p>
      </div>
    )
  }

  if (phase === 'VOTING_OPEN') {
    return (
      <div className="space-y-5">
        <PromptCard round={round} big />
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(round.submissions.length, 2), 4)}, minmax(0, 1fr))` }}>
          {round.submissions.map((s, i) => (
            <div key={s.id} className="relative">
              <span className="absolute -left-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-accent font-mono text-lg font-bold text-white">{i + 1}</span>
              <MemeCard option={s.option} />
            </div>
          ))}
        </div>
        <p className="text-center font-display text-2xl text-fg">
          🗳️ Đã bình chọn <span className="font-mono text-accent-soft">{round.votedCount}/{round.eligibleCount}</span> — bình chọn trên điện thoại của bạn
        </p>
      </div>
    )
  }

  if (phase === 'RESULTS' || phase === 'ROUND_END') {
    return (
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <PromptCard round={round} />
          {round.skipped ? <Banner icon="⏭️" title="Vòng này bị bỏ qua" text="Không đủ bài hợp lệ." /> : round.result ? <ResultPanel view={view} big /> : <Banner icon="🥁" title="Đã chốt phiếu" text="Chuẩn bị công bố kết quả…" />}
        </div>
        <div className="space-y-3">
          <h3 className="font-display text-2xl font-semibold text-fg">Bảng điểm</h3>
          <Scoreboard rows={view.scoreboard} highlight={phase === 'ROUND_END' ? round.result?.pointsAwarded : undefined} big />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col justify-center space-y-8">
      <ModeBadge round={round} />
      <PromptCard round={round} big />
      {phase === 'SUBMISSION_OPEN' && (
        <div className="space-y-4 text-center">
          <p className="font-display text-3xl text-fg">✍️ Chọn bài trên điện thoại của bạn</p>
          <p className="font-mono text-5xl font-bold text-accent-soft">{round.submittedCount}/{round.eligibleCount}</p>
          <PlayerChips view={view} />
        </div>
      )}
      {phase === 'REVIEW' && <p className="text-center font-display text-3xl text-muted">🕵️ Host đang duyệt bài…</p>}
      {phase === 'ROUND_BRIEFING' && <p className="text-center font-display text-3xl text-muted">Chuẩn bị nhận bài…</p>}
    </div>
  )
}

function ScreenInner() {
  const code = useSearchParams().get('code')
  const valid = !!code && /^\d{6}$/.test(code)
  const { view, online, fatal } = useRoom(valid ? code : null, null)
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  if (!valid) return <div className="p-10"><Banner icon="❓" title="Thiếu mã phòng" text="Mở /tools/meme-party/screen?code=123456" /></div>
  if (fatal) return <div className="p-10"><Banner icon="🚫" tone="warn" title="Không tìm thấy phòng" text={fatal} /></div>
  if (!view) return <p className="p-10 text-center text-muted">Đang kết nối…</p>
  return (
    <div className="h-full overflow-auto p-6 lg:p-10">
      <div className="mb-4 space-y-2">
        {!online && <Banner icon="📶" tone="warn" title="Mất kết nối" text="Đang thử kết nối lại…" />}
        <StatusBanner view={view} />
      </div>
      {view.phase !== 'LOBBY' && (
        <p className="mb-4 text-right font-mono text-sm text-muted">
          Phòng {view.code} · quét QR ở sảnh để vào
        </p>
      )}
      <Stage view={view} joinUrl={origin ? `${origin}/tools/meme-party/play?code=${view.code}` : ''} />
    </div>
  )
}

export default function ScreenPage() {
  return (
    <ToolShell name="Meme Party" icon="🎭" description="Màn hình chung" fullBleed hideHeader>
      <Suspense fallback={null}>
        <ScreenInner />
      </Suspense>
    </ToolShell>
  )
}
