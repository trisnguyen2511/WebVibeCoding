'use client'

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { GripVertical } from 'lucide-react'
import type { Task, Sprint, TimeEntry } from '@/lib/timeline-types'
import { TimeEntryModal } from './TimeEntryModal'

const DAY_W       = 38
const ROW_H       = 52    // task row height (slightly taller to fit jiraStatus badge)
const GROUP_H     = 32    // group header row height
const HEADER_H    = 64
const LEFT_MIN    = 260
const LEFT_DEFAULT = 360

function dateToIndex(date: string, start: string): number {
  const ms = new Date(date + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()
  return Math.floor(ms / 86400000)
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
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
  | { type: 'header'; parentKey: string; parentTitle: string; count: number; colorIdx: number }
  | { type: 'task';   task: Task; isSubtask: boolean; colorIdx: number }

interface Tooltip { x: number; y: number; task: Task; date?: string; entry?: TimeEntry }
interface ContextMenu { x: number; y: number; task: Task; date?: string }

interface DragState {
  type: 'resize-start' | 'resize-end' | 'move' | 'resize-est-start' | 'resize-est-end' | 'move-est'
  taskId: string
  startX: number
  origStart: string
  origEnd: string
}

interface Props {
  tasks: Task[]
  sprints: Sprint[]
  timelineStart: string
  timelineEnd: string
  onUpdateTask: (task: Task) => void
  onUpdateEntry: (taskId: string, entry: TimeEntry) => void
  onDeleteEntry: (taskId: string, entryId: string) => void
  onEditTask: (task: Task) => void
  onDeleteTask?: (id: string) => void
  estimateMode?: boolean
  onExitEstimateMode?: () => void
}

// ── Quick Estimate Modal ──────────────────────────────────────
function QuickEstimateModal({ task, date, onSave, onClose }: {
  task: Task; date: string
  onSave: (start: string, end: string) => void
  onClose: () => void
}) {
  const [startDate, setStartDate] = useState(task.estimateStartDate ?? date)
  const [endDate,   setEndDate]   = useState(task.estimateEndDate   ?? addDays(date, 6))
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
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-xs text-muted hover:text-fg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { if (startDate && endDate && startDate <= endDate) onSave(startDate, endDate) }}
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
  tasks, sprints, timelineStart, timelineEnd,
  onUpdateTask, onUpdateEntry, onDeleteEntry, onEditTask, onDeleteTask,
  estimateMode = false, onExitEstimateMode,
}: Props) {
  const leftRef      = useRef<HTMLDivElement>(null)
  const rightRef     = useRef<HTMLDivElement>(null)
  const headerRef    = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef      = useRef<DragState | null>(null)
  const panelDragRef = useRef<{ startX: number; startW: number } | null>(null)

  const [leftW,        setLeftW]        = useState(LEFT_DEFAULT)
  const [tooltip,      setTooltip]      = useState<Tooltip | null>(null)
  const [ctxMenu,      setCtxMenu]      = useState<ContextMenu | null>(null)
  const [entryModal,   setEntryModal]   = useState<{ task: Task; date: string; entry?: TimeEntry } | null>(null)
  const [estModal,     setEstModal]     = useState<{ task: Task; date: string } | null>(null)
  const [hoveredRow,   setHoveredRow]   = useState<string | null>(null)

  const totalDays  = dateToIndex(timelineEnd, timelineStart) + 1
  const todayIndex = dateToIndex(new Date().toISOString().slice(0, 10), timelineStart)
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
      rows.push({ type: 'header', parentKey, parentTitle, count: children.length, colorIdx })
      for (const task of children) rows.push({ type: 'task', task, isSubtask: true, colorIdx })
      colorIdx++
    }
    return rows
  }, [tasks])

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
      if (delta === 0) return
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      if (type === 'resize-start') {
        const newStart = addDays(origStart, delta)
        if (task.actualEndDate && newStart > task.actualEndDate) return
        onUpdateTask({ ...task, actualStartDate: newStart, updatedAt: new Date().toISOString() })
      } else if (type === 'resize-end') {
        const newEnd = addDays(origEnd, delta)
        if (task.actualStartDate && newEnd < task.actualStartDate) return
        onUpdateTask({ ...task, actualEndDate: newEnd, updatedAt: new Date().toISOString() })
      } else if (type === 'move') {
        onUpdateTask({
          ...task,
          actualStartDate: origStart ? addDays(origStart, delta) : undefined,
          actualEndDate:   origEnd   ? addDays(origEnd,   delta) : undefined,
          updatedAt: new Date().toISOString(),
        })
      } else if (type === 'resize-est-start') {
        const newStart = addDays(origStart, delta)
        if (task.estimateEndDate && newStart > task.estimateEndDate) return
        onUpdateTask({ ...task, estimateStartDate: newStart, updatedAt: new Date().toISOString() })
      } else if (type === 'resize-est-end') {
        const newEnd = addDays(origEnd, delta)
        if (task.estimateStartDate && newEnd < task.estimateStartDate) return
        onUpdateTask({ ...task, estimateEndDate: newEnd, updatedAt: new Date().toISOString() })
      } else if (type === 'move-est') {
        onUpdateTask({
          ...task,
          estimateStartDate: origStart ? addDays(origStart, delta) : undefined,
          estimateEndDate:   origEnd   ? addDays(origEnd,   delta) : undefined,
          updatedAt: new Date().toISOString(),
        })
      }
    }
    function onUp() { dragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [tasks, onUpdateTask])

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

  // ── Escape exits estimate mode ───────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && estimateMode) onExitEstimateMode?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [estimateMode, onExitEstimateMode])

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

  // ── Helpers ──────────────────────────────────────────────────
  function rowHeight(row: DisplayRow) {
    return row.type === 'header' ? GROUP_H : ROW_H
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
            if (row.type === 'header') {
              const pal = GROUP_PALETTE[row.colorIdx % GROUP_PALETTE.length]
              return (
                <div key={`gh-${row.parentKey}`}
                  className="flex items-center px-3 gap-2 border-b border-border/60"
                  style={{ height: GROUP_H, borderLeftWidth: 3, borderLeftColor: pal.border, background: pal.bg }}>
                  <span className="font-mono text-[10px] text-muted shrink-0">{row.parentKey}</span>
                  <span className="text-[11px] font-semibold text-fg truncate">{row.parentTitle}</span>
                  <span className="text-[10px] text-muted shrink-0 ml-auto">{row.count}</span>
                </div>
              )
            }

            const { task, isSubtask, colorIdx } = row
            const logged = totalLogged(task)
            const isHovered = hoveredRow === task.id
            const pal = colorIdx >= 0 ? GROUP_PALETTE[colorIdx % GROUP_PALETTE.length] : null

            return (
              <div key={task.id}
                className={`group grid items-center border-b border-border/40 cursor-pointer transition-colors duration-100 ${isHovered ? 'bg-surface' : 'hover:bg-surface/60'}`}
                style={{
                  gridTemplateColumns: '16px 1fr 48px 52px',
                  height: ROW_H,
                  paddingLeft: isSubtask ? 20 : 12,
                  paddingRight: 12,
                  borderLeftWidth: isSubtask && pal ? 3 : 0,
                  borderLeftColor: pal?.border,
                }}
                onMouseEnter={() => setHoveredRow(task.id)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={() => onEditTask(task)}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, task }) }}
              >
                {/* Status dot */}
                <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[task.status]}`} />

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
                  <span className={`font-mono text-[11px] ${task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10) && task.status !== 'done' ? 'text-red-400' : 'text-muted'}`}>
                    {task.dueDate ? task.dueDate.slice(5) : '—'}
                  </span>
                </div>
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
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

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
                  className={`absolute bottom-0 flex items-center justify-center text-[11px] border-r border-border/20 font-mono ${
                    isToday ? 'text-red-400 font-bold' : isWeekend ? 'text-muted/60' : 'text-fg/70'
                  }`}
                  style={{ left: i * DAY_W, width: DAY_W, height: 24 }}>
                  {fmtDay(day)}
                </div>
              )
            })}
          </div>
        </div>

        {/* Timeline body */}
        <div ref={rightRef} className="flex-1 overflow-auto"
          style={{ cursor: estimateMode ? 'crosshair' : 'default' }}
          onScroll={e => {
            const el = e.target as HTMLDivElement
            syncScroll('right')
            syncHeaderScroll(el.scrollLeft)
          }}>
          <div style={{ width: totalDays * DAY_W, position: 'relative', minHeight: '100%' }}>

            {/* Background: today highlight */}
            {todayIndex >= 0 && todayIndex < totalDays && (
              <div className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: todayIndex * DAY_W, width: DAY_W, background: 'rgba(239,68,68,0.04)' }} />
            )}

            {/* Background: weekends */}
            {days.map((day, i) => getDayOfWeek(day) === 0 || getDayOfWeek(day) === 6 ? (
              <div key={day} className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: i * DAY_W, width: DAY_W, background: 'rgba(255,255,255,0.03)' }} />
            ) : null)}

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
                return (
                  <div key={`ghr-${row.parentKey}`}
                    className="border-b border-border/50 flex items-center px-3"
                    style={{ height: h, borderLeftWidth: 3, borderLeftColor: pal.border, background: pal.bg }}>
                    <span className="text-[10px] text-muted font-semibold">{row.parentTitle}</span>
                  </div>
                )
              }

              const { task, isSubtask, colorIdx } = row
              const pal = colorIdx >= 0 ? GROUP_PALETTE[colorIdx % GROUP_PALETTE.length] : null
              const estS = task.estimateStartDate ? dateToIndex(task.estimateStartDate, timelineStart) : null
              const estE = task.estimateEndDate   ? dateToIndex(task.estimateEndDate,   timelineStart) : null
              const actS = task.actualStartDate   ? dateToIndex(task.actualStartDate,   timelineStart) : null
              const actE = task.actualEndDate     ? dateToIndex(task.actualEndDate,     timelineStart) : null
              const dueI = task.dueDate           ? dateToIndex(task.dueDate,           timelineStart) : null

              const bars    = STATUS_BAR[task.status] ?? STATUS_BAR.todo
              const logged  = totalLogged(task)
              const progress = task.estimateHours && logged > 0 ? Math.min(1, logged / task.estimateHours) : 0
              const isHovered = hoveredRow === task.id

              return (
                <div key={task.id}
                  className={`relative border-b border-border/30 transition-colors duration-100 ${isHovered ? 'bg-surface/40' : ''}`}
                  style={{
                    height: h,
                    borderLeftWidth: isSubtask && pal ? 3 : 0,
                    borderLeftColor: pal?.border,
                    paddingLeft: isSubtask ? 4 : 0,
                  }}
                  onMouseEnter={() => setHoveredRow(task.id)}
                  onMouseLeave={() => { setHoveredRow(null); setTooltip(null) }}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, task }) }}>

                  {/* Estimate mode hint overlay */}
                  {estimateMode && isHovered && (
                    <div className="absolute inset-0 bg-accent/5 pointer-events-none z-10 flex items-center justify-center">
                      <span className="text-[10px] text-accent-soft/70">Click to set estimate</span>
                    </div>
                  )}

                  {/* Click cells */}
                  {days.map((day, i) => {
                    const entry = task.timeEntries.find(e => e.date === day)
                    return (
                      <div key={day}
                        className="absolute top-0 bottom-0 cursor-pointer"
                        style={{ left: i * DAY_W, width: DAY_W }}
                        onClick={() => {
                          if (estimateMode) {
                            setEstModal({ task, date: day })
                          } else {
                            setEntryModal({ task, date: day, entry })
                          }
                        }}
                        onMouseEnter={e => {
                          if (!entry || estimateMode) return
                          setTooltip({ x: e.clientX, y: e.clientY, task, date: day, entry })
                        }}
                        onMouseLeave={() => setTooltip(null)} />
                    )
                  })}

                  {/* Estimate bar (draggable) */}
                  {estS !== null && estE !== null && estS < totalDays && estE >= 0 && (
                    <div
                      className="absolute rounded-sm bg-accent/15 border border-accent/25 cursor-move"
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
                        className={`absolute rounded border ${bars.actual} ${bars.border} cursor-move`}
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
                        : task.dueDate! < new Date().toISOString().slice(0, 10) ? 'bg-red-400'
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
          {estimateMode ? (
            <span className="text-[11px] text-accent-soft font-medium animate-pulse">
              ✏ Estimate mode — click on any task row to set estimate dates · Esc to exit
            </span>
          ) : (
            <>
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
                Click cell to log hours · Drag bar to move · Right-click for more
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── HOVER TOOLTIP ─── */}
      {tooltip && !estimateMode && (
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
              setEntryModal({ task: ctxMenu.task, date: new Date().toISOString().slice(0, 10) })
              setCtxMenu(null)
            }}>
            Log hours today
          </button>
          <button className="w-full text-left px-3 py-2 text-accent-soft hover:bg-accent/10 transition-colors"
            onClick={() => {
              setEstModal({ task: ctxMenu.task, date: ctxMenu.task.estimateStartDate ?? new Date().toISOString().slice(0, 10) })
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
          onSave={(startDate, endDate) => {
            onUpdateTask({ ...estModal.task, estimateStartDate: startDate, estimateEndDate: endDate, updatedAt: new Date().toISOString() })
            setEstModal(null)
            onExitEstimateMode?.()
          }}
          onClose={() => setEstModal(null)}
        />
      )}
    </div>
  )
}
