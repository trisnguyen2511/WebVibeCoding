'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { Banner, Btn, MemeCard, ModeBadge, PlayerChips, ProgressBar, PromptCard, ResultPanel, Scoreboard, StatusBanner } from '@/components/meme-party/parts'
import { useRoom } from '@/components/meme-party/use-room'
import { api, clearSession, loadSession, saveSession, type StoredSession } from '@/lib/meme-party/client'
import type { RoomView } from '@/lib/meme-party/types'

function JoinForm({ code, onJoined }: { code: string; onJoined: (s: StoredSession) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function join() {
    setBusy(true)
    const res = await api<{ memberId: string; token: string; roomId: string }>('/api/meme-party/rooms/join', { method: 'POST', body: JSON.stringify({ code, name }) })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    const session = { code, token: res.result.token, memberId: res.result.memberId, name, roomId: res.result.roomId }
    saveSession(session)
    onJoined(session)
  }
  return (
    <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-display text-lg font-semibold text-fg">Vào phòng {code}</h2>
      <input className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-fg outline-none focus:border-accent" placeholder="Tên hiển thị" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} aria-label="Tên hiển thị" />
      <Btn tone="primary" block disabled={busy || !name.trim()} onClick={join}>
        Vào chơi
      </Btn>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

function PlayerGame({ session, onLeave }: { session: StoredSession; onLeave: () => void }) {
  const { view, online, fatal, pending, notice, run } = useRoom(session.code, session.token)
  const [picked, setPicked] = useState<string | null>(null)
  const [confirmVote, setConfirmVote] = useState<string | null>(null)

  const roundIndex = view?.round?.index ?? -1
  useEffect(() => {
    setPicked(null)
    setConfirmVote(null)
  }, [roundIndex])

  if (fatal) {
    return (
      <div className="mx-auto max-w-sm space-y-3">
        <Banner icon="🚫" tone="warn" title="Không thể vào phòng" text={fatal} />
        <Btn block onClick={onLeave}>Về trang chủ Meme Party</Btn>
      </div>
    )
  }
  if (!view) return <p className="py-10 text-center text-sm text-muted">Đang kết nối phòng {session.code}…</p>
  return <PlayerScreen view={view} online={online} pending={pending} notice={notice} picked={picked} setPicked={setPicked} confirmVote={confirmVote} setConfirmVote={setConfirmVote} run={run} />
}

function PlayerScreen({
  view,
  online,
  pending,
  notice,
  picked,
  setPicked,
  confirmVote,
  setConfirmVote,
  run,
}: {
  view: RoomView
  online: boolean
  pending: boolean
  notice: string | null
  picked: string | null
  setPicked: (v: string | null) => void
  confirmVote: string | null
  setConfirmVote: (v: string | null) => void
  run: (c: { type: 'SUBMIT'; optionId: string } | { type: 'VOTE'; submissionId: string }) => Promise<boolean>
}) {
  const round = view.round
  const me = view.me
  const spectator = view.viewer === 'spectator' || (me && !me.eligible && view.matchStarted)
  const myRow = view.scoreboard.find((r) => r.playerId === me?.id)
  const phase = view.phase === 'PAUSED' || view.phase === 'HOST_RECONNECTING' || view.phase === 'HOST_TRANSFER' ? (view.suspendedFrom ?? view.phase) : view.phase
  const frozen = view.phase === 'PAUSED'
  const submittedId = view.mySubmission?.optionId ?? null
  const selected = picked ?? submittedId

  return (
    <div className="mx-auto max-w-md space-y-4 pb-24">
      {!online && <Banner icon="📶" tone="warn" title="Mất kết nối" text="Đang thử kết nối lại — những gì bạn đã gửi vẫn được giữ." />}
      <StatusBanner view={view} />
      {me?.role === 'host' && (
        <a href={`/tools/meme-party/host?code=${view.code}`} className="block rounded-xl border border-accent bg-accent/10 px-4 py-3 text-center text-sm font-semibold text-accent-soft">
          🎤 Bạn đã trở thành Host — mở bảng điều khiển
        </a>
      )}
      {spectator && view.matchStarted && me?.role !== 'host' && <Banner icon="👀" title="Bạn đang xem với tư cách khán giả" text="Bạn vào sau khi ván bắt đầu nên chưa thể nộp bài hay bình chọn." />}
      {notice && <p role="alert" className="rounded-xl border border-red-400/40 bg-surface px-3 py-2 text-sm text-red-400">{notice}</p>}

      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-xs">
        <span className="text-muted">
          {me?.name} · phòng <span className="font-mono text-fg">{view.code}</span>
        </span>
        {myRow && <span className="font-mono font-bold text-accent-soft">{myRow.points} điểm</span>}
      </div>

      {view.phase === 'LOBBY' && (
        <div className="space-y-4">
          <Banner icon="⏳" title="Đang chờ Host bắt đầu" text={`${view.members.filter((m) => m.role === 'player').length}/${view.settings.maxPlayers} người chơi · cần ít nhất ${view.settings.minPlayers}`} />
          <PlayerChips view={view} />
        </div>
      )}

      {round && phase === 'ROUND_BRIEFING' && (
        <div className="space-y-3">
          <ModeBadge round={round} />
          <PromptCard round={round} />
          <Banner icon="👀" title="Đọc đề nhé" text="Host sẽ mở nhận bài ngay bây giờ." />
        </div>
      )}

      {round && phase === 'SUBMISSION_OPEN' && (
        <div className="space-y-3">
          <ModeBadge round={round} />
          <PromptCard round={round} />
          {!spectator && view.myHand && (
            <>
              <p className="text-sm text-muted">{round.mode === 'caption' ? 'Chọn caption hợp nhất:' : 'Chọn meme của bạn:'}</p>
              <div className="grid grid-cols-2 gap-3">
                {view.myHand.map((o) => (
                  <MemeCard key={o.id} option={o} selected={selected === o.id} badge={submittedId === o.id ? 'Đã gửi' : undefined} onClick={() => setPicked(o.id)} disabled={frozen} />
                ))}
              </div>
              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur">
                <div className="mx-auto max-w-md">
                  <Btn tone="primary" block disabled={pending || frozen || !picked || picked === submittedId} onClick={() => picked && run({ type: 'SUBMIT', optionId: picked })}>
                    {submittedId ? (picked && picked !== submittedId ? 'Đổi lựa chọn' : '✓ Đã gửi — bạn vẫn có thể đổi') : 'Gửi bài'}
                  </Btn>
                </div>
              </div>
            </>
          )}
          <ProgressBar value={round.submittedCount} max={round.eligibleCount} label="Đã nộp bài" />
        </div>
      )}

      {round && phase === 'REVIEW' && (
        <div className="space-y-3">
          <PromptCard round={round} />
          <Banner icon="🕵️" title="Host đang duyệt bài" text={view.mySubmission ? `Bài của bạn: ${view.mySubmission.status === 'approved' ? 'đã duyệt ✓' : view.mySubmission.status === 'rejected' ? 'bị loại — có thể được mở lại để nộp bài khác' : 'đang chờ duyệt'}` : 'Bạn chưa nộp bài vòng này.'} />
        </div>
      )}

      {round && phase === 'MEME_SHOWCASE' && (
        <div className="space-y-3">
          <PromptCard round={round} />
          <p className="text-center font-mono text-xs text-muted">
            Trình chiếu {round.showcaseIndex + 1} / {round.submissions.length}
          </p>
          {round.submissions[round.showcaseIndex] && <MemeCard option={round.submissions[round.showcaseIndex].option} big />}
          <p className="text-center text-xs text-muted">Host điều khiển slide — giơ điện thoại cho bạn bên cạnh xem nhé 😄</p>
        </div>
      )}

      {round && phase === 'VOTING_OPEN' && (
        <div className="space-y-3">
          <PromptCard round={round} />
          {view.myVoteSubmissionId ? (
            <Banner icon="🗳️" title="Đã chốt bình chọn" text="Phiếu không thể đổi. Chờ mọi người bình chọn xong." />
          ) : (
            !spectator && <p className="text-sm text-muted">Chọn bài hài nhất (không thể tự chọn bài mình):</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {round.submissions.map((s) => (
              <MemeCard
                key={s.id}
                option={s.option}
                selected={view.myVoteSubmissionId === s.id || confirmVote === s.id}
                badge={s.mine ? 'Bài của bạn' : undefined}
                disabled={!!s.mine || !!view.myVoteSubmissionId || spectator || frozen || undefined}
                onClick={spectator || view.myVoteSubmissionId ? undefined : () => setConfirmVote(s.id)}
              />
            ))}
          </div>
          <ProgressBar value={round.votedCount} max={round.eligibleCount} label="Đã bình chọn" />
          {confirmVote && !view.myVoteSubmissionId && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur">
              <div className="mx-auto flex max-w-md gap-2">
                <Btn onClick={() => setConfirmVote(null)}>Chọn lại</Btn>
                <Btn tone="primary" className="flex-1" disabled={pending} onClick={async () => { if (await run({ type: 'VOTE', submissionId: confirmVote })) setConfirmVote(null) }}>
                  Chốt bình chọn (không đổi được)
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {round && phase === 'RESULTS' && (
        <div className="space-y-3">
          <PromptCard round={round} />
          {round.result ? <ResultPanel view={view} /> : <Banner icon="🥁" title="Đã chốt phiếu" text="Host sắp công bố kết quả…" />}
        </div>
      )}

      {round && phase === 'ROUND_END' && (
        <div className="space-y-3">
          {round.skipped ? <Banner icon="⏭️" title="Vòng này bị bỏ qua" text="Không đủ bài hợp lệ — không ai được điểm." /> : <ResultPanel view={view} />}
          <h3 className="font-display text-sm font-semibold text-fg">Bảng điểm</h3>
          <Scoreboard rows={view.scoreboard} meId={me?.id} highlight={round.result?.pointsAwarded} />
          <p className="text-center text-xs text-muted">Chờ Host sang vòng tiếp theo…</p>
        </div>
      )}

      {view.phase === 'GAME_FINISHED' && (
        <div className="space-y-3">
          <Banner icon="🎉" tone="warn" title="Hết ván!" text="Bảng xếp hạng cuối cùng" />
          <Scoreboard rows={view.scoreboard} meId={me?.id} />
        </div>
      )}
      {view.phase === 'CANCELLED' && <Banner icon="🛑" title="Host đã huỷ ván" />}
    </div>
  )
}

function PlayInner() {
  const params = useSearchParams()
  const router = useRouter()
  const code = params.get('code')
  const [session, setSession] = useState<StoredSession | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setSession(loadSession(code))
    setReady(true)
  }, [code])

  if (!ready) return null
  if (!code || !/^\d{6}$/.test(code)) {
    return (
      <div className="mx-auto max-w-sm space-y-3">
        <Banner icon="❓" title="Thiếu mã phòng" text="Quét QR hoặc nhập mã 6 số ở trang chủ." />
        <Btn block onClick={() => router.push('/tools/meme-party')}>Về trang chủ</Btn>
      </div>
    )
  }
  if (!session) return <JoinForm code={code} onJoined={setSession} />
  return <PlayerGame session={session} onLeave={() => { clearSession(code); router.push('/tools/meme-party') }} />
}

export default function PlayPage() {
  return (
    <ToolShell name="Meme Party" icon="🎭" description="Người chơi">
      <Suspense fallback={null}>
        <PlayInner />
      </Suspense>
    </ToolShell>
  )
}
