'use client'

import { useState } from 'react'
import type { Task, TimeEntry } from '@/lib/timeline-types'
import { TimeEntryModal } from './TimeEntryModal'

const TODAY = new Date().toISOString().slice(0, 10)

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-muted/30 text-muted',
  'in-progress': 'bg-blue-500/20 text-blue-400',
  done: 'bg-green-500/20 text-green-400',
  blocked: 'bg-red-500/20 text-red-400',
}

interface Props {
  tasks: Task[]
  onUpdateEntry: (taskId: string, entry: TimeEntry) => void
  onDeleteEntry: (taskId: string, entryId: string) => void
  onClose: () => void
}

export function TodayPanel({ tasks, onUpdateEntry, onDeleteEntry, onClose }: Props) {
  const [logModal, setLogModal] = useState<{ task: Task; entry?: TimeEntry } | null>(null)

  // Tasks active today: have time entries today OR actual dates cover today
  const todayTasks = tasks.filter(t => {
    const hasEntry = t.timeEntries.some(e => e.date === TODAY)
    const coversToday = t.actualStartDate && t.actualStartDate <= TODAY && (!t.actualEndDate || t.actualEndDate >= TODAY)
    return hasEntry || coversToday
  })

  const totalHours = todayTasks.reduce((sum, t) => {
    return sum + t.timeEntries.filter(e => e.date === TODAY).reduce((s, e) => s + e.hours, 0)
  }, 0)

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-surface border-l border-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-display text-lg font-semibold text-fg">Today</h2>
            <p className="text-xs text-muted">{formatDate(TODAY)}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-mono text-xl font-bold text-accent-soft">{totalHours.toFixed(1)}h</p>
              <p className="text-xs text-muted">logged</p>
            </div>
            <button onClick={onClose} className="text-muted hover:text-fg text-xl ml-2">×</button>
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {todayTasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-3xl mb-2">🌅</p>
              <p className="text-fg font-medium text-sm mb-1">No tasks today</p>
              <p className="text-muted text-xs">Tasks with actual dates covering today appear here</p>
            </div>
          ) : (
            todayTasks.map(task => {
              const todayEntry = task.timeEntries.find(e => e.date === TODAY)
              const todayHours = task.timeEntries.filter(e => e.date === TODAY).reduce((s, e) => s + e.hours, 0)
              return (
                <div key={task.id} className="rounded-xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {task.jiraKey && (
                        <p className="text-xs font-mono text-accent-soft mb-0.5">{task.jiraKey}</p>
                      )}
                      <p className="text-sm font-medium text-fg leading-snug">{task.title}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[task.status]}`}>
                      {task.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold text-fg">{todayHours > 0 ? `${todayHours}h` : '—'}</span>
                      {todayEntry?.note && <span className="text-xs text-muted truncate">{todayEntry.note}</span>}
                    </div>
                    <button
                      onClick={() => setLogModal({ task, entry: todayEntry })}
                      className="rounded-lg bg-accent/20 px-3 py-1.5 text-xs text-accent-soft hover:bg-accent/30 transition-colors"
                    >
                      {todayEntry ? 'Edit hours' : 'Log hours'}
                    </button>
                  </div>

                  {task.estimateHours && (
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted mb-1">
                        <span>Progress vs estimate</span>
                        <span className="font-mono">
                          {task.timeEntries.reduce((s, e) => s + e.hours, 0).toFixed(1)} / {task.estimateHours}h
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-border overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${Math.min(100, (task.timeEntries.reduce((s, e) => s + e.hours, 0) / task.estimateHours) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted text-center">
            {tasks.length - todayTasks.length} other tasks in this project
          </p>
        </div>
      </div>

      {logModal && (
        <TimeEntryModal
          task={logModal.task}
          date={TODAY}
          existingEntry={logModal.entry}
          onSave={onUpdateEntry}
          onDelete={onDeleteEntry}
          onClose={() => setLogModal(null)}
        />
      )}
    </>
  )
}
