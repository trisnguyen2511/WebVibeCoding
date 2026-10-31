'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { Btn } from '@/components/meme-party/parts'
import { api, saveSession } from '@/lib/meme-party/client'

interface Created {
  roomId: string
  code: string
  hostToken: string
  memberId: string
}
interface Joined {
  memberId: string
  token: string
  role: string
  roomId: string
  code: string
}

export default function MemePartyHome() {
  const router = useRouter()
  const [hostName, setHostName] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [screenCode, setScreenCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createRoom() {
    setBusy(true)
    setError(null)
    const res = await api<Created>('/api/meme-party/rooms', { method: 'POST', body: JSON.stringify({ hostName: hostName || 'Host' }) })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    saveSession({ code: res.result.code, token: res.result.hostToken, memberId: res.result.memberId, name: hostName || 'Host', roomId: res.result.roomId }, 'host')
    router.push(`/tools/meme-party/host?code=${res.result.code}`)
  }

  async function joinRoom() {
    setBusy(true)
    setError(null)
    const res = await api<Joined>('/api/meme-party/rooms/join', { method: 'POST', body: JSON.stringify({ code, name }) })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    saveSession({ code: res.result.code, token: res.result.token, memberId: res.result.memberId, name, roomId: res.result.roomId })
    router.push(`/tools/meme-party/play?code=${res.result.code}`)
  }

  const input = 'w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-fg outline-none placeholder:text-muted focus:border-accent'

  return (
    <ToolShell name="Meme Party" icon="🎭" description="Game meme cho hội bạn — mỗi người một điện thoại, cả nhóm cùng cười">
      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold text-fg">Bạn đang đi chơi cùng bạn bè?</h2>
          <p className="mt-1 text-sm text-muted">
            5–12 người, 10 vòng hỗn hợp Caption / Meme / Reaction. Điện thoại để chọn meme và bình chọn; mở thêm màn hình chung trên TV để cùng xem meme.
          </p>
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
            <h3 className="font-display text-base font-semibold text-fg">🎤 Tạo phòng (làm Host)</h3>
            <p className="text-xs text-muted">Host điều khiển nhịp ván, không tính điểm và không bình chọn.</p>
            <input className={input} placeholder="Tên của bạn (tuỳ chọn)" value={hostName} maxLength={20} onChange={(e) => setHostName(e.target.value)} aria-label="Tên Host" />
            <Btn tone="primary" block disabled={busy} onClick={createRoom}>
              Tạo phòng mới
            </Btn>
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
            <h3 className="font-display text-base font-semibold text-fg">📱 Vào phòng (người chơi)</h3>
            <input className={`${input} font-mono tracking-[0.3em]`} inputMode="numeric" placeholder="Mã phòng 6 số" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Mã phòng" />
            <input className={input} placeholder="Tên hiển thị" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} aria-label="Tên hiển thị" />
            <Btn tone="primary" block disabled={busy || code.length !== 6 || !name.trim()} onClick={joinRoom}>
              Vào chơi
            </Btn>
          </section>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-400/40 bg-surface px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-5">
          <span className="text-sm text-muted">📺 Có TV / máy tính lớn?</span>
          <input className="w-36 rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm tracking-widest text-fg outline-none focus:border-accent" inputMode="numeric" placeholder="Mã phòng" maxLength={6} value={screenCode} onChange={(e) => setScreenCode(e.target.value.replace(/\D/g, ''))} aria-label="Mã phòng cho màn hình chung" />
          <Btn disabled={screenCode.length !== 6} onClick={() => router.push(`/tools/meme-party/screen?code=${screenCode}`)}>
            Mở màn hình chung
          </Btn>
          <Link href="/tools/meme-party/library" className="ml-auto text-xs text-muted underline underline-offset-2 hover:text-fg">
            Quản lý thư viện meme →
          </Link>
        </section>
      </div>
    </ToolShell>
  )
}
