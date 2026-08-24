'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Upload, Calendar, Layers, Clock, ChevronRight } from 'lucide-react'
import ToolShell from '@/components/tool-shell'
import { getProjects, saveProject, deleteProject, importData } from '@/lib/timeline-storage'
import type { Project } from '@/lib/timeline-types'
import { ProjectForm } from './components/ProjectForm'

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TimelinePage() {
  const router = useRouter()
  const [projects,    setProjects]    = useState<Project[]>([])
  const [showForm,    setShowForm]    = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    setProjects(getProjects())
  }, [])

  function handleSave(p: Project) {
    saveProject(p)
    setProjects(getProjects())
    setShowForm(false)
    setEditProject(null)
  }

  function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this project and all its tasks?')) return
    deleteProject(id)
    setProjects(getProjects())
  }

  function handleEdit(p: Project, e: React.MouseEvent) {
    e.stopPropagation()
    setEditProject(p)
    setShowForm(true)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        importData(data)
        setProjects(getProjects())
        setImportError('')
      } catch {
        setImportError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <ToolShell name="Timeline" icon="📅" description="Scrum project manager with Gantt chart and Jira sync" wide>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-fg">Projects</h2>
            <p className="text-muted text-sm mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-fg hover:border-accent/40 transition-all">
              <Upload size={14} />
              Import
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
            <button
              onClick={() => { setEditProject(null); setShowForm(true) }}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors shadow-sm shadow-accent/20"
            >
              <Plus size={15} />
              New Project
            </button>
          </div>
        </div>

        {importError && (
          <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-400">
            {importError}
          </p>
        )}

        {/* Grid */}
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface/50 p-16 text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Calendar size={26} className="text-accent-soft" />
            </div>
            <p className="font-display text-lg font-semibold text-fg mb-2">No projects yet</p>
            <p className="text-muted text-sm mb-6">Create your first project to start tracking sprints and tasks</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
            >
              <Plus size={14} />
              Create Project
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(p => {
              const today = new Date().toISOString().slice(0, 10)
              const activeSprint = p.sprints.find(s => s.startDate <= today && s.endDate >= today)
              return (
                <div
                  key={p.id}
                  className="group relative rounded-2xl border border-border bg-surface p-5 hover:border-accent/40 hover:bg-surface/80 transition-all duration-200 cursor-pointer"
                  onClick={() => router.push(`/tools/timeline/${p.id}`)}
                >
                  {/* Project name */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-8">
                      <h3 className="font-display font-semibold text-fg group-hover:text-accent-soft transition-colors truncate">
                        {p.name}
                      </h3>
                      {p.description && (
                        <p className="text-muted text-sm mt-0.5 line-clamp-1">{p.description}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-muted/40 group-hover:text-accent-soft/60 transition-colors shrink-0 mt-0.5" />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs text-muted mb-3">
                    <span className="flex items-center gap-1">
                      <Layers size={11} />
                      {p.sprints.length} sprint{p.sprints.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-border">·</span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {p.sprintConfig.defaultWeeksPerSprint}w each
                    </span>
                    <span className="text-border">·</span>
                    <span>updated {formatRelativeDate(p.updatedAt)}</span>
                  </div>

                  {/* Active sprint badge */}
                  {activeSprint ? (
                    <div className="flex items-center gap-1.5 rounded-lg bg-accent/10 border border-accent/20 px-2.5 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-soft animate-pulse" />
                      <span className="text-xs text-accent-soft font-medium">{activeSprint.name} active</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-lg bg-border/30 px-2.5 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted/60" />
                      <span className="text-xs text-muted">No active sprint</span>
                    </div>
                  )}

                  {/* Hover actions */}
                  <div className="absolute top-3 right-3 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={e => handleEdit(p, e)}
                      className="rounded-lg p-1.5 text-muted hover:text-fg hover:bg-border/60 transition-colors"
                      title="Edit project"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={e => handleDelete(p.id, e)}
                      className="rounded-lg p-1.5 text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete project"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
