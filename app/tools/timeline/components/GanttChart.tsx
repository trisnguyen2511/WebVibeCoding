'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { GripVertical, ExternalLink, Trash2, ChevronDown } from 'lucide-react'
import type { Task, Sprint, TimeEntry } from '@/lib/timeline-types'
import { TimeEntryModal } from './TimeEntryModal'

const DAY_W       = 38
const ROW_H       = 52    // task row height (slightly taller to fit jiraStatus badge)
const GROUP_H     = 32    // group header row height
const HEADER_H    = 64
const LEFT_MIN    = 260
const LEFT_DEFAULT = 360

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateToIndex(date: string, start: string): number {
  const ms = new Date(date + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()
  return Math.floor(ms / 86400000)
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDayOfWeek(date: string): number {
  return new Date(date + 'T00:00:00').getDay()
}

function fmtDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDay(date: string): string {
  return new Date(date + 'T00:00:00').getDate().toString()
}

const STATUS_BAR: Record<string, { actual: string; border: string }> = {
  todo:         { actual: 'bg-zinc-500/70',    border: 'border-zinc-400' },
  'in-progress':{ actual: 'bg-blue-500/80',    border: 'border-blue-400' },
  done:         { actual: 'bg-emerald-500/80', border: 'border-emerald-400' },
  blocked:      { actual: 'bg-red-500/80',     border: 'border-red-400' },
}

const STATUS_DOT: Record<string, string> = {
  todo: 'bg-zinc-500',
  'in-progress': 'bg-blue-400',
  done: 'bg-emerald-400',
  blocked: 'bg-red-400',
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
}

// Colors for parent groups (left border + row tint)
const GROUP_PALETTE = [
  { border: '#3b82f6', bg: 'rgba(59,130,246,0.06)'  },  // blue
  { border: '#8b5cf6', bg: 'rgba(139,92,246,0.06)'  },  // violet
  { border: '#10b981', bg: 'rgba(16,185,129,0.06)'  },  // emerald
  { border: '#f59e0b', bg: 'rgba(245,158,11,0.06)'  },  // amber
  { border: '#ec4899', bg: 'rgba(236,72,153,0.06)'  },  // pink
  { border: '#06b6d4', bg: 'rgba(6,182,212,0.06)'   },  // cyan
]

function jiraStatusBadgeStyle(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('done') || s.includes('closed') || s.includes('resolved'))
    return 'bg-emerald-500/20 text-emerald-400'
  if (s.includes('progress') || s.includes('review') || s.includes('testing'))
    return 'bg-blue-500/20 text-blue-400'
  if (s.includes('block') || s.includes('impediment'))
    return 'bg-red-500/20 text-red-400'
  return 'bg-border/60 text-muted'
}

type DisplayRow =
  | { type: 'header'; parentKey: string; parentTitle: string; count: number; colorIdx: number
      isCollapsed: boolean
      estStart?: string; estEnd?: string; actStart?: string; actEnd?: string }
  | { type: 'task';   task: Task; isSubtask: boolean; colorIdx: number; hiddenByCollapse?: boolean }

interface Tooltip { x: number; y: number; task: Task; date?: string; entry?: TimeEntry }
interface ContextMenu { x: number; y: number; task: Task; date?: string }

interface DragState {
  type: 'resize-start' | 'resize-end' | 'move' | 'resize-est-start' | 'resize-est-end' | 'move-est'
  taskId: string
  startX: number
  origStart: string
  origEnd: string
}

interface DragPreview {
  taskId: string
  estStart?: string; estEnd?: string
  actStart?: string; actEnd?: string
}

interface Props {
  projectId: string
  tasks: Task[]
  sprints: Sprint[]
  timelineStart: string
  timelineEnd: string
  onUpdateTask: (task: Task) => void
  onUpdateEntry: (taskId: string, entry: TimeEntry) => void
  onDeleteEntry: (taskId: string, entryId: string) => void
  onEditTask: (task: Task) => void
  onDeleteTask?: (id: string) => void
  onReorderTasks?: (tasks: Task[]) => void
  onExport?: () => void
}

// ── Quick Estimate Modal ──────────────────────────────────────
function QuickEstimateModal({ task, date, onSave, onClose }: {
  task: Task; date: string
  onSave: (start: string, end: string, hours?: number) => void
  onClose: () => void
}) {
  const [startDate, setStartDate] = useState(task.estimateStartDate ?? date)
  const [endDate,   setEndDate]   = useState(task.estimateEndDate   ?? addDays(date, 6))
  const [hours,     setHours]     = useState(task.estimateHours?.toString() ?? '')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="rounded-xl border border-border bg-surface p-5 w-80 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-display font-semibold text-fg text-sm">Set Estimate</h3>
        <p className="text-xs text-muted truncate">
          {task.jiraKey && <span className="font-mono text-accent-soft">{task.jiraKey} — </span>}
          {task.title}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted block mb-1">Start</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">End</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">Est. Hours</label>
          <input type="number" min={0} step={0.5} value={hours} onChange={e => setHours(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-fg font-mono focus:border-accent focus:outline-none" />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-xs text-muted hover:text-fg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { if (startDate && endDate && startDate <= endDate) onSave(startDate, endDate, hours ? Number(hours) : undefined) }}
            disabled={!startDate || !endDate || startDate > endDate}
            className="flex-1 rounded-lg bg-accent py-2 text-xs font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-40">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export function GanttChart({
  projectId, tasks, sprints, timelineStart, timelineEnd,
  onUpdateTask, onUpdateEntry, onDeleteEntry, onEditTask, onDeleteTask, onReorderTasks,
  onExport,
}: Props) {
  const leftRef      = useRef<HTMLDivElement>(null)
  const rightRef     = useRef<HTMLDivElement>(null)
  const headerRef    = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef      = useRef<DragState | null>(null)
  const panelDragRef = useRef<{ startX: number; startW: number } | null>(null)
  const rafRef       = useRef<number | null>(null)
  const tasksRef        = useRef(tasks)
  const onUpdateTaskRef = useRef(onUpdateTask)
  const onExportRef     = useRef(onExport)
  const hoveredCellRef  = useRef<{ task: Task; date: string } | null>(null)

  const [leftW,        setLeftW]        = useState(LEFT_DEFAULT)
  const [tooltip,      setTooltip]      = useState<Tooltip | null>(null)
  const [ctxMenu,      setCtxMenu]      = useState<ContextMenu | null>(null)
  const [entryModal,   setEntryModal]   = useState<{ task: Task; date: string; entry?: TimeEntry } | null>(null)
  const [estModal,     setEstModal]     = useState<{ task: Task; date: string } | null>(null)
  const [hoveredRow,   setHoveredRow]   = useState<string | null>(null)
  const [dragPreview,  setDragPreview]  = useState<DragPreview | null>(null)
  // List reorder drag
  const [listDragIdx,  setListDragIdx]  = useState<number | null>(null)
  const [listDropIdx,  setListDropIdx]  = useState<number | null>(null)
  // Collapse/expand parent groups — persisted to localStorage
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`timeline:collapsed:${projectId}`)
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set()
    } catch { return new Set() }
  })

  // Re-load from localStorage when projectId changes (e.g. after navigation)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`timeline:collapsed:${projectId}`)
      setCollapsedParents(raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set())
    } catch { setCollapsedParents(new Set()) }
  }, [projectId])

  function toggleParent(key: string) {
    setCollapsedParents(prev => {
      const s = new Set(prev)
      if (s.has(key)) s.delete(key); else s.add(key)
      return s
    })
  }

  // Persist collapsed state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(`timeline:collapsed:${projectId}`, JSON.stringify(Array.from(collapsedParents)))
    } catch { /* noop */ }
  }, [collapsedParents, projectId])

  // Keep refs in sync so drag/keyboard handlers always see latest values
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => { onUpdateTaskRef.current = onUpdateTask }, [onUpdateTask])
  useEffect(() => { onExportRef.current = onExport }, [onExport])

  const totalDays  = dateToIndex(timelineEnd, timelineStart) + 1
  const todayIndex = dateToIndex(localToday(), timelineStart)
  const days = useMemo(() => Array.from({ length: totalDays }, (_, i) => addDays(timelineStart, i)), [totalDays, timelineStart])

  // ── Build display rows (group subtasks under parents) ───────
  const displayRows = useMemo<DisplayRow[]>(() => {
    const byParent = new Map<string, Task[]>()
    const standalone: Task[] = []
    for (const task of tasks) {
      if (task.parentKey) {
        const arr = byParent.get(task.parentKey) ?? []
        arr.push(task)
        byParent.set(task.parentKey, arr)
      } else {
        standalone.push(task)
      }
    }
    const rows: DisplayRow[] = standalone.map(t => ({ type: 'task', task: t, isSubtask: false, colorIdx: -1 }))
    let colorIdx = 0
    for (const [parentKey, children] of Array.from(byParent)) {
      const parentTitle = children[0].parentTitle ?? parentKey
      const isCollapsed = collapsedParents.has(parentKey)
      const estDates = children.flatMap(t => [t.estimateStartDate, t.estimateEndDate]).filter(Boolean) as string[]
      const actDates = children.flatMap(t => [t.actualStartDate,   t.actualEndDate  ]).filter(Boolean) as string[]
      rows.push({
        type: 'header', parentKey, parentTitle, count: children.length, colorIdx, isCollapsed,
        estStart: estDates.length ? estDates.reduce((a, b) => a < b ? a : b) : undefined,
        estEnd:   estDates.length ? estDates.reduce((a, b) => a > b ? a : b) : undefined,
        actStart: actDates.length ? actDates.reduce((a, b) => a < b ? a : b) : undefined,
        actEnd:   actDates.length ? actDates.reduce((a, b) => a > b ? a : b) : undefined,
      })
      for (const task of children) rows.push({ type: 'task', task, isSubtask: true, colorIdx, hiddenByCollapse: isCollapsed })
      colorIdx++
    }
    return rows
  }, [tasks, collapsedParents])

  // ── Scroll sync ──────────────────────────────────────────────
  const syncScroll = useCallback((from: 'left' | 'right') => {
    if (from === 'left' && rightRef.current && leftRef.current)
      rightRef.current.scrollTop = leftRef.current.scrollTop
    if (from === 'right' && leftRef.current && rightRef.current)
      leftRef.current.scrollTop = rightRef.current.scrollTop
  }, [])

  const syncHeaderScroll = useCallback((scrollLeft: number) => {
    if (headerRef.current) headerRef.current.scrollLeft = scrollLeft
  }, [])

  // ── Bar drag ─────────────────────────────────────────────────
  const startBarDrag = useCallback((e: React.MouseEvent, task: Task, type: DragState['type']) => {
    e.preventDefault(); e.stopPropagation()
    dragRef.current = {
      type, taskId: task.id, startX: e.clientX,
      origStart: type.includes('est') ? (task.estimateStartDate ?? '') : (task.actualStartDate ?? ''),
      origEnd:   type.includes('est') ? (task.estimateEndDate   ?? '') : (task.actualEndDate   ?? ''),
    }
  }, [])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return
      const { type, taskId, startX, origStart, origEnd } = dragRef.current
      const delta = Math.round((e.clientX - startX) / DAY_W)
      const task = tasksRef.current.find(t => t.id === taskId)
      if (!task) return

      // Throttle visual updates to rAF — no persist yet
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (type === 'resize-start') {
          const s = origStart ? addDays(origStart, delta) : undefined
          if (task.actualEndDate && s && s > task.actualEndDate) return
          setDragPreview({ taskId, actStart: s, actEnd: task.actualEndDate })
        } else if (type === 'resize-end') {
          const en = origEnd ? addDays(origEnd, delta) : undefined
          if (task.actualStartDate && en && en < task.actualStartDate) return
          setDragPreview({ taskId, actStart: task.actualStartDate, actEnd: en })
        } else if (type === 'move') {
          setDragPreview({
            taskId,
            actStart: origStart ? addDays(origStart, delta) : undefined,
            actEnd:   origEnd   ? addDays(origEnd,   delta) : undefined,
          })
        } else if (type === 'resize-est-start') {
          const s = origStart ? addDays(origStart, delta) : undefined
          if (task.estimateEndDate && s && s > task.estimateEndDate) return
          setDragPreview({ taskId, estStart: s, estEnd: task.estimateEndDate })
        } else if (type === 'resize-est-end') {
          const en = origEnd ? addDays(origEnd, delta) : undefined
          if (task.estimateStartDate && en && en < task.estimateStartDate) return
          setDragPreview({ taskId, estStart: task.estimateStartDate, estEnd: en })
        } else if (type === 'move-est') {
          setDragPreview({
            taskId,
            estStart: origStart ? addDays(origStart, delta) : undefined,
            estEnd:   origEnd   ? addDays(origEnd,   delta) : undefined,
          })
        }
      })
    }

    function onUp(e: MouseEvent) {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      if (dragRef.current) {
        const { type, taskId, startX, origStart, origEnd } = dragRef.current
        const delta = Math.round((e.clientX - startX) / DAY_W)
        const task = tasksRef.current.find(t => t.id === taskId)
        if (task) {
          const now = new Date().toISOString()
          if (type === 'resize-start') {
            const s = origStart ? addDays(origStart, delta) : undefined
            if (!(task.actualEndDate && s && s > task.actualEndDate))
              onUpdateTaskRef.current({ ...task, actualStartDate: s, updatedAt: now })
          } else if (type === 'resize-end') {
            const en = origEnd ? addDays(origEnd, delta) : undefined
            if (!(task.actualStartDate && en && en < task.actualStartDate))
              onUpdateTaskRef.current({ ...task, actualEndDate: en, updatedAt: now })
          } else if (type === 'move') {
            onUpdateTaskRef.current({
              ...task,
              actualStartDate: origStart ? addDays(origStart, delta) : undefined,
              actualEndDate:   origEnd   ? addDays(origEnd,   delta) : undefined,
              updatedAt: now,
            })
          } else if (type === 'resize-est-start') {
            const s = origStart ? addDays(origStart, delta) : undefined
            if (!(task.estimateEndDate && s && s > task.estimateEndDate))
              onUpdateTaskRef.current({ ...task, estimateStartDate: s, updatedAt: now })
          } else if (type === 'resize-est-end') {
            const en = origEnd ? addDays(origEnd, delta) : undefined
            if (!(task.estimateStartDate && en && en < task.estimateStartDate))
              onUpdateTaskRef.current({ ...task, estimateEndDate: en, updatedAt: now })
          } else if (type === 'move-est') {
            onUpdateTaskRef.current({
              ...task,
              estimateStartDate: origStart ? addDays(origStart, delta) : undefined,
              estimateEndDate:   origEnd   ? addDays(origEnd,   delta) : undefined,
              updatedAt: now,
            })
          }
        }
      }
      dragRef.current = null
      setDragPreview(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, []) // stable: reads tasks/onUpdateTask through refs

  // ── Panel resize ─────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!panelDragRef.current) return
      setLeftW(Math.max(LEFT_MIN, panelDragRef.current.startW + (e.clientX - panelDragRef.current.startX)))
    }
    function onUp() { panelDragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Scroll to today on mount ─────────────────────────────────
  useEffect(() => {
    if (rightRef.current && todayIndex > 0) {
      const targetScroll = Math.max(0, todayIndex * DAY_W - rightRef.current.clientWidth / 2)
      rightRef.current.scrollLeft = targetScroll
      if (headerRef.current) headerRef.current.scrollLeft = targetScroll
    }
  }, [todayIndex, tasks.length])

  // ── Close context menu ───────────────────────────────────────
  useEffect(() => {
    if (!ctxMenu) return
    function close() { setCtxMenu(null) }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu])

  // ── Cell keyboard shortcuts (active while hovering a right-panel cell) ──
  // x = export  |  e = set estimate  |  a = log actual  |  d = set due date
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cell = hoveredCellRef.current
      if (!cell) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const { task, date } = cell
      switch (e.key.toLowerCase()) {
        case 'x':
          e.preventDefault()
          onExportRef.current?.()
          break
        case 'e':
          e.preventDefault()
          setEstModal({ task, date })
          break
        case 'a':
          e.preventDefault()
          setEntryModal({ task, date, entry: task.timeEntries.find(en => en.date === date) })
          break
        case 'd':
          e.preventDefault()
          onUpdateTaskRef.current({ ...task, dueDate: task.dueDate === date ? undefined : date, updatedAt: new Date().toISOString() })
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // stable: reads task/date/handlers via refs

  // ── Month / Sprint header groups ─────────────────────────────
  const monthGroups = useMemo(() => {
    const groups: { label: string; start: number; count: number }[] = []
    let curMonth = ''; let curStart = 0
    days.forEach((d, i) => {
      const m = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      if (m !== curMonth) {
        if (curMonth) groups.push({ label: curMonth, start: curStart, count: i - curStart })
        curMonth = m; curStart = i
      }
    })
    if (curMonth) groups.push({ label: curMonth, start: curStart, count: days.length - curStart })
    return groups
  }, [days])

  function totalLogged(task: Task) {
    return task.timeEntries.reduce((s, e) => s + e.hours, 0)
  }

  // ── List reorder drag ────────────────────────────────────────
  function isValidListDrop(dragIdx: number, dropIdx: number): boolean {
    if (dragIdx === dropIdx) return false
    const dragged = displayRows[dragIdx]
    const target  = displayRows[dropIdx]
    if (!dragged || !target || dragged.type === 'header') return false
    if (dragged.type === 'task' && dragged.isSubtask) {
      // Subtasks: only within same parent group
      if (target.type === 'header') return target.colorIdx === dragged.colorIdx
      if (target.type === 'task' && target.isSubtask) return target.colorIdx === dragged.colorIdx
      return false
    }
    // Standalone tasks: only among other standalone tasks or before a header group
    if (target.type === 'task' && !target.isSubtask) return true
    if (target.type === 'header') return true
    return false
  }

  function handleListDrop(dropIdx: number) {
    if (listDragIdx === null || !onReorderTasks) return
    if (!isValidListDrop(listDragIdx, dropIdx)) { setListDragIdx(null); setListDropIdx(null); return }

    const dragged = displayRows[listDragIdx]
    if (dragged.type !== 'task') return

    // Build new row order
    const rows = [...displayRows]
    const [removed] = rows.splice(listDragIdx, 1)
    const adjustedDrop = dropIdx > listDragIdx ? dropIdx - 1 : dropIdx
    rows.splice(adjustedDrop, 0, removed)

    if (dragged.isSubtask) {
      // Reassign order for this group's subtasks only
      const groupRows = rows.filter(r => r.type === 'task' && r.isSubtask && r.colorIdx === dragged.colorIdx)
      const updated = tasks.map(t => {
        const idx = groupRows.findIndex(r => r.type === 'task' && r.task.id === t.id)
        return idx >= 0 ? { ...t, order: idx } : t
      })
      onReorderTasks(updated)
    } else {
      // Reassign order for standalone tasks only
      const standaloneRows = rows.filter(r => r.type === 'task' && !r.isSubtask)
      const updated = tasks.map(t => {
        const idx = standaloneRows.findIndex(r => r.type === 'task' && r.task.id === t.id)
        return idx >= 0 ? { ...t, order: idx } : t
      })
      onReorderTasks(updated)
    }
    setListDragIdx(null); setListDropIdx(null)
  }

  // ── Helpers ──────────────────────────────────────────────────
  function rowHeight(row: DisplayRow) {
    if (row.type === 'task' && row.hiddenByCollapse) return 0
    return ROW_H
  }

  return (
    <div ref={containerRef}
      className="flex h-full min-h-0 overflow-hidden rounded-xl border border-border bg-background select-none">

      {/* ─── LEFT PANEL ─── */}
      <div className="flex flex-col shrink-0 border-r border-border" style={{ width: leftW }}>

        {/* Left header */}
        <div className="flex items-end px-3 pb-2 bg-surface border-b border-border shrink-0"
          style={{ height: HEADER_H }}>
          <div className="grid w-full gap-1 text-[10px] font-semibold uppercase tracking-wider text-fg/60"
            style={{ gridTemplateColumns: '16px 1fr 48px 52px' }}>
            <span /><span>Task</span>
            <span className="text-right">Hrs</span>
            <span className="text-right">Due</span>
          </div>
        </div>

        {/* Left rows */}
        <div ref={leftRef} className="flex-1 overflow-y-auto overflow-x-hidden"
          onScroll={() => syncScroll('left')}
          style={{ scrollbarWidth: 'none' }}>
          {displayRows.map((row, ri) => {
            const isDragTarget = listDropIdx === ri && listDragIdx !== null && isValidListDrop(listDragIdx, ri)
            const dropLineStyle = isDragTarget ? { boxShadow: 'inset 0 2px 0 #7C3AED' } : {}

            if (row.type === 'header') {
              const pal = GROUP_PALETTE[row.colorIdx % GROUP_PALETTE.length]
              return (
                <div key={`gh-${row.parentKey}`}
                  className="grid items-center border-b border-border/60 transition-shadow duration-100 cursor-pointer hover:brightness-110"
                  style={{ gridTemplateColumns: '20px 1fr 48px 52px', height: ROW_H, borderLeftWidth: 3, borderLeftColor: pal.border, background: pal.bg, paddingLeft: 8, paddingRight: 12, ...dropLineStyle }}
                  onClick={() => toggleParent(row.parentKey)}
                  onDragOver={e => { e.preventDefault(); setListDropIdx(ri) }}
                  onDragLeave={() => setListDropIdx(null)}
                  onDrop={() => handleListDrop(ri)}>
                  <span className="shrink-0 transition-transform duration-200"
                    style={{ color: pal.border, display: 'inline-flex', transform: row.isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                    <ChevronDown size={13} />
                  </span>
                  <div className="min-w-0 pr-1">
                    <span className="font-mono text-[10px]" style={{ color: pal.border }}>{row.parentKey}</span>
                    <p className="text-xs font-semibold text-fg truncate leading-snug">{row.parentTitle}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[10px] text-muted">{row.count}t</span>
                  </div>
                  <div />
                </div>
              )
            }

            const { task, isSubtask, colorIdx } = row
            const logged = totalLogged(task)
            const isHovered = hoveredRow === task.id
            const pal = colorIdx >= 0 ? GROUP_PALETTE[colorIdx % GROUP_PALETTE.length] : null
            const isBeingDragged = listDragIdx === ri
            const canDrag = !!onReorderTasks

            const isHidden = !!row.hiddenByCollapse
            return (
              <div key={task.id}
                draggable={canDrag && !isHidden}
                className={`group relative grid items-center border-b border-border/40 cursor-pointer ${isHidden ? '' : `transition-all duration-150 ${isHovered && !isBeingDragged ? 'bg-surface' : 'hover:bg-surface/60'}`} ${isBeingDragged ? 'opacity-40 scale-[0.98]' : ''}`}
                style={{
                  gridTemplateColumns: '16px 1fr 48px 52px',
                  height: isHidden ? 0 : ROW_H,
                  opacity: isHidden ? 0 : 1,
                  overflow: 'hidden',
                  pointerEvents: isHidden ? 'none' : 'auto',
                  transition: 'height 200ms ease, opacity 150ms ease',
                  paddingLeft: isSubtask ? 20 : 12,
                  paddingRight: 12,
                  borderLeftWidth: isSubtask && pal ? 3 : 0,
                  borderLeftColor: pal?.border,
                  ...dropLineStyle,
                }}
                onMouseEnter={e => { if (isHidden) return; setHoveredRow(task.id); setTooltip({ x: e.clientX + 16, y: e.clientY, task }) }}
                onMouseMove={e => { if (isHidden) return; setTooltip(prev => prev ? { ...prev, x: e.clientX + 16, y: e.clientY } : null) }}
                onMouseLeave={() => { setHoveredRow(null); setTooltip(null) }}
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setListDragIdx(ri); setListDropIdx(null) }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setListDropIdx(ri) }}
                onDragLeave={() => setListDropIdx(null)}
                onDrop={() => handleListDrop(ri)}
                onDragEnd={() => { setListDragIdx(null); setListDropIdx(null) }}
                onClick={e => {
                  if (listDragIdx !== null) return
                  if ((e.ctrlKey || e.metaKey) && task.link) {
                    window.open(task.link, '_blank', 'noopener,noreferrer')
                  } else {
                    onEditTask(task)
                  }
                }}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, task }) }}
              >
                {/* Drag handle / Status dot */}
                {canDrag && isHovered && !isBeingDragged
                  ? <GripVertical size={12} className="text-muted/60 cursor-grab shrink-0" />
                  : <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[task.status]}`} />
                }

                {/* Title area */}
                <div className="min-w-0 pr-1">
                  {task.jiraKey && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono text-[10px] text-accent-soft">{task.jiraKey}</span>
                      {task.jiraStatus && (
                        <span className={`text-[9px] px-1 py-0.5 rounded font-medium leading-none ${jiraStatusBadgeStyle(task.jiraStatus)}`}>
                          {task.jiraStatus}
                        </span>
                      )}
                      {task.link && isHovered && (
                        <ExternalLink size={9} className="text-muted/60" />
                      )}
                    </div>
                  )}
                  <p className="text-xs text-fg truncate leading-snug">{task.title}</p>
                </div>

                {/* Hours */}
                <div className="text-right">
                  <span className="font-mono text-[11px] text-fg">
                    {logged > 0 ? `${logged}h` : task.estimateHours ? `~${task.estimateHours}h` : '—'}
                  </span>
                </div>

                {/* Due date */}
                <div className="text-right">
                  <span className={`font-mono text-[11px] ${task.dueDate && task.dueDate < localToday() && task.status !== 'done' ? 'text-red-400' : 'text-muted'}`}>
                    {task.dueDate ? task.dueDate.slice(5) : '—'}
                  </span>
                </div>

                {/* Delete button (hover) */}
                {isHovered && onDeleteTask && (
                  <button
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted/40 hover:text-red-400 transition-colors rounded"
                    onClick={e => { e.stopPropagation(); onDeleteTask(task.id) }}
                    title="Delete task">
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            )
          })}
          <div style={{ height: 48 }} />
        </div>
      </div>

      {/* ─── RESIZE HANDLE ─── */}
      <div
        className="w-1 hover:w-1.5 bg-border hover:bg-accent/60 cursor-col-resize transition-all duration-150 shrink-0 flex items-center justify-center"
        onMouseDown={e => { panelDragRef.current = { startX: e.clientX, startW: leftW } }}>
        <GripVertical size={10} className="text-muted/50" />
      </div>

      {/* ─── RIGHT PANEL ─── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Timeline header */}
        <div ref={headerRef} className="overflow-x-hidden border-b border-border bg-surface shrink-0"
          style={{ height: HEADER_H }}>
          <div style={{ width: totalDays * DAY_W, position: 'relative', height: HEADER_H }}>
            {monthGroups.map((g, i) => (
              <div key={i}
                className="absolute top-0 text-[10px] text-fg/80 font-semibold uppercase tracking-wider border-r border-border/50 flex items-center px-2"
                style={{ left: g.start * DAY_W, width: g.count * DAY_W, height: 20 }}>
                {g.label}
              </div>
            ))}
            {sprints.map(sprint => {
              const s = Math.max(0, dateToIndex(sprint.startDate, timelineStart))
              const e = Math.min(totalDays - 1, dateToIndex(sprint.endDate, timelineStart))
              if (e < 0 || s >= totalDays) return null
              return (
                <div key={sprint.id}
                  className="absolute flex items-center px-2 bg-accent/20 border-l-2 border-accent/70"
                  style={{ left: s * DAY_W, width: (e - s + 1) * DAY_W, top: 20, height: 20 }}>
                  <span className="text-[10px] text-accent-soft font-semibold truncate">{sprint.name}</span>
                </div>
              )
            })}
            {days.map((day, i) => {
              const isWeekend = getDayOfWeek(day) === 0 || getDayOfWeek(day) === 6
              const isToday   = i === todayIndex
              return (
                <div key={day}
                  className={`absolute bottom-0 flex flex-col items-center justify-end border-r border-border/20 font-mono ${
                    isToday ? 'text-red-400' : isWeekend ? 'text-muted/60' : 'text-fg/70'
                  }`}
                  style={{ left: i * DAY_W, width: DAY_W, height: 24 }}>
                  {isToday && (
                    <span className="text-[8px] font-bold leading-none mb-0.5 tracking-wider text-red-400">TODAY</span>
                  )}
                  <span className={`text-[11px] leading-none mb-1 ${isToday ? 'font-bold' : ''}`}>{fmtDay(day)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Timeline body */}
        <div ref={rightRef} className="flex-1 overflow-auto"
          style={{ cursor: dragPreview ? 'grabbing' : 'default', userSelect: dragPreview ? 'none' : undefined }}
          onScroll={e => {
            const el = e.target as HTMLDivElement
            syncScroll('right')
            syncHeaderScroll(el.scrollLeft)
          }}>
          <div style={{ width: totalDays * DAY_W, position: 'relative', minHeight: '100%' }}>

            {/* Background: today highlight */}
            {todayIndex >= 0 && todayIndex < totalDays && (
              <div className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: todayIndex * DAY_W, width: DAY_W, background: 'rgba(239,68,68,0.08)' }} />
            )}

            {/* Background: weekends */}
            {days.map((day, i) => getDayOfWeek(day) === 0 || getDayOfWeek(day) === 6 ? (
              <div key={day} className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: i * DAY_W, width: DAY_W, background: 'rgba(255,255,255,0.03)' }} />
            ) : null)}

            {/* Vertical day lines */}
            {days.map((_, i) => (
              <div key={`vl-${i}`} className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: i * DAY_W, width: 1, background: 'rgba(255,255,255,0.04)' }} />
            ))}

            {/* Horizontal row lines */}
            {displayRows.map((row, ri) => {
              const top = displayRows.slice(0, ri).reduce((sum, r) => sum + rowHeight(r), 0)
              return (
                <div key={`hl-${ri}`} className="absolute left-0 right-0 pointer-events-none"
                  style={{ top, height: 1, background: 'rgba(255,255,255,0.05)' }} />
              )
            })}

            {/* Background: sprint separators */}
            {sprints.map(sprint => {
              const idx = dateToIndex(sprint.startDate, timelineStart)
              if (idx < 0 || idx >= totalDays) return null
              return (
                <div key={sprint.id}
                  className="absolute top-0 bottom-0 border-l-2 border-accent/40 pointer-events-none"
                  style={{ left: idx * DAY_W }} />
              )
            })}

            {/* Today line */}
            {todayIndex >= 0 && todayIndex < totalDays && (
              <div className="absolute top-0 bottom-0 pointer-events-none z-20"
                style={{ left: todayIndex * DAY_W + DAY_W / 2 - 1, width: 2, background: 'rgba(239,68,68,0.8)' }} />
            )}

            {/* Rows */}
            {displayRows.map(row => {
              const h = rowHeight(row)

              if (row.type === 'header') {
                const pal = GROUP_PALETTE[row.colorIdx % GROUP_PALETTE.length]
                const estS = row.estStart ? dateToIndex(row.estStart, timelineStart) : null
                const estE = row.estEnd   ? dateToIndex(row.estEnd,   timelineStart) : null
                const actS = row.actStart ? dateToIndex(row.actStart, timelineStart) : null
                const actE = row.actEnd   ? dateToIndex(row.actEnd,   timelineStart) : null
                return (
                  <div key={`ghr-${row.parentKey}`}
                    className="relative border-b border-border/50"
                    style={{ height: h, borderLeftWidth: 3, borderLeftColor: pal.border, background: pal.bg }}>
                    {/* Estimate summary bar */}
                    {estS !== null && estE !== null && estS < totalDays && estE >= 0 && (
                      <div className="absolute rounded-sm pointer-events-none"
                        style={{
                          left:   Math.max(0, estS) * DAY_W + 1,
                          width:  (Math.min(totalDays - 1, estE) - Math.max(0, estS) + 1) * DAY_W - 2,
                          top:    h / 2 - 14,
                          height: 6,
                          background: pal.border,
                          opacity: 0.25,
                        }} />
                    )}
                    {/* Actual summary bar */}
                    {actS !== null && actE !== null && actS < totalDays && actE >= 0 && (
                      <div className="absolute rounded pointer-events-none"
                        style={{
                          left:   Math.max(0, actS) * DAY_W + 4,
                          width:  (Math.min(totalDays - 1, actE) - Math.max(0, actS) + 1) * DAY_W - 8,
                          top:    h / 2 - 6,
                          height: 12,
                          background: pal.border,
                          opacity: 0.35,
                          borderRadius: 4,
                        }}>
                        <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-white truncate" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                          {row.parentTitle}
                        </span>
                      </div>
                    )}
                  </div>
                )
              }

              const { task, isSubtask, colorIdx } = row
              const pal = colorIdx >= 0 ? GROUP_PALETTE[colorIdx % GROUP_PALETTE.length] : null

              // Use drag preview dates while dragging, fall back to task data
              const dp = dragPreview?.taskId === task.id ? dragPreview : null
              const estStartD = dp?.estStart !== undefined ? dp.estStart : task.estimateStartDate
              const estEndD   = dp?.estEnd   !== undefined ? dp.estEnd   : task.estimateEndDate
              const actStartD = dp?.actStart !== undefined ? dp.actStart : task.actualStartDate
              const actEndD   = dp?.actEnd   !== undefined ? dp.actEnd   : task.actualEndDate

              const estS = estStartD ? dateToIndex(estStartD, timelineStart) : null
              const estE = estEndD   ? dateToIndex(estEndD,   timelineStart) : null
              const actS = actStartD ? dateToIndex(actStartD, timelineStart) : null
              const actE = actEndD   ? dateToIndex(actEndD,   timelineStart) : null
              const dueI = task.dueDate ? dateToIndex(task.dueDate, timelineStart) : null

              const bars      = STATUS_BAR[task.status] ?? STATUS_BAR.todo
              const logged    = totalLogged(task)
              const progress  = task.estimateHours && logged > 0 ? Math.min(1, logged / task.estimateHours) : 0
              const isHovered = hoveredRow === task.id
              const isDragging = dragPreview?.taskId === task.id

              const isHiddenR = !!row.hiddenByCollapse
              return (
                <div key={task.id}
                  className={`relative border-b border-border/30 ${isHiddenR ? '' : `transition-colors duration-100 ${isHovered ? 'bg-surface/40' : ''}`}`}
                  style={{
                    height: isHiddenR ? 0 : h,
                    opacity: isHiddenR ? 0 : 1,
                    overflow: 'hidden',
                    pointerEvents: isHiddenR ? 'none' : 'auto',
                    transition: 'height 200ms ease, opacity 150ms ease',
                    borderLeftWidth: isSubtask && pal ? 3 : 0,
                    borderLeftColor: pal?.border,
                    paddingLeft: isSubtask ? 4 : 0,
                  }}
                  onMouseEnter={() => { if (isHiddenR) return; setHoveredRow(task.id) }}
                  onMouseLeave={() => { setHoveredRow(null); setTooltip(null) }}
                  onContextMenu={e => { if (isHiddenR) return; e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, task }) }}>

                  {/* Click cells + shortcut hint */}
                  {days.map((day, i) => {
                    const entry = task.timeEntries.find(e => e.date === day)
                    return (
                      <div key={day}
                        className="absolute top-0 bottom-0 cursor-pointer"
                        style={{ left: i * DAY_W, width: DAY_W }}
                        onClick={() => setEntryModal({ task, date: day, entry })}
                        onMouseEnter={e => {
                          hoveredCellRef.current = { task, date: day }
                          if (!entry) return
                          setTooltip({ x: e.clientX, y: e.clientY, task, date: day, entry })
                        }}
                        onMouseLeave={() => {
                          hoveredCellRef.current = null
                          setTooltip(null)
                        }} />
                    )
                  })}

                  {/* Estimate bar (draggable) */}
                  {estS !== null && estE !== null && estS < totalDays && estE >= 0 && (
                    <div
                      className={`absolute rounded-sm border cursor-move transition-opacity ${
                        isDragging
                          ? 'bg-accent/35 border-accent/60 shadow-lg shadow-accent/20'
                          : 'bg-accent/15 border-accent/25'
                      }`}
                      style={{
                        left:   Math.max(0, estS) * DAY_W + 1,
                        width:  (Math.min(totalDays - 1, estE) - Math.max(0, estS) + 1) * DAY_W - 2,
                        top:    h / 2 - 14,
                        height: 8,
                      }}
                      onMouseDown={e => startBarDrag(e, task, 'move-est')}
                      onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, task })}
                      onMouseLeave={() => setTooltip(null)}>
                      {/* Estimate resize handles */}
                      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize"
                        onMouseDown={e => startBarDrag(e, task, 'resize-est-start')} />
                      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize"
                        onMouseDown={e => startBarDrag(e, task, 'resize-est-end')} />
                    </div>
                  )}

                  {/* Actual bar */}
                  {actS !== null && actE !== null && actS < totalDays && actE >= 0 && (() => {
                    const barL = Math.max(0, actS) * DAY_W + 4
                    const barW = (Math.min(totalDays - 1, actE) - Math.max(0, actS) + 1) * DAY_W - 8
                    return (
                      <div
                        className={`absolute rounded border cursor-move transition-shadow ${bars.actual} ${bars.border} ${isDragging ? 'shadow-lg brightness-125' : ''}`}
                        style={{ left: barL, width: barW, top: h / 2 - 6, height: 12 }}
                        onMouseDown={e => startBarDrag(e, task, 'move')}
                        onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, task })}
                        onMouseLeave={() => setTooltip(null)}>
                        {progress > 0 && (
                          <div className="absolute inset-y-0 left-0 rounded bg-white/20 pointer-events-none"
                            style={{ width: `${progress * 100}%` }} />
                        )}
                        <div className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize"
                          onMouseDown={e => startBarDrag(e, task, 'resize-start')} />
                        <div className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize"
                          onMouseDown={e => startBarDrag(e, task, 'resize-end')} />
                      </div>
                    )
                  })()}

                  {/* Time entry dots */}
                  {task.timeEntries.map(entry => {
                    const idx = dateToIndex(entry.date, timelineStart)
                    if (idx < 0 || idx >= totalDays) return null
                    return (
                      <div key={entry.id}
                        className="absolute rounded-sm pointer-events-none"
                        style={{
                          left:   idx * DAY_W + 3,
                          width:  DAY_W - 6,
                          bottom: 4,
                          height: 4,
                          background: `rgba(124,58,237,${0.35 + Math.min(0.65, entry.hours / 8 * 0.65)})`,
                        }} />
                    )
                  })}

                  {/* Due date diamond */}
                  {dueI !== null && dueI >= 0 && dueI < totalDays && (
                    <div className="absolute pointer-events-none flex items-center justify-center"
                      style={{ left: dueI * DAY_W, width: DAY_W, top: 3, height: 10 }}>
                      <div className={`w-2 h-2 rotate-45 rounded-sm ${
                        task.status === 'done' ? 'bg-emerald-400'
                        : task.dueDate! < localToday() ? 'bg-red-400'
                        : 'bg-yellow-400'
                      }`} />
                    </div>
                  )}
                </div>
              )
            })}

            <div style={{ height: 48 }} />
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border/50 bg-surface/50 shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-fg/60">
            <div className="w-6 h-2 rounded-sm bg-accent/15 border border-accent/25" />
            <span>Estimate (drag)</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-fg/60">
            <div className="w-5 h-2.5 rounded bg-blue-500/70 border border-blue-400" />
            <span>Actual</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-fg/60">
            <div className="w-5 h-1 rounded-sm bg-accent/70" />
            <span>Hours logged</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-fg/60">
            <div className="w-2 h-2 rotate-45 rounded-sm bg-yellow-400" />
            <span>Due date</span>
          </div>
          <div className="ml-auto text-[10px] text-fg/40 hidden lg:block">
            Click to log · Hover cell: <kbd className="font-mono bg-border/40 px-0.5 rounded">E</kbd> estimate <kbd className="font-mono bg-border/40 px-0.5 rounded">A</kbd> actual <kbd className="font-mono bg-border/40 px-0.5 rounded">D</kbd> due date · Right-click for more
          </div>
        </div>
      </div>

      {/* ─── HOVER TOOLTIP ─── */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl border border-border bg-surface shadow-2xl p-3 w-64 text-xs"
          style={{
            left: Math.min(tooltip.x + 14, window.innerWidth - 280),
            top:  Math.min(tooltip.y - 8,  window.innerHeight - 200),
          }}>
          <div className="flex items-start gap-2 mb-2">
            <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[tooltip.task.status]}`} />
            <div className="min-w-0">
              {tooltip.task.jiraKey && (
                <div className="flex items-center gap-1">
                  <p className="font-mono text-[10px] text-accent-soft">{tooltip.task.jiraKey}</p>
                  {tooltip.task.jiraStatus && (
                    <span className={`text-[9px] px-1 rounded ${jiraStatusBadgeStyle(tooltip.task.jiraStatus)}`}>
                      {tooltip.task.jiraStatus}
                    </span>
                  )}
                </div>
              )}
              <p className="font-medium text-fg leading-snug">{tooltip.task.title}</p>
            </div>
          </div>

          {tooltip.date && tooltip.entry ? (
            <div className="rounded-lg bg-background px-3 py-2 space-y-1">
              <p className="text-muted">{fmtDate(tooltip.date)}</p>
              <p className="font-mono text-lg font-bold text-accent-soft">{tooltip.entry.hours}h</p>
              {tooltip.entry.note && <p className="text-muted truncate">{tooltip.entry.note}</p>}
              <p className="text-[10px] text-muted/60">{tooltip.entry.source === 'jira' ? 'from Jira' : 'manual'}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {tooltip.task.estimateStartDate && (
                <div className="flex justify-between">
                  <span className="text-muted">Estimate</span>
                  <span className="font-mono text-fg">
                    {fmtDate(tooltip.task.estimateStartDate)} → {tooltip.task.estimateEndDate ? fmtDate(tooltip.task.estimateEndDate) : '?'}
                  </span>
                </div>
              )}
              {tooltip.task.actualStartDate && (
                <div className="flex justify-between">
                  <span className="text-muted">Actual</span>
                  <span className="font-mono text-fg">
                    {fmtDate(tooltip.task.actualStartDate)} → {tooltip.task.actualEndDate ? fmtDate(tooltip.task.actualEndDate) : 'ongoing'}
                  </span>
                </div>
              )}
              {tooltip.task.estimateHours && (
                <div className="flex justify-between">
                  <span className="text-muted">Hours</span>
                  <span className="font-mono text-fg">{totalLogged(tooltip.task)}h / {tooltip.task.estimateHours}h</span>
                </div>
              )}
              {tooltip.task.estimateHours && totalLogged(tooltip.task) > 0 && (
                <div>
                  <div className="flex justify-between text-[10px] text-muted mb-1">
                    <span>Progress</span>
                    <span>{Math.round(Math.min(100, totalLogged(tooltip.task) / tooltip.task.estimateHours * 100))}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-border overflow-hidden">
                    <div className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.min(100, totalLogged(tooltip.task) / tooltip.task.estimateHours * 100)}%` }} />
                  </div>
                </div>
              )}
              <div className="flex justify-between pt-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                  tooltip.task.status === 'done'        ? 'bg-emerald-500/20 text-emerald-400' :
                  tooltip.task.status === 'in-progress' ? 'bg-blue-500/20 text-blue-400' :
                  tooltip.task.status === 'blocked'     ? 'bg-red-500/20 text-red-400' :
                                                          'bg-muted/20 text-muted'
                }`}>
                  {STATUS_LABEL[tooltip.task.status]}
                </span>
                {tooltip.task.dueDate && (
                  <span className="text-muted font-mono text-[10px]">due {tooltip.task.dueDate.slice(5)}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── CONTEXT MENU ─── */}
      {ctxMenu && (
        <div
          className="fixed z-50 rounded-xl border border-border bg-surface shadow-2xl py-1 w-48 text-sm"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}>
          <button className="w-full text-left px-3 py-2 text-fg hover:bg-surface/80 transition-colors"
            onClick={() => { onEditTask(ctxMenu.task); setCtxMenu(null) }}>
            Edit task
          </button>
          <button className="w-full text-left px-3 py-2 text-fg hover:bg-surface/80 transition-colors"
            onClick={() => {
              setEntryModal({ task: ctxMenu.task, date: localToday() })
              setCtxMenu(null)
            }}>
            Log hours today
          </button>
          <button className="w-full text-left px-3 py-2 text-accent-soft hover:bg-accent/10 transition-colors"
            onClick={() => {
              setEstModal({ task: ctxMenu.task, date: ctxMenu.task.estimateStartDate ?? localToday() })
              setCtxMenu(null)
            }}>
            Set estimate dates…
          </button>
          {ctxMenu.task.link && (
            <a href={ctxMenu.task.link} target="_blank" rel="noopener noreferrer"
              className="block px-3 py-2 text-fg hover:bg-surface/80 transition-colors"
              onClick={() => setCtxMenu(null)}>
              Open link ↗
            </a>
          )}
          <div className="border-t border-border/50 my-1" />
          <button className="w-full text-left px-3 py-2 text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={() => { onDeleteTask?.(ctxMenu.task.id); setCtxMenu(null) }}>
            Delete task
          </button>
        </div>
      )}

      {/* Time entry modal */}
      {entryModal && (
        <TimeEntryModal
          task={entryModal.task}
          date={entryModal.date}
          existingEntry={entryModal.entry}
          onSave={onUpdateEntry}
          onDelete={onDeleteEntry}
          onClose={() => setEntryModal(null)}
        />
      )}

      {/* Quick estimate modal */}
      {estModal && (
        <QuickEstimateModal
          task={estModal.task}
          date={estModal.date}
          onSave={(startDate, endDate, hours) => {
            onUpdateTask({ ...estModal.task, estimateStartDate: startDate, estimateEndDate: endDate, estimateHours: hours, updatedAt: new Date().toISOString() })
            setEstModal(null)
          }}
          onClose={() => setEstModal(null)}
        />
      )}
    </div>
  )
}
