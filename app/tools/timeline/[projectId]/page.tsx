'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Calendar, RefreshCw, Download, ChevronRight,
  ListTodo, Clock, Flag, Keyboard,
} from 'lucide-react'
import { ToolShell } from '@/components/tool-shell'
import {
  getProject, getTasks, saveProject, saveTask, deleteTask,
  upsertTimeEntry, deleteTimeEntry, exportData, PROXY_TOKEN_KEY,
} from '@/lib/timeline-storage'
import type { Project, Task, Sprint, TimeEntry, JiraConfig } from '@/lib/timeline-types'
import { GanttChart } from '../components/GanttChart'
import { TaskForm } from '../components/TaskForm'
import { TodayPanel } from '../components/TodayPanel'
import { JiraPanel } from '../components/JiraPanel'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getTimelineRange(tasks: Task[], sprints: Sprint[]): { start: string; end: string } {
  const today = localToday()
  const dates: string[] = [today]
  for (const t of tasks) {
    if (t.estimateStartDate) dates.push(t.estimateStartDate)
    if (t.estimateEndDate)   dates.push(t.estimateEndDate)
    if (t.actualStartDate)   dates.push(t.actualStartDate)
    if (t.actualEndDate)     dates.push(t.actualEndDate)
    if (t.dueDate)           dates.push(t.dueDate)
  }
  for (const s of sprints) {
    dates.push(s.startDate)
    dates.push(s.endDate)
  }
  const sorted = dates.filter((d, i) => dates.indexOf(d) === i).sort()
  return {
    start: addDays(sorted[0], -7),
    end:   addDays(sorted[sorted.length - 1], 14),
  }
}

interface PageProps {
  params: { projectId: string }
}

