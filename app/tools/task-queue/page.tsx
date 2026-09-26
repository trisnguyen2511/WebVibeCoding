'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ToolShell } from '@/components/tool-shell'

interface ClusterMeta {
  id: string
  name: string
  createdAt: number
  lastAccessed: number
}

const LS_CLUSTERS = 'wv-task-queue-clusters'

function genClusterId(): string {
  return Math.random().toString(36).slice(2, 8)
}

function fmtRelative(ts: number): string {
  const d = Date.now() - ts
  if (d < 60_000) return 'vừa xong'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} phút trước`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} giờ trước`
  return `${Math.floor(d / 86_400_000)} ngày trước`
}

function loadClusters(): ClusterMeta[] {
  try { return JSON.parse(localStorage.getItem(LS_CLUSTERS) ?? '[]') as ClusterMeta[] }
  catch { return [] }
}

function saveClusters(list: ClusterMeta[]) {
  localStorage.setItem(LS_CLUSTERS, JSON.stringify(list))
}

export default function TaskQueuePickerPage() {
  const router = useRouter()
  const [clusters,   setClusters]   = useState<ClusterMeta[]>([])
  const [newName,    setNewName]    = useState('')
  const [joinId,     setJoinId]     = useState('')
  const [joinError,  setJoinError]  = useState('')
  const [joining,    setJoining]    = useState(false)

  useEffect(() => {
    setClusters(loadClusters().sort((a, b) => b.lastAccessed - a.lastAccessed))
  }, [])

  const createCluster = () => {
    const id   = genClusterId()
    const name = newName.trim() || `Cụm ${id}`
    const meta: ClusterMeta = { id, name, createdAt: Date.now(), lastAccessed: Date.now() }
    saveClusters([meta, ...loadClusters()])
    router.push(`/tools/task-queue/${id}`)
  }

  const joinCluster = async () => {
    const id = joinId.trim().toLowerCase()
    if (!id) return
    setJoining(true); setJoinError('')

    // Check localStorage first
    const localRaw = typeof window !== 'undefined' ? localStorage.getItem(`wv-task-queue-${id}`) : null
    if (localRaw) {
      const list = loadClusters()
      const idx  = list.findIndex(c => c.id === id)
      if (idx >= 0) list[idx].lastAccessed = Date.now()
      else list.unshift({ id, name: `Cụm ${id}`, createdAt: Date.now(), lastAccessed: Date.now() })
      saveClusters(list)
      router.push(`/tools/task-queue/${id}`)
      return
    }

    // Try DB
    try {
      const res = await fetch(`/api/task-queue?id=${encodeURIComponent(id)}`)
      if (res.ok) {
        const row = await res.json() as { data?: { name?: string } }
        const name = row.data?.name ?? `Cụm ${id}`
        const list = loadClusters()
        list.unshift({ id, name, createdAt: Date.now(), lastAccessed: Date.now() })
        saveClusters(list)
        router.push(`/tools/task-queue/${id}`)
      } else {
        setJoinError('Không tìm thấy cụm này. Kiểm tra lại ID.')
        setJoining(false)
      }
    } catch {
      setJoinError('Lỗi kết nối. Thử lại sau.')
      setJoining(false)
    }
  }

  const removeCluster = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const list = loadClusters().filter(c => c.id !== id)
    saveClusters(list)
    setClusters(list.sort((a, b) => b.lastAccessed - a.lastAccessed))
  }

  return (
    <ToolShell name="Task Queue" icon="📋" description="Chọn hoặc tạo cụm task để bắt đầu">
      <div className="mx-auto max-w-lg space-y-5 py-2">

        {/* Create */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Tạo cụm mới</p>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createCluster()}
            placeholder="Tên cụm (bỏ trống = tự đặt)"
            className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-fg outline-none placeholder:text-muted focus:border-accent/50 transition-colors"
          />
          <button
            onClick={createCluster}
            className="w-full bg-accent text-white rounded-xl py-2.5 text-sm font-bold hover:opacity-90 hover:shadow-[0_0_20px_#7C3AED44] transition-all active:scale-[0.98]"
          >+ Tạo cụm mới</button>
        </div>

        {/* Join */}
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Tham gia bằng ID</p>
          <div className="flex gap-2">
            <input
              value={joinId}
              onChange={e => { setJoinId(e.target.value); setJoinError('') }}
              onKeyDown={e => e.key === 'Enter' && joinCluster()}
              placeholder="Nhập ID cụm…"
              className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-fg outline-none placeholder:text-muted focus:border-accent/50 transition-colors"
            />
            <button
              onClick={joinCluster}
              disabled={joining || !joinId.trim()}
              className="bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-fg hover:border-accent/50 hover:text-accent-soft transition-all active:scale-95 disabled:opacity-40 whitespace-nowrap"
            >{joining ? '…' : 'Vào →'}</button>
          </div>
          {joinError && <p className="text-xs text-red-400">{joinError}</p>}
        </div>

        {/* Recent */}
        {clusters.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Gần đây</p>
            {clusters.map(c => (
              <button
                key={c.id}
                onClick={() => router.push(`/tools/task-queue/${c.id}`)}
                className="w-full bg-surface border border-border rounded-xl p-3.5 flex items-center gap-3 hover:border-accent/40 transition-all active:scale-[0.99] text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center text-lg flex-shrink-0">🗂</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fg truncate">{c.name}</div>
                  <div className="text-[11px] text-muted font-mono">{c.id} · {fmtRelative(c.lastAccessed)}</div>
                </div>
                <span
                  className="text-muted hover:text-red-400 text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  onClick={e => removeCluster(c.id, e)}
                  title="Xóa khỏi danh sách"
                >✕</span>
                <span className="text-muted text-sm flex-shrink-0">→</span>
              </button>
            ))}
          </div>
        )}

        {clusters.length === 0 && (
          <div className="text-center py-8 text-muted text-sm">
            Chưa có cụm nào — tạo cụm đầu tiên ở trên!
          </div>
        )}
      </div>
    </ToolShell>
  )
}
