'use client'

import { useState } from 'react'
import type { Task, TimeEntry } from '@/lib/timeline-types'
import { generateId } from '@/lib/timeline-storage'

interface Props {
  task: Task
  date: string
  existingEntry?: TimeEntry
  onSave: (taskId: string, entry: TimeEntry) => void
  onDelete?: (taskId: string, entryId: string) => void
  onClose: () => void
}

export function TimeEntryModal({ task, date, existingEntry, onSave, onDelete, onClose }: Props) {
  const [hours, setHours] = useState(existingEntry?.hours.toString() ?? '')
  const [note, setNote] = useState(existingEntry?.note ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hours || Number(hours) <= 0) return
    onSave(task.id, {
      id: existingEntry?.id ?? generateId(),
      date,
      hours: Number(hours),
      source: 'manual',
      note: note.trim() || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="font-display font-medium text-fg text-sm">{task.title}</h3>
            <p className="text-xs text-muted font-mono">{date}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-fg text-xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted">Hours worked</label>
            <input
              type="number"
              min={0.25}
              max={24}
              step={0.25}
              value={hours}
              onChange={e => setHours(e.target.value)}
              autoFocus
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-lg text-fg font-mono focus:border-accent focus:outline-none text-center"
              placeholder="0"
            />
            <div className="flex gap-1">
              {[0.5, 1, 2, 4, 8].map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h.toString())}
                  className="flex-1 rounded-md py-1 text-xs text-muted border border-border hover:border-accent hover:text-accent-soft transition-colors"
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted">Note (optional)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What did you work on?"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            {existingEntry && onDelete && (
              <button
                type="button"
                onClick={() => { onDelete(task.id, existingEntry.id); onClose() }}
                className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Delete
              </button>
            )}
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted hover:text-fg transition-colors">Cancel</button>
            <button type="submit" className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors">Log</button>
          </div>
        </form>
      </div>
    </div>
  )
}
