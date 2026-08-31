'use client'

import { useState } from 'react'
import type { Project, Sprint } from '@/lib/timeline-types'
import { generateId } from '@/lib/timeline-storage'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Props {
  project: Project | null
  onSave: (p: Project) => void
  onClose: () => void
}

export function ProjectForm({ project, onSave, onClose }: Props) {
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [startDayOfWeek,   setStartDayOfWeek]   = useState(project?.sprintConfig.defaultStartDayOfWeek ?? 1)
  const [weeksPerSprint,   setWeeksPerSprint]   = useState(project?.sprintConfig.defaultWeeksPerSprint ?? 2)
  const [startSprintNum,   setStartSprintNum]   = useState(project?.sprintConfig.startSprintNumber ?? 1)
  const [sprints,          setSprints]          = useState<Sprint[]>(project?.sprints ?? [])

  // New sprint form
  const [newSprintName, setNewSprintName] = useState('')
  const [newSprintStart, setNewSprintStart] = useState('')
  const [newSprintEnd, setNewSprintEnd] = useState('')

  function handleAutoGenerateSprint() {
    const last = sprints[sprints.length - 1]
    let start: Date
    if (last) {
      start = new Date(last.endDate)
      start.setDate(start.getDate() + 1)
    } else {
      start = new Date()
      while (start.getDay() !== startDayOfWeek) {
        start.setDate(start.getDate() + 1)
      }
    }
    const end = new Date(start)
    end.setDate(end.getDate() + weeksPerSprint * 7 - 1)
    const num = startSprintNum + sprints.length
    function fmt(d: Date) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }
    setSprints(prev => [...prev, {
      id: generateId(),
      name: `Sprint ${num}`,
      startDate: fmt(start),
      endDate: fmt(end),
      isManual: false,
    }])
  }

  function handleAddManualSprint() {
    if (!newSprintStart || !newSprintEnd) return
    setSprints(prev => [...prev, {
      id: generateId(),
      name: newSprintName || `Sprint ${prev.length + 1}`,
      startDate: newSprintStart,
      endDate: newSprintEnd,
      isManual: true,
    }])
    setNewSprintName('')
    setNewSprintStart('')
    setNewSprintEnd('')
  }

  function handleRemoveSprint(id: string) {
    setSprints(prev => prev.filter(s => s.id !== id))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const now = new Date().toISOString()
    onSave({
      id: project?.id ?? generateId(),
      name: name.trim(),
      description: description.trim() || undefined,
      sprintConfig: { defaultStartDayOfWeek: startDayOfWeek, defaultWeeksPerSprint: weeksPerSprint, startSprintNumber: startSprintNum },
      sprints,
      jiraConfig: project?.jiraConfig,
      createdAt: project?.createdAt ?? now,
      updatedAt: now,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-display text-lg font-semibold text-fg">
            {project ? 'Edit Project' : 'New Project'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-fg transition-colors text-xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-fg">Project Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Project"
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-fg">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none resize-none"
            />
          </div>

          {/* Sprint Config */}
          <div className="rounded-xl border border-border p-4 space-y-4">
            <h3 className="font-display font-medium text-fg text-sm">Sprint Config</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted">Default Start Day</label>
                <select
                  value={startDayOfWeek}
                  onChange={e => setStartDayOfWeek(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                >
                  {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted">Weeks per Sprint</label>
                <input
                  type="number" min={1} max={8} value={weeksPerSprint}
                  onChange={e => setWeeksPerSprint(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg font-mono focus:border-accent focus:outline-none"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-xs text-muted">Sprint bắt đầu từ số</label>
                <input
                  type="number" min={1} value={startSprintNum}
                  onChange={e => setStartSprintNum(Number(e.target.value))}
                  placeholder="1"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg font-mono focus:border-accent focus:outline-none"
                />
                <p className="text-[11px] text-muted">Auto-generate sẽ đặt tên Sprint {startSprintNum}, Sprint {startSprintNum + 1}, Sprint {startSprintNum + 2}…</p>
              </div>
            </div>
          </div>

          {/* Sprints */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-medium text-fg text-sm">Sprints ({sprints.length})</h3>
              <button
                type="button"
                onClick={handleAutoGenerateSprint}
                className="text-xs text-accent-soft hover:text-accent transition-colors"
              >
                + Auto-generate next
              </button>
            </div>

            {sprints.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {sprints.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2">
                    <span className="text-xs text-muted font-mono w-5">{i + 1}</span>
                    <span className="flex-1 text-sm text-fg truncate">{s.name}</span>
                    <span className="text-xs text-muted font-mono">{s.startDate} → {s.endDate}</span>
                    {s.isManual && <span className="text-xs text-accent-soft">manual</span>}
                    <button type="button" onClick={() => handleRemoveSprint(s.id)} className="text-muted hover:text-red-400 transition-colors ml-1">×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Manual sprint add */}
            <div className="pt-1 border-t border-border space-y-2">
              <p className="text-xs text-muted">Add sprint manually</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  placeholder="Sprint name"
                  value={newSprintName}
                  onChange={e => setNewSprintName(e.target.value)}
                  className="col-span-3 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-fg placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <input
                  type="date"
                  value={newSprintStart}
                  onChange={e => {
                    setNewSprintStart(e.target.value)
                    if (e.target.value && !newSprintEnd) {
                      const end = new Date(e.target.value)
                      end.setDate(end.getDate() + weeksPerSprint * 7 - 1)
                      setNewSprintEnd(end.toISOString().slice(0, 10))
                    }
                  }}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                />
                <input
                  type="date"
                  value={newSprintEnd}
                  onChange={e => setNewSprintEnd(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddManualSprint}
                  disabled={!newSprintStart || !newSprintEnd}
                  className="rounded-lg bg-accent/20 text-accent-soft text-xs py-1.5 hover:bg-accent/30 transition-colors disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border py-2.5 text-sm text-muted hover:text-fg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
            >
              {project ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
