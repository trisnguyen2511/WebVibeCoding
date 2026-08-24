'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import type { Task, Sprint, TimeEntry } from '@/lib/timeline-types'
import { TimeEntryModal } from './TimeEntryModal'

const DAY_W = 36
const ROW_H = 52
const HEADER_H = 60

function dateToIndex(date: string, start: string): number {
  const ms = new Date(date + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()
  return Math.floor(ms / 86400000)
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDay(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return d.getDate().toString()
}

function getDayOfWeek(date: string): number {
  return new Date(date + 'T00:00:00').getDay()
}

const STATUS_DOT: Record<string, string> = {
  todo: 'bg-muted',
  'in-progress': 'bg-blue-400',
  done: 'bg-green-400',
  blocked: 'bg-red-400',
}

interface DragState {
  taskId: string
  handle: 'start' | 'end'
  startX: number
  originalDate: string
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
}

export function GanttChart({ tasks, sprints, timelineStart, timelineEnd, onUpdateTask, onUpdateEntry, onDeleteEntry, onEditTask }: Props) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const [entryModal, setEntryModal] = useState<{ task: Task; date: string; entry?: TimeEntry } | null>(null)
  const dragRef = useRef<DragState | null>(null)

  const totalDays = dateToIndex(timelineEnd, timelineStart) + 1
  const todayIndex = dateToIndex(new Date().toISOString().slice(0, 10), timelineStart)

  const days = Array.from({ length: totalDays }, (_, i) => addDays(timelineStart, i))

  function handleLeftScroll() {
    if (rightRef.current && leftRef.current) {
      rightRef.current.scrollTop = leftRef.current.scrollTop
    }
  }

  function handleRightScroll() {
    if (leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop
    }
  }

  const handleMouseDown = useCallback((e: React.MouseEvent, taskId: string, handle: 'start' | 'end', date: string) => {
    e.preventDefault()
    dragRef.current = { taskId, handle, startX: e.clientX, originalDate: date }
  }, [])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return
      const { taskId, handle, startX, originalDate } = dragRef.current
      const dx = e.clientX - startX
      const daysDelta = Math.round(dx / DAY_W)
      if (daysDelta === 0) return
      const newDate = addDays(originalDate, daysDelta)
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      if (handle === 'start') {
        onUpdateTask({ ...task, actualStartDate: newDate, updatedAt: new Date().toISOString() })
      } else {
        onUpdateTask({ ...task, actualEndDate: newDate, updatedAt: new Date().toISOString() })
      }
      dragRef.current = { ...dragRef.current, startX: e.clientX, originalDate: newDate }
    }
    function onMouseUp() {
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [tasks, onUpdateTask])

  // Generate month groups for header
  const monthGroups: { month: string; start: number; count: number }[] = []
  let currentMonth = ''
  let currentStart = 0
  days.forEach((day, i) => {
    const month = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    if (month !== currentMonth) {
      if (currentMonth) monthGroups.push({ month: currentMonth, start: currentStart, count: i - currentStart })
      currentMonth = month
      currentStart = i
    }
  })
  if (currentMonth) monthGroups.push({ month: currentMonth, start: currentStart, count: days.length - currentStart })

  return (
    <div className="flex flex-1 overflow-hidden border border-border rounded-xl">
      {/* Left panel */}
      <div className="flex flex-col" style={{ width: 320, minWidth: 320 }}>
        {/* Left header */}
        <div className="border-b border-border bg-surface px-4 flex items-end pb-2" style={{ height: HEADER_H }}>
          <div className="grid w-full text-xs text-muted font-medium" style={{ gridTemplateColumns: '1fr 60px 60px' }}>
            <span>Task</span>
            <span className="text-right">Est.h</span>
            <span className="text-right">Due</span>
          </div>
        </div>

        {/* Left rows */}
        <div
          ref={leftRef}
          className="flex-1 overflow-y-scroll overflow-x-hidden"
          onScroll={handleLeftScroll}
          style={{ scrollbarWidth: 'none' }}
        >
          {tasks.map(task => (
            <div
              key={task.id}
              className="grid border-b border-border/50 items-center px-4 hover:bg-surface/50 cursor-pointer"
              style={{ gridTemplateColumns: '1fr 60px 60px', height: ROW_H }}
              onClick={() => onEditTask(task)}
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[task.status]}`} />
                  {task.jiraKey && <span className="font-mono text-xs text-accent-soft shrink-0">{task.jiraKey}</span>}
                </div>
                <p className="text-xs text-fg truncate leading-tight">{task.title}</p>
              </div>
              <span className="text-right font-mono text-xs text-muted">
                {task.estimateHours ? `${task.estimateHours}h` : '—'}
              </span>
              <span className="text-right font-mono text-xs text-muted">
                {task.dueDate ? task.dueDate.slice(5) : '—'}
              </span>
            </div>
          ))}
          <div style={{ height: 40 }} />
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-border" />

      {/* Right panel */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Timeline header */}
        <div
          className="overflow-x-scroll overflow-y-hidden border-b border-border bg-surface"
          style={{ height: HEADER_H }}
          id="gantt-header"
        >
          <div style={{ width: totalDays * DAY_W, position: 'relative', height: HEADER_H }}>
            {/* Month row */}
            {monthGroups.map((g, i) => (
              <div
                key={i}
                className="absolute top-0 text-xs text-muted font-medium border-r border-border/30 flex items-center px-1"
                style={{ left: g.start * DAY_W, width: g.count * DAY_W, height: 20 }}
              >
                {g.month}
              </div>
            ))}

            {/* Sprint row */}
            {sprints.map(sprint => {
              const start = Math.max(0, dateToIndex(sprint.startDate, timelineStart))
              const end = Math.min(totalDays - 1, dateToIndex(sprint.endDate, timelineStart))
              if (end < 0 || start >= totalDays) return null
              return (
                <div
                  key={sprint.id}
                  className="absolute border-l-2 border-accent/40 bg-accent/5 flex items-center px-1"
                  style={{ left: start * DAY_W, width: (end - start + 1) * DAY_W, top: 20, height: 18 }}
                >
                  <span className="text-xs text-accent-soft truncate">{sprint.name}</span>
                </div>
              )
            })}

            {/* Day numbers */}
            {days.map((day, i) => {
              const isWeekend = getDayOfWeek(day) === 0 || getDayOfWeek(day) === 6
              const isToday = i === todayIndex
              return (
                <div
                  key={day}
                  className={`absolute bottom-0 flex items-center justify-center text-xs border-r border-border/20 ${isToday ? 'text-accent-soft font-bold' : isWeekend ? 'text-muted/40' : 'text-muted'}`}
                  style={{ left: i * DAY_W, width: DAY_W, height: 22 }}
                >
                  {formatDay(day)}
                </div>
              )
            })}
          </div>
        </div>

        {/* Timeline body */}
        <div
          ref={rightRef}
          className="flex-1 overflow-scroll"
          onScroll={e => {
            handleRightScroll()
            const header = document.getElementById('gantt-header')
            if (header) header.scrollLeft = (e.target as HTMLDivElement).scrollLeft
          }}
        >
          <div style={{ width: totalDays * DAY_W, position: 'relative' }}>
            {/* Today line */}
            {todayIndex >= 0 && todayIndex < totalDays && (
              <div
                className="absolute top-0 bottom-0 z-10 pointer-events-none"
                style={{ left: todayIndex * DAY_W + DAY_W / 2, width: 2, background: 'rgba(239,68,68,0.7)' }}
              />
            )}

            {/* Weekend columns */}
            {days.map((day, i) => {
              const isWeekend = getDayOfWeek(day) === 0 || getDayOfWeek(day) === 6
              if (!isWeekend) return null
              return (
                <div
                  key={day}
                  className="absolute top-0 bottom-0 bg-white/[0.02]"
                  style={{ left: i * DAY_W, width: DAY_W }}
                />
              )
            })}

            {/* Sprint separators */}
            {sprints.map(sprint => {
              const idx = dateToIndex(sprint.startDate, timelineStart)
              if (idx < 0 || idx >= totalDays) return null
              return (
                <div
                  key={sprint.id}
                  className="absolute top-0 bottom-0 border-l-2 border-accent/20 pointer-events-none z-10"
                  style={{ left: idx * DAY_W }}
                />
              )
            })}

            {/* Task rows */}
            {tasks.map(task => {
              const estStart = task.estimateStartDate ? dateToIndex(task.estimateStartDate, timelineStart) : null
              const estEnd = task.estimateEndDate ? dateToIndex(task.estimateEndDate, timelineStart) : null
              const actStart = task.actualStartDate ? dateToIndex(task.actualStartDate, timelineStart) : null
              const actEnd = task.actualEndDate ? dateToIndex(task.actualEndDate, timelineStart) : null
              const dueIdx = task.dueDate ? dateToIndex(task.dueDate, timelineStart) : null

              return (
                <div
                  key={task.id}
                  className="relative border-b border-border/50 hover:bg-surface/20"
                  style={{ height: ROW_H }}
                >
                  {/* Day clickable cells */}
                  {days.map((day, i) => {
                    const entry = task.timeEntries.find(e => e.date === day)
                    return (
                      <div
                        key={day}
                        className="absolute top-0 bottom-0 cursor-pointer"
                        style={{ left: i * DAY_W, width: DAY_W }}
                        onClick={() => setEntryModal({ task, date: day, entry })}
                      />
                    )
                  })}

                  {/* Estimate bar */}
                  {estStart !== null && estEnd !== null && estStart < totalDays && estEnd >= 0 && (
                    <div
                      className="absolute rounded-full bg-accent/20 border border-accent/30 pointer-events-none"
                      style={{
                        left: Math.max(0, estStart) * DAY_W + 2,
                        width: (Math.min(totalDays - 1, estEnd) - Math.max(0, estStart) + 1) * DAY_W - 4,
                        top: ROW_H / 2 - 10,
                        height: 20,
                      }}
                    />
                  )}

                  {/* Actual bar */}
                  {actStart !== null && actEnd !== null && actStart < totalDays && actEnd >= 0 && (
                    <div
                      className="absolute rounded-full bg-accent/70 border border-accent"
                      style={{
                        left: Math.max(0, actStart) * DAY_W + 4,
                        width: (Math.min(totalDays - 1, actEnd) - Math.max(0, actStart) + 1) * DAY_W - 8,
                        top: ROW_H / 2 - 6,
                        height: 12,
                      }}
                    >
                      {/* Drag start handle */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center"
                        onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, task.id, 'start', task.actualStartDate!) }}
                      >
                        <div className="w-1 h-4 rounded-full bg-white/50" />
                      </div>
                      {/* Drag end handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center"
                        onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, task.id, 'end', task.actualEndDate!) }}
                      >
                        <div className="w-1 h-4 rounded-full bg-white/50" />
                      </div>
                    </div>
                  )}

                  {/* Time entry indicators */}
                  {task.timeEntries.map(entry => {
                    const idx = dateToIndex(entry.date, timelineStart)
                    if (idx < 0 || idx >= totalDays) return null
                    const intensity = Math.min(1, entry.hours / 8)
                    return (
                      <div
                        key={entry.id}
                        className="absolute rounded-sm pointer-events-none"
                        style={{
                          left: idx * DAY_W + 4,
                          width: DAY_W - 8,
                          bottom: 6,
                          height: 6,
                          background: `rgba(124,58,237,${0.3 + intensity * 0.7})`,
                        }}
                        title={`${entry.date}: ${entry.hours}h`}
                      />
                    )
                  })}

                  {/* Due date marker */}
                  {dueIdx !== null && dueIdx >= 0 && dueIdx < totalDays && (
                    <div
                      className="absolute pointer-events-none"
                      style={{ left: dueIdx * DAY_W + DAY_W / 2 - 4, top: 6, fontSize: 10 }}
                    >
                      🔴
                    </div>
                  )}
                </div>
              )
            })}

            {/* Bottom spacer */}
            <div style={{ height: 40 }} />
          </div>
        </div>
      </div>

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
    </div>
  )
}
