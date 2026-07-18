'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ToolShell } from '@/components/tool-shell'

interface PlayerGroup {
  id: string
  name: string
  playerNames: string[]
  createdAt: string
}

function namesToText(names: string[]): string {
  return names.join('\n')
}

function parseNamesInput(text: string): string[] {
  return text
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean)
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/werewolf/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) onLoggedIn()
      else setError('Sai mật khẩu')
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-border bg-surface p-5">
      <p className="text-sm font-medium text-fg">Đăng nhập admin</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') login()
        }}
        placeholder="Mật khẩu admin..."
        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={login}
        disabled={!password || loading}
        className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-fg transition-transform active:scale-[0.98] disabled:opacity-40"
      >
        {loading ? 'Đang kiểm tra...' : 'Đăng nhập'}
      </button>
    </div>
  )
}

function AdminPanel() {
  const [groups, setGroups] = useState<PlayerGroup[]>([])
  const [newName, setNewName] = useState('')
  const [newNames, setNewNames] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNames, setEditNames] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/werewolf/groups')
    const data = await res.json()
    if (data.groups) setGroups(data.groups)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createGroup() {
    const parsed = parseNamesInput(newNames)
    if (!newName.trim() || parsed.length === 0) return
    setError('')
    const res = await fetch('/api/werewolf/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), playerNames: parsed }),
    })
    const data = await res.json()
    if (data.error) {
      setError(data.error)
      return
    }
    setNewName('')
    setNewNames('')
    load()
  }

  function startEdit(group: PlayerGroup) {
    setEditingId(group.id)
    setEditName(group.name)
    setEditNames(namesToText(group.playerNames))
  }

  async function saveEdit() {
    if (!editingId) return
    const parsed = parseNamesInput(editNames)
    if (!editName.trim() || parsed.length === 0) return
    await fetch(`/api/werewolf/groups?id=${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), playerNames: parsed }),
    })
    setEditingId(null)
    load()
  }

  async function removeGroup(id: string) {
    if (!window.confirm('Xoá nhóm người chơi này? Không thể hoàn tác.')) return
    await fetch(`/api/werewolf/groups?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-accent/40 bg-surface p-4">
        <p className="text-sm font-medium text-fg">+ Nhóm người chơi mới</p>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Tên nhóm (VD: Nhóm bạn đại học)..."
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent"
        />
        <textarea
          value={newNames}
          onChange={(e) => setNewNames(e.target.value)}
          placeholder={'Mỗi tên 1 dòng...\nAn\nBình\nChi'}
          rows={5}
          className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-fg outline-none focus:border-accent"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={createGroup}
          disabled={!newName.trim() || parseNamesInput(newNames).length === 0}
          className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-fg transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          Tạo nhóm
        </button>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium text-fg">Các nhóm đã lưu ({groups.length})</p>
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-2xl">📋</p>
            <p className="mt-2 text-sm text-muted">Chưa có nhóm nào — tạo nhóm đầu tiên ở trên.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {groups.map((group) => (
              <li key={group.id} className="rounded-xl border border-border bg-surface p-3.5">
                {editingId === group.id ? (
                  <div className="space-y-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-lg border border-accent bg-background px-3 py-2 text-sm text-fg outline-none"
                    />
                    <textarea
                      value={editNames}
                      onChange={(e) => setEditNames(e.target.value)}
                      rows={5}
                      className="w-full resize-none rounded-lg border border-accent bg-background px-3 py-2 text-sm text-fg outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-fg"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-fg"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{group.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {group.playerNames.length} người · {group.playerNames.join(', ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        aria-label={`Sửa ${group.name}`}
                        onClick={() => startEdit(group)}
                        className="h-8 w-8 rounded-lg border border-border text-sm text-muted hover:border-accent/50 hover:text-fg"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        aria-label={`Xoá ${group.name}`}
                        onClick={() => removeGroup(group.id)}
                        className="h-8 w-8 rounded-lg border border-border text-sm text-muted hover:border-red-500/50 hover:text-red-400"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function WerewolfAdminPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/werewolf/admin/check')
      .then((res) => res.json())
      .then((data) => setLoggedIn(!!data.authed))
  }, [])

  return (
    <ToolShell name="Werewolf GM — Admin" icon="🛠️" description="Quản lý nhóm người chơi mặc định">
      <div className="mb-4">
        <Link href="/tools/werewolf-gm" className="text-xs text-muted underline underline-offset-2 hover:text-fg">
          ← Quay lại Werewolf GM
        </Link>
      </div>
      {loggedIn === null ? null : loggedIn ? <AdminPanel /> : <LoginScreen onLoggedIn={() => setLoggedIn(true)} />}
    </ToolShell>
  )
}