export default function ProjectPage({ params }: PageProps) {
  const { projectId } = params
  const router = useRouter()

  const [project,         setProject]         = useState<Project | null>(null)
  const [tasks,           setTasks]           = useState<Task[]>([])
  const [selectedSprintId, setSelectedSprintId] = useState<string>('')
  const [showTaskForm,    setShowTaskForm]    = useState(false)
  const [editTask,        setEditTask]        = useState<Task | null>(null)
  const [showToday,       setShowToday]       = useState(false)
  const [showJira,        setShowJira]        = useState(false)
  const [showShortcuts,   setShowShortcuts]   = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)

  useEffect(() => {
    const p = getProject(projectId)
    if (!p) { router.push('/tools/timeline'); return }
    setProject(p)
    setTasks(getTasks(projectId))
    const today = new Date().toISOString().slice(0, 10)
    const cur = p.sprints.find(s => s.startDate <= today && s.endDate >= today)
    if (cur) setSelectedSprintId(cur.id)
  }, [projectId, router])

  function reload() {
    setTasks(getTasks(projectId))
    const p = getProject(projectId)
    if (p) setProject(p)
  }

  // ── Keyboard shortcuts ──────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    switch (e.key.toLowerCase()) {
      case 'n': e.preventDefault(); setEditTask(null); setShowTaskForm(true);  break
      case 't': e.preventDefault(); setShowToday(true);  break
      case 'j': e.preventDefault(); setShowJira(true);   break
      case 'x': e.preventDefault(); handleExport();       break
      case '?': e.preventDefault(); setShowShortcuts(v => !v); break
      case 'escape':
        setShowTaskForm(false); setEditTask(null)
        setShowToday(false); setShowJira(false); setShowShortcuts(false)
        break
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ── Handlers ────────────────────────────────────────────────
  function handleSaveTask(task: Task) {
    saveTask(task); reload()
    setShowTaskForm(false); setEditTask(null)
  }

  function handleDeleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    deleteTask(id); reload()
  }

  function handleUpdateTask(task: Task)                         { saveTask(task); reload() }
  function handleReorderTasks(reordered: Task[])                { for (const t of reordered) saveTask(t); reload() }
  function handleUpdateEntry(taskId: string, entry: TimeEntry)  { upsertTimeEntry(taskId, entry); reload() }
  function handleDeleteEntry(taskId: string, entryId: string)   { deleteTimeEntry(taskId, entryId); reload() }

  function handleUpdateJiraConfig(config: JiraConfig) {
    if (!project) return
    const updated = { ...project, jiraConfig: config, updatedAt: new Date().toISOString() }
    saveProject(updated); setProject(updated)
  }

  function handleSyncTasks(syncedTasks: Task[]) {
    const newIds = new Set(syncedTasks.map(t => t.id))
    for (const t of tasks) {
      if (!newIds.has(t.id)) deleteTask(t.id)
    }
    for (const t of syncedTasks) saveTask(t)
    reload()
  }

  function handleSyncTime(updates: { taskId: string; entries: TimeEntry[] }[]) {
    for (const { taskId, entries } of updates) {
      const task = tasks.find(t => t.id === taskId)
      if (!task) continue
      saveTask({ ...task, timeEntries: entries, updatedAt: new Date().toISOString() })
    }
    reload()
  }

  function handleExport() {
    if (!project) return
    const hasJiraToken  = !!project.jiraConfig?.token
    const hasProxyToken = !!(typeof window !== 'undefined' && localStorage.getItem(PROXY_TOKEN_KEY))
    if (hasJiraToken || hasProxyToken) {
      setShowExportModal(true)
    } else {
      doExport(false, false)
    }
  }

  function doExport(includeSensitive: boolean, includeProxyToken: boolean) {
    if (!project) return
    const data = exportData(projectId, { includeSensitive, includeProxyToken })
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `timeline-${project.name}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportModal(false)
  }

  if (!project) return null

  const filteredTasks = selectedSprintId
    ? tasks.filter(t => t.sprintId === selectedSprintId)
    : tasks

  const { start: timelineStart, end: timelineEnd } = getTimelineRange(filteredTasks, project.sprints)

  // Status bar stats
  const today         = new Date().toISOString().slice(0, 10)
  const todayHours    = tasks.reduce((s, t) =>
    s + t.timeEntries.filter(e => e.date === today).reduce((h, e) => h + e.hours, 0), 0)
  const inProgress    = tasks.filter(t => t.status === 'in-progress').length
  const currentSprint = project.sprints.find(s => s.startDate <= today && s.endDate >= today)
  const sprintDaysLeft = currentSprint
    ? Math.max(0, Math.ceil((new Date(currentSprint.endDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000))
    : null

  return (
    <ToolShell name={`Timeline — ${project.name}`} icon="📅" wide fullBleed>
      <div className="flex flex-col h-full">

        {/* ── TOOLBAR ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface shrink-0">

          {/* Back */}
          <button
            onClick={() => router.push('/tools/timeline')}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-fg transition-colors mr-1"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Projects</span>
          </button>

          <div className="w-px h-5 bg-border" />

          {/* Sprint tabs */}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 py-0.5">
            <SprintTab active={selectedSprintId === ''} onClick={() => setSelectedSprintId('')}>
              All
            </SprintTab>
            {project.sprints.map(s => (
              <SprintTab key={s.id} active={selectedSprintId === s.id} onClick={() => setSelectedSprintId(s.id)}>
                {s.name}
              </SprintTab>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <Kbd label="Today" shortcut="T" icon={<Calendar size={13} />} onClick={() => setShowToday(true)} />
            <Kbd label="Jira"  shortcut="J" icon={<RefreshCw size={13} />} onClick={() => setShowJira(true)} />
            <Kbd label="Export" shortcut="X" icon={<Download size={13} />} onClick={handleExport} />
            <button
              onClick={() => { setEditTask(null); setShowTaskForm(true) }}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors"
            >
              <Plus size={13} />
              <span>New Task</span>
              <kbd className="rounded bg-white/20 px-1 text-[10px] font-mono">N</kbd>
            </button>
            <button
              onClick={() => setShowShortcuts(v => !v)}
              className="rounded-lg p-1.5 text-muted hover:text-fg hover:bg-surface transition-colors"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard size={14} />
            </button>
          </div>
        </div>

        {/* ── GANTT ─────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 p-3 flex">
          {filteredTasks.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center">
                  <ListTodo size={22} className="text-muted" />
                </div>
                <div>
                  <p className="font-display font-semibold text-fg">No tasks yet</p>
                  <p className="text-muted text-sm">Add your first task to see the Gantt chart</p>
                </div>
                <button
                  onClick={() => setShowTaskForm(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
                >
                  <Plus size={14} />
                  Add Task
                  <kbd className="rounded bg-white/20 px-1.5 text-[10px] font-mono">N</kbd>
                </button>
              </div>
            </div>
          ) : (
            <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
              <GanttChart
                projectId={project.id}
                tasks={filteredTasks}
                sprints={project.sprints}
                timelineStart={timelineStart}
                timelineEnd={timelineEnd}
                onUpdateTask={handleUpdateTask}
                onUpdateEntry={handleUpdateEntry}
                onDeleteEntry={handleDeleteEntry}
                onEditTask={task => { setEditTask(task); setShowTaskForm(true) }}
                onDeleteTask={handleDeleteTask}
                onReorderTasks={handleReorderTasks}
                onExport={handleExport}
              />
              {(showTaskForm || showToday || showJira) && (
                <div className="absolute inset-0 rounded-xl bg-black/30 backdrop-blur-[1px] z-10 pointer-events-none transition-opacity duration-200" />
              )}
            </div>
          )}
        </div>

        {/* ── STATUS BAR ────────────────────────────────────── */}
        <div className="flex items-center gap-5 px-4 py-1.5 border-t border-border bg-surface/60 shrink-0 text-[11px] text-muted">
          <StatItem icon={<ListTodo size={11} />} label={`${tasks.length} tasks`} />
          <StatItem icon={<Flag size={11} />}     label={`${inProgress} in progress`} accent={inProgress > 0} />
          {todayHours > 0 && (
            <StatItem icon={<Clock size={11} />}  label={`${todayHours}h today`} accent />
          )}
          {currentSprint && (
            <span className="ml-auto flex items-center gap-1">
              <span className="text-accent-soft">{currentSprint.name}</span>
              {sprintDaysLeft !== null && (
                <span className={sprintDaysLeft <= 2 ? 'text-red-400' : ''}>
                  · {sprintDaysLeft}d left
                </span>
              )}
            </span>
          )}
          <span className="ml-auto text-muted/40 hidden lg:block">Press <kbd className="font-mono">?</kbd> for shortcuts</span>
        </div>
      </div>

      {/* ── MODALS / PANELS ──────────────────────────────────── */}
      {showTaskForm && (
        <TaskForm
          task={editTask}
          projectId={projectId}
          sprints={project.sprints}
          taskCount={tasks.length}
          onSave={handleSaveTask}
          onClose={() => { setShowTaskForm(false); setEditTask(null) }}
        />
      )}

      {showToday && (
        <TodayPanel
          tasks={tasks}
          onUpdateEntry={handleUpdateEntry}
          onDeleteEntry={handleDeleteEntry}
          onClose={() => setShowToday(false)}
        />
      )}

      {showExportModal && (
        <ExportModal
          onExport={doExport}
          hasJiraToken={!!project?.jiraConfig?.token}
          hasProxyToken={!!(typeof window !== 'undefined' && localStorage.getItem(PROXY_TOKEN_KEY))}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showJira && (
        <JiraPanel
          project={project}
          tasks={tasks}
          onUpdateConfig={handleUpdateJiraConfig}
          onSyncTasks={handleSyncTasks}
          onSyncTime={handleSyncTime}
          onClose={() => setShowJira(false)}
        />
      )}

      {/* Keyboard shortcuts panel */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowShortcuts(false)}>
          <div className="rounded-2xl border border-border bg-surface p-6 w-80 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-fg mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2">
              {[
                ['N', 'New task'],
                ['F', 'Filter tasks'],
                ['T', 'Today panel'],
                ['J', 'Jira sync'],
                ['X', 'Export JSON'],
                ['?', 'This panel'],
                ['Esc', 'Close panels'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-muted">{desc}</span>
                  <kbd className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs text-fg">{key}</kbd>
                </div>
              ))}
              <p className="text-xs text-muted/60 pt-2 border-t border-border/40">Hover a Gantt cell then press:</p>
              {[
                ['E', 'Set estimate dates + hours'],
                ['A', 'Log actual hours'],
                ['D', 'Set due date to that day'],
                ['X', 'Export JSON'],
              ].map(([key, desc]) => (
                <div key={`cell-${key}`} className="flex items-center justify-between">
                  <span className="text-sm text-muted">{desc}</span>
                  <kbd className="rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs text-fg">{key}</kbd>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-muted/60 text-center">Click anywhere to close</p>
          </div>
        </div>
      )}
    </ToolShell>
  )
}

// ── Export Modal ───────────────────────────────────────────────

function CheckRow({ checked, onChange, label, sub }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; sub: string
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="mt-0.5 relative shrink-0">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
          checked ? 'bg-accent border-accent' : 'border-border group-hover:border-accent/50'
        }`}>
          {checked && <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-none stroke-white stroke-2"><polyline points="1,4 3.5,6.5 9,1" /></svg>}
        </div>
      </div>
      <div>
        <p className="text-sm text-fg leading-snug">{label}</p>
        <p className="text-xs text-muted mt-0.5">{sub}</p>
      </div>
    </label>
  )
}

