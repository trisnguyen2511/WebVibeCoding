'use client'

import { useState } from 'react'
import type { Task, Sprint, TaskStatus } from '@/lib/timeline-types'

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
]

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

interface Props {
  task: Task | null
  projectId: string
  sprints: Sprint[]
  taskCount: number
  onSave: (t: Task) => void
  onClose: () => void
}

export function TaskForm({ task, projectId, sprints, taskCount, onSave, onClose }: Props) {
  const [jiraKey, setJiraKey] = useState(task?.jiraKey ?? '')
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [link, setLink] = useState(task?.link ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  const [sprintId, setSprintId] = useState(task?.sprintId ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo')
  const [estimateStart, setEstimateStart] = useState(task?.estimateStartDate ?? '')
  const [estimateEnd, setEstimateEnd] = useState(task?.estimateEndDate ?? '')
  const [estimateHours, setEstimateHours] = useState(task?.estimateHours?.toString() ?? '')
  const [actualStart, setActualStart] = useState(task?.actualStartDate ?? '')
  const [actualEnd, setActualEnd] = useState(task?.actualEndDate ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const now = new Date().toISOString()
    onSave({
      id: task?.id ?? generateId(),
      projectId,
      sprintId: sprintId || undefined,
      jiraId: task?.jiraId,
      jiraKey: jiraKey.trim() || undefined,
      parentKey: task?.parentKey,
      title: title.trim(),
      description: description.trim() || undefined,
      link: link.trim() || undefined,
      dueDate: dueDate || undefined,
      estimateStartDate: estimateStart || undefined,
      estimateEndDate: estimateEnd || undefined,
      estimateHours: estimateHours ? Number(estimateHours) : undefined,
      actualStartDate: actualStart || undefined,
      actualEndDate: actualEnd || undefined,
      status,
      assignee: task?.assignee,
      timeEntries: task?.timeEntries ?? [],
      order: task?.order ?? taskCount,
      createdAt: task?.createdAt ?? now,
      updatedAt: now,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-lg font-semibold text-fg">
            {task ? 'Edit Task' : 'New Task'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-fg transition-colors text-xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Jira Key</label>
              <input
                value={jiraKey}
                onChange={e => setJiraKey(e.target.value)}
                placeholder="PROJ-123"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg font-mono placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-muted">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="Task title..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Link</label>
              <input
                value={link}
                onChange={e => setLink(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted">Sprint</label>
              <select
                value={sprintId}
                onChange={e => setSprintId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              >
                <option value="">No sprint</option>
                {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4 space-y-3">
            <h4 className="text-xs font-medium text-fg">Estimate</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted">Start Date</label>
                <input type="date" value={estimateStart} onChange={e => setEstimateStart(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted">End Date</label>
                <input type="date" value={estimateEnd} onChange={e => setEstimateEnd(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted">Est. Hours</label>
                <input type="number" min={0} step={0.5} value={estimateHours} onChange={e => setEstimateHours(e.target.value)} placeholder="0" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-fg font-mono focus:border-accent focus:outline-none" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border p-4 space-y-3">
            <h4 className="text-xs font-medium text-fg">Actual</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted">Start Date</label>
                <input type="date" value={actualStart} onChange={e => setActualStart(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted">End Date</label>
                <input type="date" value={actualEnd} onChange={e => setActualEnd(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted">Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none" />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border py-2.5 text-sm text-muted hover:text-fg transition-colors">Cancel</button>
            <button type="submit" className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors">
              {task ? 'Save Changes' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
