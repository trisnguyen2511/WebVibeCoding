'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ToolShell from '@/components/tool-shell'
import { getProjects, saveProject, deleteProject, importData } from '@/lib/timeline-storage'
import type { Project } from '@/lib/timeline-types'
import { ProjectForm } from './components/ProjectForm'

export default function TimelinePage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)

  useEffect(() => {
    setProjects(getProjects())
  }, [])

  function handleSave(p: Project) {
    saveProject(p)
    setProjects(getProjects())
    setShowForm(false)
    setEditProject(null)
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this project and all its tasks?')) return
    deleteProject(id)
    setProjects(getProjects())
  }

  return (
    <ToolShell name="Timeline" icon="📅" description="Scrum project & Gantt chart manager" wide>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-fg">Projects</h2>
          <button
            onClick={() => { setEditProject(null); setShowForm(true) }}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
          >
            + New Project
          </button>
        </div>

        {/* Project grid */}
        {projects.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-12 text-center">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-fg font-medium mb-1">No projects yet</p>
            <p className="text-muted text-sm">Create your first project to get started</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(p => (
              <div
                key={p.id}
                className="group relative rounded-xl border border-border bg-surface p-5 hover:border-accent/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/tools/timeline/${p.id}`)}
              >
                <div className="mb-3">
                  <h3 className="font-display font-semibold text-fg group-hover:text-accent-soft transition-colors">{p.name}</h3>
                  {p.description && <p className="text-muted text-sm mt-1 line-clamp-2">{p.description}</p>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted font-mono">
                  <span>{p.sprints.length} sprints</span>
                  <span>•</span>
                  <span>Sprint {p.sprintConfig.defaultWeeksPerSprint}w</span>
                </div>
                {/* Actions */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); setEditProject(p); setShowForm(true) }}
                    className="rounded-md p-1.5 text-muted hover:text-fg hover:bg-border transition-colors"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                    className="rounded-md p-1.5 text-muted hover:text-red-400 hover:bg-border transition-colors"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Import */}
        <div className="flex justify-end">
          <label className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-fg hover:border-accent/50 transition-colors">
            Import JSON
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => {
                  try {
                    const data = JSON.parse(ev.target?.result as string)
                    importData(data)
                    setProjects(getProjects())
                  } catch {
                    alert('Invalid JSON file')
                  }
                }
                reader.readAsText(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      {/* Project form modal */}
      {showForm && (
        <ProjectForm
          project={editProject}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditProject(null) }}
        />
      )}
    </ToolShell>
  )
}