function ExportModal({ onExport, onClose, hasJiraToken, hasProxyToken }: {
  onExport: (includeSensitive: boolean, includeProxyToken: boolean) => void
  onClose: () => void
  hasJiraToken: boolean
  hasProxyToken: boolean
}) {
  const [includeSensitive,  setIncludeSensitive]  = useState(false)
  const [includeProxyToken, setIncludeProxyToken] = useState(false)
  const anySelected = includeSensitive || includeProxyToken

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}>
      <div className="rounded-2xl border border-border bg-surface p-6 w-96 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-display font-semibold text-fg mb-1">Export Timeline</h3>
        <p className="text-sm text-muted mb-5">Download project data as JSON for backup or sharing.</p>

        <div className="rounded-xl border border-border bg-background p-4 mb-5 space-y-3">
          <p className="text-xs font-semibold text-fg/70 uppercase tracking-wider">Sensitive Data</p>
          {hasJiraToken && (
            <CheckRow
              checked={includeSensitive}
              onChange={setIncludeSensitive}
              label="Include Jira token"
              sub={includeSensitive ? 'Token sẽ được ghi vào file.' : 'Token sẽ bị xóa khỏi file (mặc định an toàn).'}
            />
          )}
          {hasProxyToken && (
            <CheckRow
              checked={includeProxyToken}
              onChange={setIncludeProxyToken}
              label="Include Local Proxy PAT"
              sub={includeProxyToken ? 'PAT proxy sẽ được ghi vào file.' : 'PAT proxy sẽ bị xóa khỏi file (mặc định an toàn).'}
            />
          )}
        </div>

        {anySelected && (
          <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-3 py-2.5 mb-5">
            <span className="text-yellow-400 text-sm leading-none mt-px">⚠</span>
            <p className="text-xs text-yellow-300/90">
              File export sẽ chứa token nhạy cảm. Hãy bảo mật file và không commit lên git.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted hover:text-fg transition-colors">
            Hủy
          </button>
          <button onClick={() => onExport(includeSensitive, includeProxyToken)}
            className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors">
            Export JSON
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────

function SprintTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-150 ${
        active
          ? 'bg-accent text-white shadow-sm shadow-accent/30'
          : 'text-muted hover:text-fg hover:bg-surface border border-border'
      }`}
    >
      {children}
      {active && <ChevronRight size={10} className="opacity-60" />}
    </button>
  )
}

function Kbd({ label, shortcut, icon, onClick }: {
  label: string; shortcut: string; icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-fg hover:border-accent/50 hover:bg-surface transition-all duration-150"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <kbd className="hidden sm:block rounded bg-border/60 px-1 font-mono text-[10px]">{shortcut}</kbd>
    </button>
  )
}

function StatItem({ icon, label, accent }: { icon: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <span className={`flex items-center gap-1 ${accent ? 'text-accent-soft' : ''}`}>
      {icon}
      {label}
    </span>
  )
}
