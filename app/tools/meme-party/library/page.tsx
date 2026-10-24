'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ToolShell } from '@/components/tool-shell'
import { Banner, Btn, cx } from '@/components/meme-party/parts'
import { ImportHistory, ImportWizard } from '@/components/meme-party/import-ui'
import { LibraryBrowser } from '@/components/meme-party/library-ui'
import { api } from '@/lib/meme-party/client'

type Tab = 'library' | 'images' | 'import' | 'history'
const TABS: [Tab, string][] = [
  ['library', '📚 Thư viện'],
  ['images', '🖼️ Tải nhiều ảnh'],
  ['import', '📥 Import CSV / JSON'],
  ['history', '🗂️ Lịch sử import'],
]

function Login({ configured, onDone }: { configured: boolean; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const res = await api('/api/meme-party/admin/login', { method: 'POST', body: JSON.stringify({ password }) })
    if (res.ok) onDone()
    else setError(res.error)
  }
  if (!configured) {
    return <Banner icon="🔒" tone="warn" title="Quản lý thư viện đang bị khoá" text="Đặt biến môi trường MEME_ADMIN_PASSWORD trên máy chủ để bật trang này." />
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-display text-lg font-semibold text-fg">Quản lý thư viện meme</h2>
      <p className="text-xs text-muted">Chỉ người quản trị nội dung mới vào được. Host phòng chơi không có quyền này.</p>
      <input type="password" autoFocus className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-fg outline-none focus:border-accent" placeholder="Mật khẩu quản trị" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Mật khẩu quản trị" />
      <Btn tone="primary" block type="submit" disabled={!password}>Đăng nhập</Btn>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </form>
  )
}

export default function LibraryPage() {
  const [state, setState] = useState<{ authed: boolean; configured: boolean } | null>(null)
  const [tab, setTab] = useState<Tab>('library')

  const check = async () => {
    const res = await api<{ authed: boolean; configured: boolean }>('/api/meme-party/admin/check')
    setState(res.ok ? res.result : { authed: false, configured: false })
  }
  useEffect(() => { check() }, [])

  async function logout() {
    await api('/api/meme-party/admin/logout', { method: 'POST' })
    check()
  }

  return (
    <ToolShell name="Meme Library" icon="📚" description="Quản lý meme, đề bài và caption cho Meme Party" wide>
      {!state ? null : !state.authed ? (
        <Login configured={state.configured} onDone={check} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={cx('rounded-xl border px-4 py-2 text-sm font-medium transition-colors', tab === id ? 'border-accent bg-accent/10 text-accent-soft' : 'border-border bg-surface text-muted hover:text-fg')}>
                {label}
              </button>
            ))}
            <Link href="/tools/meme-party" className="ml-auto text-xs text-muted underline underline-offset-2 hover:text-fg">← Về game</Link>
            <button onClick={logout} className="text-xs text-muted underline underline-offset-2 hover:text-fg">Đăng xuất</button>
          </div>
          {tab === 'library' && <LibraryBrowser />}
          {tab === 'images' && <ImportWizard mode="images" />}
          {tab === 'import' && <ImportWizard mode="files" />}
          {tab === 'history' && <ImportHistory />}
        </div>
      )}
    </ToolShell>
  )
}
