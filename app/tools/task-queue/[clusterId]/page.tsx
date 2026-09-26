'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { ToolShell } from '@/components/tool-shell'

/* ─── Types ─────────────────────────────────────────── */

type TaskState = 'pending' | 'partial' | 'done'

interface Task {
  id: string
  name: string
  state: TaskState
  partialPercent: number
  timerMs: number
  timerRunning: boolean
  createdAt: number
  linkTitles?: Record<string, string>
}

interface ExportPayload {
  version: number
  exportedAt: string
  tasks: Task[]
}

/* ─── Constants ──────────────────────────────────────── */

const LS_CLUSTERS = 'wv-task-queue-clusters'

interface ClusterMeta { id: string; name: string; createdAt: number; lastAccessed: number }

function fmtRelative(ts: number): string {
  const d = Date.now() - ts
  if (d < 60_000) return 'vừa xong'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} phút trước`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} giờ trước`
  return `${Math.floor(d / 86_400_000)} ngày trước`
}

const SHORTCUT_GROUPS = [
  {
    label: 'Task được chọn',
    items: [
      { key: 'R',       desc: 'Đổi tên' },
      { key: 'D',       desc: 'Đánh dấu hoàn thành' },
      { key: 'P',       desc: 'Hoàn thành một phần' },
      { key: 'T',       desc: 'Bắt đầu / dừng bấm giờ' },
      { key: 'Del',     desc: 'Xóa task' },
    ],
  },
  {
    label: 'Khi đang nhập',
    items: [
      { key: 'Enter',  desc: 'Lưu' },
      { key: 'Esc',    desc: 'Hủy' },
    ],
  },
  {
    label: 'Di chuyển',
    items: [
      { key: '↑ ↓',     desc: 'Chọn task trên / dưới' },
      { key: 'Ctrl+↑↓', desc: 'Dời task lên / xuống hàng đợi' },
      { key: '1–9',      desc: 'Chọn nhanh task số 1–9 trong hàng đợi' },
    ],
  },
  {
    label: 'Toàn cục',
    items: [
      { key: 'N',   desc: 'Thêm task mới (focus input)' },
      { key: 'F',   desc: 'Tìm kiếm / lọc task' },
      { key: 'S',   desc: 'Sync lên DB' },
      { key: 'Esc', desc: 'Thoát input / đóng panel (kích hoạt shortcut ngay)' },
      { key: '?',   desc: 'Hiện / ẩn shortcuts' },
    ],
  },
]

/* ─── Helpers ────────────────────────────────────────── */

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function fmtTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':')
}

function extractUrls(text: string): string[] {
  return Array.from(text.matchAll(/https?:\/\/[^\s]+/g), m => m[0])
}

function renderTaskName(
  name: string,
  linkTitles: Record<string, string> | undefined,
  isDone: boolean,
) {
  const re = /https?:\/\/[^\s]+/g
  const nodes: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(name)) !== null) {
    if (m.index > last) nodes.push(<span key={`t${last}`}>{name.slice(last, m.index)}</span>)
    const url = m[0]
    const title = linkTitles?.[url]
    let label: string
    try { label = title || new URL(url).hostname } catch { label = url.slice(0, 40) }
    nodes.push(
      <a
        key={`l${m.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md no-underline ${
          isDone
            ? 'bg-border/20 text-muted border border-border/30'
            : 'bg-accent/10 border border-accent/25 text-accent-soft hover:bg-accent/20 hover:border-accent/50'
        } transition-all`}
        onClick={e => e.stopPropagation()}
      >
        <span>🔗</span>
        <span className="max-w-[200px] truncate font-medium">{label}</span>
        <span className="opacity-50 text-[9px]">↗</span>
      </a>
    )
    last = m.index + url.length
  }
  if (last < name.length) nodes.push(<span key={`t${last}`}>{name.slice(last)}</span>)
  return nodes.length > 0 ? <>{nodes}</> : name
}

/* ─── TaskRow sub-component ──────────────────────────── */

interface TaskRowProps {
  task: Task
  queueIdx: number
  isSelected: boolean
  isDragOver: boolean
  isNew: boolean
  isRemoving: boolean
  isEditing: boolean
  editName: string
  isPartialOpen: boolean
  editInputRef: React.RefObject<HTMLTextAreaElement | null>
  onSelect: () => void
  onSetEditName: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onToggleTimer: () => void
  onSetState: (state: TaskState, pct?: number) => void
  onRemove: () => void
  onRestore: () => void
  onOpenPartial: () => void
  onClosePartial: () => void
  onSetPartialPct: (pct: number) => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
}

