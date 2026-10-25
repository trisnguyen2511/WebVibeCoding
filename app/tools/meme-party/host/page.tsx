'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { Suspense, useEffect, useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { Banner, Btn, MemeCard, ModeBadge, PlayerChips, ProgressBar, PromptCard, ResultPanel, Scoreboard, StatusBanner } from '@/components/meme-party/parts'
import { useRoom } from '@/components/meme-party/use-room'
import { loadSession, type StoredSession } from '@/lib/meme-party/client'
import type { Command } from '@/lib/meme-party/types'

const AWARDS = ['Meme khó hiểu nhất', 'Meme đồng cảm nhất', 'Phản ứng bất ngờ nhất', 'Meme hài nhất vòng']

function HostConsole({ session }: { session: StoredSession }) {
  const { view, online, fatal, pending, notice, run } = useRoom(session.code, session.token)
  const [origin, setOrigin] = useState('')
  const [award, setAward] = useState({ submissionId: '', title: AWARDS[0] })
  useEffect(() => setOrigin(window.location.origin), [])

  if (fatal) return <Banner icon="🚫" tone="warn" title="Không thể mở phòng" text={fatal} />
  if (!view) return <p className="py-10 text-center text-sm text-muted">Đang kết nối phòng…</p>

  if (view.me && view.me.role !== 'host') {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <Banner icon="🔁" tone="warn" title="Bạn không còn là Host" text="Quyền Host đã được chuyển cho người khác vì mất kết nối quá lâu. Bạn đang xem với tư cách khán giả." />
        <Link href={`/tools/meme-party/play?code=${view.code}`} className="block rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold text-fg">
          Xem ván như người chơi
        </Link>
      </div>
    )
  }

  const round = view.round
  const phase = view.phase === 'PAUSED' || view.phase === 'HOST_RECONNECTING' || view.phase === 'HOST_TRANSFER' ? (view.suspendedFrom ?? view.phase) : view.phase
  const locked = view.phase === 'HOST_RECONNECTING' || view.phase === 'HOST_TRANSFER'
  const paused = view.phase === 'PAUSED'
  const act = (c: Command, confirmText?: string) => () => {
    if (confirmText && !window.confirm(confirmText)) return
    void run(c)
  }
  const joinUrl = origin ? `${origin}/tools/meme-party/play?code=${view.code}` : ''
  const screenUrl = origin ? `${origin}/tools/meme-party/screen?code=${view.code}` : ''
  const review = round?.reviewList ?? []
  const pending_ = review.filter((s) => s.status === 'pending').length
  const approvedNow = review.filter((s) => s.status === 'approved').length
  const enoughNow = approvedNow >= 3
  const players = view.members.filter((m) => m.role === 'player')
  const canPlayPhase = !locked && !paused

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      {!online && <Banner icon="📶" tone="warn" title="Mất kết nối" text="Đang thử kết nối lại…" />}
      <StatusBanner view={view} isHostView />
      {notice && <p role="alert" className="rounded-xl border border-red-400/40 bg-surface px-3 py-2 text-sm text-red-400">{notice}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">Mã phòng</p>
          <p className="font-mono text-2xl font-bold tracking-[0.25em] text-fg">{view.code}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a href={screenUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-fg hover:border-accent/50">
            📺 Mở màn hình chung
          </a>
          {view.matchStarted && view.phase !== 'GAME_FINISHED' && view.phase !== 'CANCELLED' && (
            <>
              {paused ? (
                <Btn tone="primary" disabled={pending} onClick={act({ type: 'RESUME' })}>▶ Tiếp tục</Btn>
              ) : (
                <Btn disabled={pending || locked} onClick={act({ type: 'PAUSE' })}>⏸ Tạm dừng</Btn>
              )}
              <Btn tone="danger" disabled={pending || locked} onClick={act({ type: 'CANCEL_MATCH' }, 'Huỷ ván này? Không thể hoàn tác.')}>Huỷ ván</Btn>
            </>
          )}
        </div>
      </div>

      {view.phase === 'LOBBY' && (
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="rounded-xl bg-white p-3">{joinUrl && <QRCodeSVG value={joinUrl} size={168} />}</div>
            <div className="min-w-0 space-y-2 text-sm">
              <p className="font-display text-base font-semibold text-fg">Mời mọi người vào phòng</p>
              <p className="text-muted">Quét QR hoặc vào trang Meme Party và nhập mã. Cần {view.settings.minPlayers}–{view.settings.maxPlayers} người chơi.</p>
              <p className="break-all font-mono text-xs text-muted">{joinUrl}</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted">
              Người chơi ({players.length}/{view.settings.maxPlayers})
            </p>
            {players.length === 0 && <p className="text-sm text-muted">Chưa có ai vào…</p>}
            <ul className="space-y-1.5">
              {players.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg">{m.name}</span>
                  <button className="text-xs text-red-400 hover:underline" onClick={act({ type: 'KICK', playerId: m.id }, `Kick ${m.name}?`)}>Kick</button>
                </li>
              ))}
            </ul>
          </div>
          <Btn tone="primary" block disabled={pending || !view.canStart} onClick={act({ type: 'START_MATCH' })}>
            {view.canStart ? 'Bắt đầu ván (10 vòng)' : `Cần thêm ${Math.max(0, view.settings.minPlayers - players.length)} người để bắt đầu`}
          </Btn>
        </section>
      )}

      {round && view.matchStarted && (
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <ModeBadge round={round} />
          <PromptCard round={round} />

          {phase === 'ROUND_BRIEFING' && (
            <Btn tone="primary" block disabled={pending || !canPlayPhase} onClick={act({ type: 'OPEN_SUBMISSION' })}>Mở nhận bài</Btn>
          )}

          {phase === 'SUBMISSION_OPEN' && (
            <>
              <ProgressBar value={round.submittedCount} max={round.eligibleCount} label="Đã nộp bài" />
              <div className="flex flex-wrap gap-2 text-xs">
                {players.map((m) => (
                  <span key={m.id} className={`rounded-full border px-2.5 py-1 ${m.hasSubmitted ? 'border-accent/60 text-accent-soft' : 'border-border text-muted'}`}>
                    {m.hasSubmitted ? '✓ ' : ''}{m.name}
                  </span>
                ))}
              </div>
              <Btn tone="primary" block disabled={pending || !canPlayPhase} onClick={act({ type: 'CLOSE_SUBMISSION' })}>Đóng nhận bài → Duyệt</Btn>
            </>
          )}

          {phase === 'REVIEW' && (
            <>
              <p className="text-sm text-muted">Duyệt ẩn danh — tác giả chỉ lộ sau khi công bố kết quả. Cần tối thiểu 3 bài hợp lệ.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {review.map((s) => (
                  <div key={s.id} className="space-y-2">
                    <MemeCard option={s.option} badge={s.status === 'approved' ? 'Đã duyệt' : s.status === 'rejected' ? 'Đã loại' : 'Chờ duyệt'} />
                    <div className="flex gap-1.5">
                      <Btn className="flex-1 !min-h-9 !px-2 !py-1.5 text-xs" tone={s.status === 'approved' ? 'primary' : 'ghost'} disabled={pending || !canPlayPhase} onClick={act({ type: 'REVIEW_SUBMISSION', submissionId: s.id, decision: 'approve' })}>Duyệt</Btn>
                      <Btn className="flex-1 !min-h-9 !px-2 !py-1.5 text-xs" tone="danger" disabled={pending || !canPlayPhase} onClick={act({ type: 'REVIEW_SUBMISSION', submissionId: s.id, decision: 'reject' })}>Loại</Btn>
                    </div>
                  </div>
                ))}
              </div>
              {review.length === 0 && <Banner icon="📭" title="Chưa có bài nào được nộp" />}
              {pending_ > 0 && (
                <Btn block disabled={pending || !canPlayPhase} onClick={act({ type: 'APPROVE_ALL_PENDING' })}>Duyệt nốt {pending_} bài đang chờ</Btn>
              )}
              {enoughNow && pending_ === 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Btn tone="primary" disabled={pending || !canPlayPhase} onClick={act({ type: 'OPEN_SHOWCASE' })}>🎞️ Mở Meme Showcase</Btn>
                  <Btn disabled={pending || !canPlayPhase} onClick={act({ type: 'SKIP_SHOWCASE' })}>Bỏ qua Showcase → Bình chọn</Btn>
                </div>
              ) : (
                <div className="space-y-2">
                  <Banner icon="⚠️" tone="warn" title={pending_ > 0 ? 'Còn bài chưa duyệt' : `Mới có ${approvedNow}/3 bài hợp lệ`} text={pending_ === 0 ? 'Mở lại nhận bài để thêm bài. Nếu mở lại vẫn không đủ, bạn có thể bỏ qua vòng (không ai được điểm).' : undefined} />
                  {pending_ === 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Btn disabled={pending || !canPlayPhase} onClick={act({ type: 'REOPEN_SUBMISSION' })}>Mở lại nhận bài</Btn>
                      <Btn tone="danger" disabled={pending || !canPlayPhase || round.reopenCount < 1} onClick={act({ type: 'SKIP_ROUND' }, 'Bỏ qua vòng này? Không ai được điểm.')}>
                        Bỏ qua vòng {round.reopenCount < 1 ? '(cần mở lại 1 lần trước)' : ''}
                      </Btn>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {phase === 'MEME_SHOWCASE' && (
            <>
              <p className="text-center font-mono text-sm text-muted">{round.showcaseIndex + 1} / {round.submissions.length}</p>
              {round.submissions[round.showcaseIndex] && <div className="mx-auto max-w-xs"><MemeCard option={round.submissions[round.showcaseIndex].option} /></div>}
              <div className="grid grid-cols-3 gap-2">
                <Btn disabled={pending || !canPlayPhase || round.showcaseIndex <= 0} onClick={act({ type: 'SHOWCASE_GOTO', index: round.showcaseIndex - 1 })}>◀ Trước</Btn>
                <Btn disabled={pending || !canPlayPhase || round.showcaseIndex >= round.submissions.length - 1} onClick={act({ type: 'SHOWCASE_GOTO', index: round.showcaseIndex + 1 })}>Sau ▶</Btn>
                <Btn tone="primary" disabled={pending || !canPlayPhase} onClick={act({ type: 'END_SHOWCASE' })}>Kết thúc → Bình chọn</Btn>
              </div>
            </>
          )}

          {phase === 'VOTING_OPEN' && (
            <>
              <ProgressBar value={round.votedCount} max={round.eligibleCount} label="Đã bình chọn" />
              <p className="text-xs text-muted">Kết quả từng bài được giấu cho tới khi bạn đóng bình chọn.</p>
              <Btn tone="primary" block disabled={pending || !canPlayPhase} onClick={act({ type: 'CLOSE_VOTING' }, round.votedCount < round.eligibleCount ? 'Vẫn còn người chưa bình chọn. Đóng bình chọn?' : undefined)}>Đóng bình chọn & khoá kết quả</Btn>
            </>
          )}

          {phase === 'RESULTS' && (
            <>
              {!round.result && <Btn tone="primary" block disabled={pending || !canPlayPhase} onClick={act({ type: 'PUBLISH_RESULTS' })}>🥁 Công bố kết quả</Btn>}
              {round.result && (
                <>
                  <ResultPanel view={view} />
                  {round.special === 'award' && !round.award && (
                    <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                      <p className="text-sm font-semibold text-fg">🏅 Giải đặc biệt của Host (không ảnh hưởng điểm)</p>
                      <select className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" value={award.title} onChange={(e) => setAward({ ...award, title: e.target.value })} aria-label="Tên giải">
                        {AWARDS.map((a) => <option key={a}>{a}</option>)}
                      </select>
                      <select className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg" value={award.submissionId} onChange={(e) => setAward({ ...award, submissionId: e.target.value })} aria-label="Bài nhận giải">
                        <option value="">Chọn bài nhận giải…</option>
                        {round.result.tallies.map((t) => <option key={t.submissionId} value={t.submissionId}>{t.authorName} — {t.option.text ?? t.option.title}</option>)}
                      </select>
                      <Btn block disabled={pending || !award.submissionId} onClick={act({ type: 'SET_AWARD', submissionId: award.submissionId, title: award.title })}>Trao giải</Btn>
                    </div>
                  )}
                  <Btn tone="primary" block disabled={pending || !canPlayPhase} onClick={act({ type: 'FINISH_ROUND' })}>Kết thúc vòng → Bảng điểm</Btn>
                </>
              )}
            </>
          )}

          {phase === 'ROUND_END' && (
            <>
              {round.skipped && <Banner icon="⏭️" title="Vòng này đã bị bỏ qua" />}
              <Btn tone="primary" block disabled={pending || !canPlayPhase} onClick={act({ type: 'NEXT_ROUND' })}>
                {round.index + 1 >= round.total ? '🏁 Xem kết quả chung cuộc' : `Sang vòng ${round.index + 2}`}
              </Btn>
            </>
          )}
        </section>
      )}

      {view.matchStarted && view.scoreboard.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-display text-sm font-semibold text-fg">{view.phase === 'GAME_FINISHED' ? '🎉 Kết quả chung cuộc' : 'Bảng điểm'}</h3>
          <Scoreboard rows={view.scoreboard} />
        </section>
      )}

      {view.matchStarted && view.phase !== 'GAME_FINISHED' && view.phase !== 'CANCELLED' && (
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-fg">Người trong phòng ({view.members.length})</summary>
          <div className="mt-3 space-y-2">
            <PlayerChips view={view} />
            <ul className="space-y-1">
              {view.members.filter((m) => m.role !== 'host').map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-xs text-muted">
                  <span className="flex-1 truncate text-fg">{m.name}{m.role === 'spectator' ? ' (khán giả)' : ''}</span>
                  <button className="text-red-400 hover:underline" disabled={locked} onClick={act({ type: 'KICK', playerId: m.id }, `Kick ${m.name}?`)}>Kick</button>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
      {view.phase === 'CANCELLED' && <Banner icon="🛑" title="Ván đã bị huỷ" />}
    </div>
  )
}

function HostInner() {
  const params = useSearchParams()
  const router = useRouter()
  const code = params.get('code')
  const [session, setSession] = useState<StoredSession | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setSession(loadSession(code, 'host'))
    setReady(true)
  }, [code])
  if (!ready) return null
  if (!code || !session) {
    return (
      <div className="mx-auto max-w-sm space-y-3">
        <Banner icon="🔑" title="Không tìm thấy phiên Host" text="Phiên Host nằm trên thiết bị đã tạo phòng. Hãy tạo phòng mới." />
        <Btn block onClick={() => router.push('/tools/meme-party')}>Về trang chủ</Btn>
      </div>
    )
  }
  return <HostConsole session={session} />
}

export default function HostPage() {
  return (
    <ToolShell name="Meme Party" icon="🎭" description="Bảng điều khiển Host">
      <Suspense fallback={null}>
        <HostInner />
      </Suspense>
    </ToolShell>
  )
}