function TaskRow({
  task, queueIdx, isSelected, isDragOver, isNew, isRemoving,
  isEditing, editName, isPartialOpen,
  editInputRef,
  onSelect, onSetEditName, onSaveEdit, onCancelEdit,
  onToggleTimer, onSetState, onRemove, onRestore,
  onOpenPartial, onClosePartial, onSetPartialPct,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: TaskRowProps) {
  const isDone    = task.state === 'done'
  const isPartial = task.state === 'partial'
  const isFirst   = queueIdx === 0 && !isDone

  const wrapCls = [
    isNew      ? 'animate-task-in'  : '',
    isRemoving ? 'animate-task-out' : '',
  ].filter(Boolean).join(' ')

  const cardCls = [
    'relative bg-surface border rounded-xl p-2.5 flex items-center gap-2',
    'cursor-pointer select-none transition-all duration-200',
    isDragOver ? 'border-accent shadow-[0_0_0_2px_#7C3AED33] scale-[1.01]' :
    isSelected  ? 'border-accent/60 shadow-[0_0_0_1px_#7C3AED22]' :
    isFirst     ? 'border-accent/40 animate-active-pulse' :
    isPartial   ? 'border-orange-500/30' :
    isDone      ? 'border-border opacity-55' :
    'border-border hover:border-overlay/40',
  ].join(' ')

  const badgeCls = [
    'w-[22px] h-[22px] rounded-md flex items-center justify-center',
    'font-mono text-[10px] font-bold flex-shrink-0 transition-all duration-300',
    isDone    ? 'bg-emerald-500/20 text-emerald-400' :
    isPartial ? 'bg-orange-500/20 text-orange-400' :
    isFirst   ? 'bg-accent text-white shadow-[0_0_10px_#7C3AED66]' :
    'bg-accent/15 text-accent-soft',
  ].join(' ')

  return (
    <div className={wrapCls}>
      {/* Card */}
      <div
        className={cardCls}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onClick={onSelect}
      >
        {/* Drag handle */}
        <span className="text-muted opacity-40 hover:opacity-100 cursor-grab text-base leading-none flex-shrink-0 transition-opacity">
          ⠿
        </span>

        {/* Badge */}
        <div className={badgeCls}>
          {isDone ? '✓' : isPartial ? '◑' : queueIdx + 1}
        </div>

        {/* Name / edit textarea */}
        {isEditing ? (
          <textarea
            ref={editInputRef as React.Ref<HTMLTextAreaElement>}
            className="flex-1 min-w-0 bg-background border border-accent/60 rounded-md px-2 py-1 text-sm text-fg outline-none resize-none leading-snug"
            value={editName}
            rows={Math.max(1, editName.split('\n').length)}
            onChange={e => onSetEditName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit() }
              if (e.key === 'Escape') { e.preventDefault(); onCancelEdit() }
            }}
            onBlur={onSaveEdit}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <div className="relative flex-1 min-w-0 group/taskname">
            <span className={`block line-clamp-3 text-sm leading-snug whitespace-pre-wrap transition-colors duration-200 ${isDone ? 'line-through text-muted' : 'text-fg'}`}>
              {renderTaskName(task.name, task.linkTitles, isDone)}
            </span>
            {/* Hover tooltip — shows full text */}
            <div className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-50 opacity-0 scale-95 group-hover/taskname:opacity-100 group-hover/taskname:scale-100 transition-all duration-150 ease-out bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-fg whitespace-pre-wrap shadow-2xl shadow-black/60 w-max max-w-[min(300px,calc(100vw-48px))] leading-relaxed">
              {task.name}
            </div>
          </div>
        )}

        {/* Partial % label */}
        {isPartial && !isEditing && (
          <span className="text-[10px] font-semibold text-orange-400 bg-orange-500/15 rounded px-1.5 py-0.5 flex-shrink-0 font-mono">
            ~{task.partialPercent}%
          </span>
        )}

        {/* Timer (queue only) */}
        {!isEditing && !isDone && (
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <span className={`font-mono text-[11px] min-w-[52px] text-right tabular-nums ${task.timerRunning ? 'text-emerald-400 animate-timer-glow' : 'text-muted'}`}>
              {fmtTime(task.timerMs)}
            </span>
            <button
              className={`w-[22px] h-[22px] rounded-full border flex items-center justify-center text-[9px] transition-all duration-200 ${
                task.timerRunning
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/15 shadow-[0_0_8px_#10B98144]'
                  : 'border-border text-muted hover:border-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10'
              }`}
              title={task.timerRunning ? 'Dừng (T)' : 'Bấm giờ (T)'}
              onClick={onToggleTimer}
            >
              {task.timerRunning ? '⏸' : '▶'}
            </button>
          </div>
        )}

        {/* Done — show recorded time */}
        {isDone && task.timerMs > 0 && (
          <span className="font-mono text-[11px] text-muted flex-shrink-0">{fmtTime(task.timerMs)}</span>
        )}

        {/* Separator */}
        {!isEditing && <div className="w-px h-4 bg-border flex-shrink-0" />}

        {/* Actions */}
        {isEditing ? (
          <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button
              className="text-xs bg-accent text-white px-2.5 py-1 rounded-md font-medium hover:opacity-85 hover:shadow-[0_0_10px_#7C3AED66] transition-all active:scale-95"
              onClick={onSaveEdit}
            >↵ Lưu</button>
            <button
              className="text-xs bg-surface border border-border text-muted px-2.5 py-1 rounded-md font-medium hover:text-fg transition-colors"
              onClick={onCancelEdit}
            >Esc</button>
          </div>
        ) : isDone ? (
          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border border-accent/30 text-accent-soft bg-accent/10 hover:bg-accent/20 hover:border-accent/60 transition-all active:scale-95"
              title="Đưa task lên đầu hàng đợi"
              onClick={onRestore}
            >
              ↑ Khôi phục
            </button>
            <button className="p-1.5 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-all text-sm" title="Xóa" onClick={onRemove}>🗑</button>
          </div>
        ) : (
          <div className="flex gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button className="p-1.5 rounded-md text-muted hover:text-accent-soft hover:bg-accent/10 transition-all text-sm" title="Đổi tên (R)" onClick={e => { e.stopPropagation(); onCancelEdit(); setTimeout(() => editInputRef.current?.select(), 10) }}>✏️</button>
            <button className={`p-1.5 rounded-md transition-all text-sm ${isPartial ? 'text-orange-400 bg-orange-500/10' : 'text-muted hover:text-orange-400 hover:bg-orange-500/10'}`} title="Một phần (P)" onClick={e => { e.stopPropagation(); onOpenPartial() }}>◑</button>
            <button className="p-1.5 rounded-md text-muted hover:text-emerald-400 hover:bg-emerald-500/10 transition-all text-sm" title="Xong (D)" onClick={e => { e.stopPropagation(); onSetState('done') }}>✅</button>
            <button className="p-1.5 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-all text-sm" title="Xóa (Del)" onClick={e => { e.stopPropagation(); onRemove() }}>🗑</button>
          </div>
        )}

        {/* Progress bar for partial */}
        {isPartial && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-xl bg-border overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-[width] duration-700 ease-out"
              style={{ width: `${task.partialPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Partial % picker */}
      {isPartialOpen && (
        <div
          className="mt-1 bg-surface border border-orange-500/30 rounded-xl p-3 animate-panel-in"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-[11px] text-muted mb-2 font-semibold uppercase tracking-wider">Hoàn thành bao nhiêu %?</div>
          <div className="flex gap-1.5 mb-2.5">
            {[25, 50, 75].map(p => (
              <button
                key={p}
                className="text-xs px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/15 transition-all font-mono font-semibold"
                onClick={() => onSetState('partial', p)}
              >{p}%</button>
            ))}
          </div>
          <input
            type="range" min={5} max={95} step={5}
            value={task.partialPercent}
            className="w-full accent-orange-500 cursor-pointer"
            onChange={e => onSetPartialPct(Number(e.target.value))}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="font-mono text-orange-400 text-sm font-semibold">{task.partialPercent}%</span>
            <div className="flex gap-1.5">
              <button
                className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-85 active:scale-95 transition-all"
                onClick={() => onSetState('partial', task.partialPercent)}
              >Xác nhận</button>
              <button
                className="text-xs border border-border text-muted px-3 py-1.5 rounded-lg hover:text-fg transition-colors"
                onClick={onClosePartial}
              >Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Page ──────────────────────────────────────�����────── */

export default function TaskQueuePage() {
  const params    = useParams()
  const clusterId = typeof params.clusterId === 'string' ? params.clusterId : ''
  const LS_KEY    = `wv-task-queue-${clusterId}`

  const [tasks,       setTasks]       = useState<Task[]>([])
  const [clusterName, setClusterName] = useState('')
  const [syncing,     setSyncing]     = useState(false)
  const [lastSynced,  setLastSynced]  = useState<number | null>(null)
  const [syncMsg,     setSyncMsg]     = useState('')
  const [newName,     setNewName]     = useState('')
  const [editId,      setEditId]      = useState<string | null>(null)
  const [editName,    setEditName]    = useState('')
  const [insertAfter, setInsertAfter] = useState<number | null>(null)
  const [insertName,  setInsertName]  = useState('')
  const [showDone,    setShowDone]    = useState(true)
  const [showKeys,    setShowKeys]    = useState(false)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [dragOverId,  setDragOverId]  = useState<string | null>(null)
  const [partialId,   setPartialId]   = useState<string | null>(null)
  const [newIds,      setNewIds]      = useState<Set<string>>(new Set())
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [statKey,     setStatKey]     = useState(0)
  const [filterOpen,  setFilterOpen]  = useState(false)
  const [filterQuery, setFilterQuery] = useState('')

  const dragIdRef      = useRef<string | null>(null)
  const lastTickRef    = useRef<number>(Date.now())
  const addInputRef    = useRef<HTMLTextAreaElement>(null)
  const editInputRef   = useRef<HTMLTextAreaElement>(null)
  const insertInputRef = useRef<HTMLTextAreaElement>(null)
  const filterInputRef = useRef<HTMLInputElement>(null)
  const prevStats      = useRef({ pending: 0, partial: 0, done: 0 })
  const taskRowRefs    = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!selectedId) return
    const frame = requestAnimationFrame(() => {
      const row = taskRowRefs.current.get(selectedId)
      if (!row) return

      const rect = row.getBoundingClientRect()
      const edgePadding = 16
      const selectedIndex = queue.findIndex((task) => task.id === selectedId)
      const contextTask = queue[Math.max(0, selectedIndex - 2)]
      const contextRow = contextTask ? taskRowRefs.current.get(contextTask.id) : null
      const contextRect = contextRow?.getBoundingClientRect()
      const isSelectedVisible = rect.top >= edgePadding && rect.bottom <= window.innerHeight - edgePadding
      const hasContextAbove = !contextRect || contextRect.top >= edgePadding
      const hasContextBelow = !contextRect || contextRect.bottom <= window.innerHeight - edgePadding

      // Keep two preceding tasks visible when possible, while avoiding unnecessary scrolling.
      if (!isSelectedVisible || !hasContextAbove || !hasContextBelow) {
        ;(contextRow ?? row).scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedId])

  /* ── Load / Save ───────────────────────────────────── */

  useEffect(() => {
    if (!clusterId) return
    // Load cluster name from meta
    try {
      const metas = JSON.parse(localStorage.getItem(LS_CLUSTERS) ?? '[]') as ClusterMeta[]
      const meta = metas.find(m => m.id === clusterId)
      if (meta) {
        setClusterName(meta.name)
        meta.lastAccessed = Date.now()
        localStorage.setItem(LS_CLUSTERS, JSON.stringify(metas))
      }
    } catch { /* ignore */ }

    // Load tasks from localStorage; if empty, try cloud pull
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      try { setTasks((JSON.parse(raw) as Task[]).map(t => ({ ...t, timerRunning: false }))) }
      catch { /* ignore */ }
    } else {
      // Auto-pull from cloud on first visit
      fetch(`/api/task-queue?id=${encodeURIComponent(clusterId)}`)
        .then(r => r.ok ? r.json() : null)
        .then((row: { data?: { tasks?: Task[]; name?: string }; synced_at?: string } | null) => {
          if (!row?.data) return
          if (Array.isArray(row.data.tasks)) {
            setTasks(row.data.tasks.map((t: Task) => ({ ...t, timerRunning: false })))
          }
          if (row.data.name) setClusterName(row.data.name)
          if (row.synced_at) setLastSynced(new Date(row.synced_at).getTime())
        })
        .catch(() => {/* ignore */})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId])

  useEffect(() => {
    if (!clusterId) return
    localStorage.setItem(LS_KEY, JSON.stringify(tasks))
    // Update task count in cluster meta
    try {
      const metas = JSON.parse(localStorage.getItem(LS_CLUSTERS) ?? '[]') as ClusterMeta[]
      const meta = metas.find(m => m.id === clusterId)
      if (meta) {
        meta.lastAccessed = Date.now()
        localStorage.setItem(LS_CLUSTERS, JSON.stringify(metas))
      }
    } catch { /* ignore */ }
  }, [tasks, clusterId, LS_KEY])

  /* ── Timer tick ────────────────────────────────────── */

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      const delta = now - lastTickRef.current
      lastTickRef.current = now
      setTasks(prev => {
        if (!prev.some(t => t.timerRunning)) return prev
        return prev.map(t => t.timerRunning ? { ...t, timerMs: t.timerMs + delta } : t)
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  /* ── Derived ───────────────────────────────────────── */

  const queue    = useMemo(() => tasks.filter(t => t.state !== 'done'), [tasks])
  const doneList = useMemo(() => tasks.filter(t => t.state === 'done'),  [tasks])

  const fq = filterQuery.trim().toLowerCase()
  const filteredQueue    = useMemo(() => fq ? queue.filter(t => t.name.toLowerCase().includes(fq)) : queue, [queue, fq])
  const filteredDoneList = useMemo(() => fq ? doneList.filter(t => t.name.toLowerCase().includes(fq)) : doneList, [doneList, fq])
  const stats    = useMemo(() => ({
    pending: tasks.filter(t => t.state === 'pending').length,
    partial: tasks.filter(t => t.state === 'partial').length,
    done:    doneList.length,
  }), [tasks, doneList.length])

  useEffect(() => {
    const p = prevStats.current
    if (p.pending !== stats.pending || p.partial !== stats.partial || p.done !== stats.done) {
      setStatKey(k => k + 1)
      prevStats.current = stats
    }
  }, [stats])

  /* ── Link preview ─────────────────────────────────── */

  const fetchLinkTitles = useCallback(async (taskId: string, name: string) => {
    const urls = extractUrls(name)
    if (urls.length === 0) return
    for (const url of urls) {
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        if (!res.ok) continue
        const data = await res.json() as { title?: string }
        const title = data.title?.trim()
        if (!title) continue
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, linkTitles: { ...t.linkTitles, [url]: title } } : t
        ))
      } catch { /* ignore */ }
    }
  }, [])

  /* ── Mutations ─────────────────────────────────────── */

  const flashNew = (id: string) => {
    setNewIds(prev => new Set(prev).add(id))
    setTimeout(() => setNewIds(prev => { const s = new Set(prev); s.delete(id); return s }), 500)
  }

  const addTask = useCallback((name: string, afterQueueIdx?: number) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = genId()
    const task: Task = { id, name: trimmed, state: 'pending', partialPercent: 50, timerMs: 0, timerRunning: false, createdAt: Date.now() }
    flashNew(id)
    setTasks(prev => {
      const q = prev.filter(t => t.state !== 'done')
      const d = prev.filter(t => t.state === 'done')
      if (afterQueueIdx !== undefined) q.splice(afterQueueIdx + 1, 0, task)
      else q.push(task)
      return [...q, ...d]
    })
    setNewName('')
    setInsertName('')
    setInsertAfter(null)
    fetchLinkTitles(id, trimmed)
  }, [fetchLinkTitles])

  const removeTask = useCallback((id: string) => {
    setRemovingIds(prev => new Set(prev).add(id))
    setTimeout(() => {
      setTasks(prev => prev.filter(t => t.id !== id))
      setRemovingIds(prev => { const s = new Set(prev); s.delete(id); return s })
      setSelectedId(sel => sel === id ? null : sel)
    }, 280)
  }, [])

  const setTaskState = useCallback((id: string, state: TaskState, pct?: number) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, state, partialPercent: pct ?? t.partialPercent, timerRunning: false } : t
    ))
    setPartialId(null)
  }, [])

  const setPartialPct = useCallback((id: string, pct: number) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, partialPercent: pct } : t))
  }, [])

  const restoreTask = useCallback((id: string) => {
    setTasks(prev => {
      const task = prev.find(t => t.id === id)
      if (!task) return prev
      const q = prev.filter(t => t.state !== 'done')
      const d = prev.filter(t => t.state === 'done' && t.id !== id)
      return [{ ...task, state: 'pending' as TaskState }, ...q, ...d]
    })
  }, [])

  const toggleTimer = useCallback((id: string) => {
    lastTickRef.current = Date.now()
    setTasks(prev => prev.map(t => t.id === id ? { ...t, timerRunning: !t.timerRunning } : t))
  }, [])

  const startEdit = useCallback((task: Task) => {
    setEditId(task.id)
    setEditName(task.name)
    setTimeout(() => editInputRef.current?.select(), 30)
  }, [])

  const saveEdit = useCallback(() => {
    if (!editId) return
    const trimmed = editName.trim()
    if (trimmed) {
      setTasks(prev => prev.map(t => t.id === editId ? { ...t, name: trimmed } : t))
      fetchLinkTitles(editId, trimmed)
    }
    setEditId(null)
  }, [editId, editName, fetchLinkTitles])

  const moveTask = useCallback((id: string, dir: -1 | 1) => {
    setTasks(prev => {
      const arr = [...prev]
      const i = arr.findIndex(t => t.id === id)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= arr.length) return prev
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return arr
    })
  }, [])

  /* ── Drag ──────────────────────────────────────────── */

  const onDragStart = useCallback((id: string) => { dragIdRef.current = id }, [])
  const onDragOver  = useCallback((e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id) }, [])
  const onDrop      = useCallback((targetId: string) => {
    const fromId = dragIdRef.current
    if (!fromId || fromId === targetId) { setDragOverId(null); return }
    setTasks(prev => {
      const arr = [...prev]
      const fi = arr.findIndex(t => t.id === fromId)
      const ti = arr.findIndex(t => t.id === targetId)
      if (fi < 0 || ti < 0) return prev
      const [item] = arr.splice(fi, 1)
      arr.splice(ti, 0, item)
      return arr
    })
    setDragOverId(null)
    dragIdRef.current = null
  }, [])
  const onDragEnd = useCallback(() => { setDragOverId(null); dragIdRef.current = null }, [])

  /* ── Export / Import ───────────────────────────────── */

  const exportJSON = useCallback(() => {
    const payload: ExportPayload = { version: 1, exportedAt: new Date().toISOString(), tasks }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `task-queue-${Date.now()}.json`; a.click()
    URL.revokeObjectURL(url)
  }, [tasks])

  const importJSON = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev: ProgressEvent<FileReader>) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string) as ExportPayload
          if (Array.isArray(parsed.tasks)) {
            setTasks(parsed.tasks.map(t => ({ ...t, timerRunning: false })))
          }
        } catch { /* ignore malformed */ }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [])

  /* ── Cloud sync ───────────────────────────────────── */

  const syncToCloud = useCallback(async () => {
    if (!clusterId || syncing) return
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/task-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clusterId, data: { tasks, name: clusterName } }),
      })
      if (res.ok) { setLastSynced(Date.now()); setSyncMsg('✓') }
      else { setSyncMsg('Lỗi sync') }
    } catch { setSyncMsg('Lỗi kết nối') }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 3000)
  }, [clusterId, tasks, clusterName, syncing])

  const pullFromCloud = useCallback(async () => {
    if (!clusterId || syncing) return
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch(`/api/task-queue?id=${encodeURIComponent(clusterId)}`)
      if (res.ok) {
        const row = await res.json() as { data?: { tasks?: Task[]; name?: string }; synced_at?: string }
        if (Array.isArray(row.data?.tasks)) {
          setTasks(row.data!.tasks.map((t: Task) => ({ ...t, timerRunning: false })))
        }
        if (row.data?.name) setClusterName(row.data.name)
        if (row.synced_at) setLastSynced(new Date(row.synced_at).getTime())
        setSyncMsg('✓ Đã kéo')
      } else {
        setSyncMsg('Không tìm thấy trên DB')
      }
    } catch { setSyncMsg('Lỗi kết nối') }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 3000)
  }, [clusterId, syncing])

  /* ── Keyboard shortcuts ────────────────────────────── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement).matches('input, textarea')
      if (e.key === '?') { e.preventDefault(); setShowKeys(p => !p); return }
      if (e.key === 'Escape') {
        setShowKeys(false); setEditId(null); setInsertAfter(null); setPartialId(null)
        setFilterOpen(false); setFilterQuery('')
        if (isInput) { (e.target as HTMLElement).blur(); return }
        return
      }
      if (isInput) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); addInputRef.current?.focus(); return }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        setFilterOpen(true)
        setTimeout(() => filterInputRef.current?.focus(), 30)
        return
      }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); syncToCloud(); return }
      // 1–9: select queue task by position
      const digit = e.key === '0' ? 10 : Number(e.key)
      if (digit >= 1 && digit <= 10) {
        const target = queue[digit - 1]
        if (target) { e.preventDefault(); setSelectedId(target.id) }
        return
      }
      if (!selectedId) return
      const task = tasks.find(t => t.id === selectedId)
      if (!task) return
      switch (e.key.toLowerCase()) {
        case 'r': e.preventDefault(); startEdit(task); break
        case 'd': e.preventDefault(); setTaskState(selectedId, 'done'); break
        case 'p': e.preventDefault(); setPartialId(selectedId); break
        case 't': e.preventDefault(); toggleTimer(selectedId); break
        case 'delete': e.preventDefault(); removeTask(selectedId); break
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const ids = queue.map(t => t.id)
        const i   = ids.indexOf(selectedId)
        setSelectedId(ids[Math.min(i + 1, ids.length - 1)] ?? null)
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const ids = queue.map(t => t.id)
        const i   = ids.indexOf(selectedId)
        setSelectedId(ids[Math.max(i - 1, 0)] ?? null)
      }
      if (e.ctrlKey && e.key === 'ArrowDown') { e.preventDefault(); moveTask(selectedId, 1) }
      if (e.ctrlKey && e.key === 'ArrowUp')   { e.preventDefault(); moveTask(selectedId, -1) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, tasks, queue, startEdit, setTaskState, toggleTimer, removeTask, moveTask, syncToCloud])

  /* ─── Render ──────────────────────────────────────�� */

  return (
    <ToolShell name="Task Queue" icon="📋" description="Sắp xếp & theo dõi công việc theo hàng đợi">

      {/* Custom keyframe animations */}
      <style>{`
        @keyframes task-in {
          from { opacity:0; transform:translateY(-10px) scale(0.96); }
          to   { opacity:1; transform:translateY(0)     scale(1); }
        }
        @keyframes task-out {
          from { opacity:1; transform:translateX(0)   scale(1);    max-height:100px; padding-top:10px; padding-bottom:10px; }
          to   { opacity:0; transform:translateX(18px) scale(0.95); max-height:0;    padding-top:0;    padding-bottom:0; }
        }
        @keyframes modal-in {
          from { opacity:0; transform:scale(0.92) translateY(10px); }
          to   { opacity:1; transform:scale(1)    translateY(0); }
        }
        @keyframes backdrop-in { from{opacity:0} to{opacity:1} }
        @keyframes active-pulse {
          0%,100% { box-shadow: 0 0 0 1px #7C3AED22, 0 0 14px #7C3AED11; }
          50%      { box-shadow: 0 0 0 1px #7C3AED55, 0 0 28px #7C3AED22; }
        }
        @keyframes timer-glow {
          0%,100% { text-shadow: 0 0 6px #10B98166; }
          50%      { text-shadow: 0 0 18px #10B981cc; }
        }
        @keyframes stat-bounce {
          0%  { transform: scale(1); }
          40% { transform: scale(1.14); }
          100%{ transform: scale(1); }
        }
        .animate-task-in    { animation: task-in    0.36s cubic-bezier(0.34,1.56,0.64,1) both; }
        .animate-task-out   { animation: task-out   0.28s ease-in both; overflow:hidden; pointer-events:none; }
        .animate-modal-in   { animation: modal-in   0.25s cubic-bezier(0.34,1.3,0.64,1) both; }
        .animate-backdrop   { animation: backdrop-in 0.2s ease both; }
        .animate-active-pulse { animation: active-pulse 3s ease-in-out infinite; }
        .animate-timer-glow { animation: timer-glow 2s ease-in-out infinite; }
        .animate-stat-bounce{ animation: stat-bounce 0.38s cubic-bezier(0.34,1.56,0.64,1); }
      `}</style>

      <div className="w-full max-w-[900px] mx-auto space-y-3 pb-12">

        {/* ── Cluster header ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-fg truncate max-w-[200px]">{clusterName}</span>
          <button
            className="font-mono text-[11px] text-muted bg-background border border-border rounded-md px-2 py-0.5 hover:text-fg hover:border-accent/40 transition-all active:scale-95 flex-shrink-0"
            title="Click để copy ID"
            onClick={() => navigator.clipboard.writeText(clusterId).then(() => setSyncMsg('Copied!'))}
          >{clusterId}</button>
          <div className="flex-1" />
          {syncMsg && <span className={`text-[11px] font-medium ${syncMsg.startsWith('✓') || syncMsg === 'Copied!' ? 'text-emerald-400' : 'text-red-400'}`}>{syncMsg}</span>}
          {lastSynced && !syncMsg && <span className="text-[11px] text-muted hidden sm:block">synced {fmtRelative(lastSynced)}</span>}
          <button
            onClick={pullFromCloud}
            disabled={syncing}
            className="text-[12px] text-muted border border-border bg-surface rounded-lg px-2.5 py-1.5 hover:text-accent-soft hover:border-accent/40 transition-all active:scale-95 disabled:opacity-40 flex-shrink-0"
            title="Kéo từ DB"
          >{syncing ? '…' : '⬇ Pull'}</button>
          <button
            onClick={syncToCloud}
            disabled={syncing}
            className="text-[12px] text-accent-soft border border-accent/30 bg-accent/10 rounded-lg px-2.5 py-1.5 hover:bg-accent/20 hover:border-accent/60 transition-all active:scale-95 disabled:opacity-40 flex-shrink-0"
            title="Đẩy lên DB (S)"
          >{syncing ? '…' : '☁ Sync'}</button>
        </div>

        {/* ── Stats cards ── */}
        <div className="grid grid-cols-3 gap-2">
          {([
            { label: 'Đang chờ', count: stats.pending, icon: '⏳', color: 'text-accent-soft',  grad: 'from-accent to-accent-soft' },
            { label: 'Một phần', count: stats.partial, icon: '◑',  color: 'text-orange-400',   grad: 'from-orange-500 to-amber-400' },
            { label: 'Xong',     count: stats.done,    icon: '✓',  color: 'text-emerald-400',  grad: 'from-emerald-500 to-teal-400' },
          ] as const).map(({ label, count, icon, color, grad }) => (
            <div
              key={label}
              className={`relative bg-surface border border-border rounded-xl p-3 overflow-hidden ${statKey ? 'animate-stat-bounce' : ''}`}
            >
              <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${grad}`} />
              <div className={`absolute right-3 top-3 text-xl opacity-20`}>{icon}</div>
              <div className={`font-mono text-2xl font-semibold ${color} leading-none mb-0.5`}>{count}</div>
              <div className="text-[11px] text-muted uppercase tracking-wider font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Action row ── */}
        <div className="flex gap-2">
          <button onClick={exportJSON} className="text-[12px] text-muted border border-border bg-surface rounded-lg px-3 py-1.5 hover:text-fg hover:border-overlay/30 transition-all active:scale-95">
            📤 Export
          </button>
          <button onClick={importJSON} className="text-[12px] text-muted border border-border bg-surface rounded-lg px-3 py-1.5 hover:text-fg hover:border-overlay/30 transition-all active:scale-95">
            📥 Import
          </button>
          <div className="flex-1" />
          <button onClick={() => setTasks(p => p.filter(t => t.state !== 'done'))} className="text-[12px] text-red-400/60 border border-red-500/20 bg-surface rounded-lg px-3 py-1.5 hover:text-red-400 hover:border-red-500/40 transition-all active:scale-95">
            🗑 Xóa done
          </button>
        </div>

        {/* ── Add form ── */}
        <div className="flex gap-2 bg-surface border border-border rounded-xl px-3 py-2 items-start focus-within:border-accent/50 transition-colors duration-200">
          <textarea
            ref={addInputRef}
            className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted resize-none leading-snug pt-0.5"
            placeholder="Nhập tên task mới… (Enter thêm · Shift+Enter xuống dòng)"
            value={newName}
            rows={Math.max(1, newName.split('\n').length)}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTask(newName) }
            }}
          />
          <button
            className="bg-accent text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 hover:shadow-[0_0_14px_#7C3AED66] transition-all active:scale-95 flex-shrink-0 mt-0.5"
            onClick={() => addTask(newName)}
          >+ Thêm</button>
        </div>

        {/* ── Filter bar ── */}
        {filterOpen && (
          <div className="flex gap-2 items-center bg-surface border border-accent/40 rounded-xl px-3 py-2 animate-panel-in">
            <span className="text-accent-soft text-sm flex-shrink-0">🔍</span>
            <input
              ref={filterInputRef}
              value={filterQuery}
              onChange={e => setFilterQuery(e.target.value)}
              placeholder="Tìm task… (Esc để đóng)"
              className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
              onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); setFilterOpen(false); setFilterQuery(''); (e.target as HTMLElement).blur() }
              }}
            />
            {filterQuery
              ? <span className="text-[11px] text-muted font-mono flex-shrink-0">{filteredQueue.length + filteredDoneList.length} kết quả</span>
              : <span className="text-[11px] text-muted flex-shrink-0">nhấn Esc để đóng</span>
            }
            <button
              className="text-muted hover:text-fg transition-colors text-sm flex-shrink-0"
              onClick={() => { setFilterOpen(false); setFilterQuery('') }}
            >✕</button>
          </div>
        )}

        {/* ── Queue label ── */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider whitespace-nowrap">
            {fq ? `Kết quả (${filteredQueue.length})` : `Hàng đợi (${queue.length})`}
          </span>
          <div className="flex-1 h-px bg-border" />
          {!filterOpen && (
            <button
              className="text-[11px] text-muted hover:text-accent-soft transition-colors flex-shrink-0"
              title="Tìm kiếm (F)"
              onClick={() => { setFilterOpen(true); setTimeout(() => filterInputRef.current?.focus(), 30) }}
            >🔍</button>
          )}
        </div>

        {/* ── Queue list ── */}
        {filteredQueue.length === 0 ? (
          <div className="text-center py-10 text-muted border border-dashed border-border rounded-xl animate-panel-in">
            <div className="text-3xl mb-2">{fq ? '🔍' : '📭'}</div>
            <div className="text-sm">{fq ? `Không tìm thấy task nào khớp với "${filterQuery}"` : 'Chưa có task nào — thêm ở trên!'}</div>
          </div>
        ) : (
          <div>
            {filteredQueue.map((task, idx) => (
              <div
                key={task.id}
                ref={(node) => {
                  if (node) taskRowRefs.current.set(task.id, node)
                  else taskRowRefs.current.delete(task.id)
                }}
              >
                <TaskRow
                  task={task}
                  queueIdx={fq ? queue.indexOf(task) : idx}
                  isSelected={selectedId === task.id}
                  isDragOver={dragOverId === task.id}
                  isNew={newIds.has(task.id)}
                  isRemoving={removingIds.has(task.id)}
                  isEditing={editId === task.id}
                  editName={editName}
                  isPartialOpen={partialId === task.id}
                  editInputRef={editInputRef}
                  onSelect={() => setSelectedId(selectedId === task.id ? null : task.id)}
                  onSetEditName={setEditName}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditId(null)}
                  onToggleTimer={() => toggleTimer(task.id)}
                  onSetState={(state, pct) => setTaskState(task.id, state, pct)}
                  onRemove={() => removeTask(task.id)}
                  onRestore={() => restoreTask(task.id)}
                  onOpenPartial={() => setPartialId(task.id)}
                  onClosePartial={() => setPartialId(null)}
                  onSetPartialPct={pct => setPartialPct(task.id, pct)}
                  onDragStart={() => onDragStart(task.id)}
                  onDragOver={e => onDragOver(e, task.id)}
                  onDrop={() => onDrop(task.id)}
                  onDragEnd={onDragEnd}
                />

                {/* Insert between — only when not filtering */}
                {!fq && idx < filteredQueue.length - 1 && (
                  insertAfter === idx ? (
                    <div className="my-1 animate-task-in">
                      <div className="flex gap-2 bg-surface border border-accent/40 rounded-xl px-3 py-2 items-start">
                        <textarea
                          ref={insertInputRef}
                          autoFocus
                          className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted resize-none leading-snug pt-0.5"
                          placeholder="Tên task… (Enter thêm · Shift+Enter xuống dòng)"
                          value={insertName}
                          rows={Math.max(1, insertName.split('\n').length)}
                          onChange={e => setInsertName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTask(insertName, idx) }
                            if (e.key === 'Escape') { setInsertAfter(null); setInsertName('') }
                          }}
                        />
                        <button className="text-xs bg-accent text-white px-2.5 py-1.5 rounded-lg hover:opacity-85 active:scale-95 transition-all flex-shrink-0 mt-0.5" onClick={() => addTask(insertName, idx)}>Thêm</button>
                        <button className="text-xs border border-border text-muted px-2 py-1.5 rounded-lg hover:text-fg transition-colors flex-shrink-0 mt-0.5" onClick={() => { setInsertAfter(null); setInsertName('') }}>Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <div className="group flex items-center gap-2 py-0.5 opacity-0 hover:opacity-100 transition-opacity duration-200">
                      <div className="flex-1 h-px bg-border" />
                      <button
                        className="text-[11px] text-muted border border-dashed border-border/60 rounded-md px-2.5 py-0.5 hover:border-accent-soft hover:text-accent-soft hover:bg-accent/10 transition-all whitespace-nowrap"
                        onClick={() => { setInsertAfter(idx); setInsertName('') }}
                      >+ Thêm vào đây</button>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Done section ── */}
        {filteredDoneList.length > 0 && (
          <div className="mt-1">
            <button
              className="w-full flex items-center gap-2 text-[11px] font-semibold text-muted uppercase tracking-wider mb-2 hover:text-fg transition-colors group"
              onClick={() => setShowDone(p => !p)}
            >
              <span className={`transition-transform duration-200 ${showDone ? '' : '-rotate-90'}`}>▾</span>
              Đã hoàn thành ({filteredDoneList.length}{fq && doneList.length !== filteredDoneList.length ? `/${doneList.length}` : ''})
              <div className="flex-1 h-px bg-border group-hover:bg-emerald-500/20 transition-colors" />
            </button>
            {showDone && (
              <div className="space-y-1.5 animate-panel-in">
                {filteredDoneList.map((task, idx) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    queueIdx={idx}
                    isSelected={false}
                    isDragOver={false}
                    isNew={false}
                    isRemoving={removingIds.has(task.id)}
                    isEditing={false}
                    editName=""
                    isPartialOpen={false}
                    editInputRef={editInputRef}
                    onSelect={() => {}}
                    onSetEditName={() => {}}
                    onSaveEdit={() => {}}
                    onCancelEdit={() => {}}
                    onToggleTimer={() => {}}
                    onSetState={() => {}}
                    onRemove={() => removeTask(task.id)}
                    onRestore={() => restoreTask(task.id)}
                    onOpenPartial={() => {}}
                    onClosePartial={() => {}}
                    onSetPartialPct={() => {}}
                    onDragStart={() => {}}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {}}
                    onDragEnd={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Shortcuts FAB ── */}
      <button
        className="fixed bottom-5 right-5 w-9 h-9 bg-surface border border-border rounded-full flex items-center justify-center font-mono text-sm text-muted hover:border-accent-soft hover:text-accent-soft hover:shadow-[0_0_16px_#7C3AED44] shadow-lg transition-all active:scale-90 z-40"
        onClick={() => setShowKeys(p => !p)}
        title="Shortcuts (?)"
      >?</button>

      {/* ── Shortcuts modal ── */}
      {showKeys && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-backdrop"
          onClick={() => setShowKeys(false)}
        >
          <div
            className="animate-modal-in bg-surface border border-border rounded-2xl p-5 w-[min(400px,90vw)] shadow-2xl shadow-black/50"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="font-display text-base font-bold text-fg">⌨️ Keyboard Shortcuts</span>
              <span className="ml-auto font-mono text-[11px] text-muted">
                nhấn <kbd className="bg-background border border-border rounded px-1 py-0.5 text-accent-soft text-[10px]">?</kbd>
              </span>
            </div>

            {SHORTCUT_GROUPS.map(group => (
              <div key={group.label} className="mb-3 last:mb-0">
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">{group.label}</div>
                {group.items.map(item => (
                  <div key={item.key} className="flex items-center py-1.5 border-b border-border last:border-none gap-3">
                    <span className="flex-1 text-sm text-fg">{item.desc}</span>
                    <kbd className="font-mono text-[11px] bg-background border border-border border-b-2 border-b-overlay/10 rounded px-2 py-0.5 text-accent-soft whitespace-nowrap">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            ))}

            <div className="mt-4 flex justify-end">
              <button
                className="text-xs text-muted border border-border bg-background px-3 py-1.5 rounded-lg hover:text-fg transition-colors active:scale-95"
                onClick={() => setShowKeys(false)}
              >Đóng <span className="opacity-50 text-[10px] ml-1">Esc</span></button>
            </div>
          </div>
        </div>
      )}
    </ToolShell>
  )
}
