'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import ToolShell from '@/components/tool-shell'
import { getProject, getTasks, saveProject, saveTask, deleteTask, upsertTimeEntry, deleteTimeEntry, exportData } from '@/lib/timeline-storage'
import type { Project, Task, Sprint, TimeEntry, JiraConfig } from '@/lib/timeline-types'
import { GanttChart } from '../components/GanttChart'
import { TaskForm } from '../components/TaskForm'
import { TodayPanel } from '../components/TodayPanel'
import { JiraPanel } from '../components/JiraPanel'

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function getTimelineRange(tasks: Task[], sprints: Sprint[]): { start: string; end: string } {
  const today = new Date().toISOString().slice(0, 10)
  const dates: string[] = [today]

  for (const t of tasks) {
    if (t.estimateStartDate) dates.push(t.estimateStartDate)
    if (t.estimateEndDate) dates.push(t.estimateEndDate)
    if (t.actualStartDate) dates.push(t.actualStartDate)
    if (t.actualEndDate) dates.push(t.actualEndDate)
    if (t.dueDate) dates.push(t.dueDate)
  }
  for (const s of sprints) {
    dates.push(s.startDate)
    dates.push(s.endDate)
  }

  const sorted = [...new Set(dates)].sort()
  return {
    start: addDays(sorted[0], -7),
    end: addDays(sorted[sorted.length - 1], 7),
  }
}

interface PageProps {
  params: Promise<{ projectId: string }>
}

export default function ProjectPage({ params }: PageProps) {
  const { projectId } = use(params)
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedSprintId, setSelectedSprintId] = useState<string>('')
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [showToday, setShowToday] = useState(false)
  const [showJira, setShowJira] = useState(false)

  useEffect(() => {
    const p = getProject(projectId)
    if (!p) { router.push('/tools/timeline'); return }
    setProject(p)
    setTasks(getTasks(projectId))
    const today = new Date().toISOString().slice(0, 10)
    const current = p.sprints.find(s => s.startDate <= today && s.endDate >= today)
    if (current) setSelectedSprintId(current.id)
  }, [projectId, router])

  function reload() {
    setTasks(getTasks(projectId))
    const p = getProject(projectId)
    if (p) setProject(p)
  }

  function handleSaveTask(task: Task) {
    saveTask(task)
    reload()
    setShowTaskForm(false)
    setEditTask(null)
  }

  function handleDeleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    deleteTask(id)
    reload()
  }

  function handleUpdateTask(task: Task) {
    saveTask(task)
    reload()
  }

  function handleUpdateEntry(taskId: string, entry: TimeEntry) {
    upsertTimeEntry(taskId, entry)
    reload()
  }

  function handleDeleteEntry(taskId: string, entryId: string) {
    deleteTimeEntry(taskId, entryId)
    reload()
  }

  function handleUpdateJiraConfig(config: JiraConfig) {
    if (!project) return
    const updated = { ...project, jiraConfig: config, updatedAt: new Date().toISOString() }
    saveProject(updated)
    setProject(updated)
  }

  function handleSyncTasks(syncedTasks: Task[]) {
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
    const data = exportData(projectId)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timeline-${project?.name ?? projectId}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Suppress unused variable warning
  void handleDeleteTask

  if (!project) return null

  const filteredTasks = selectedSprintId
    ? tasks.filter(t => t.sprintId === selectedSprintId)
    : tasks

  const { start: timelineStart, end: timelineEnd } = getTimelineRange(filteredTasks, project.sprints)

  return (
    <ToolShell name={`Timeline — ${project.name}`} icon="📅" wide fullBleed>
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface shrink-0 flex-wrap">
          <button onClick={() => router.push('/tools/timeline')} className="text-muted hover:text-fg text-sm transition-colors">
            ← Projects
          </button>
          <span className="text-border">|</span>

          {/* Sprint tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setSelectedSprintId('')}
              className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${selectedSprintId === '' ? 'bg-accent text-white' : 'text-muted hover:text-fg border border-border'}`}
            >
              All
            </button>
            {project.sprints.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSprintId(s.id)}
                className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${selectedSprintId === s.id ? 'bg-accent text-white' : 'text-muted hover:text-fg border border-border'}`}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Actions */}
          <button
            onClick={() => setShowToday(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-fg hover:border-accent/50 transition-colors"
          >
            📆 Today
          </button>
          <button
            onClick={() => setShowJira(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-fg hover:border-accent/50 transition-colors"
          >
            🔄 Jira
          </button>
          <button
            onClick={handleExport}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-fg hover:border-accent/50 transition-colors"
          >
            ↓ Export
          </button>
          <button
            onClick={() => { setEditTask(null); setShowTaskForm(true) }}
            className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors"
          >
            + Task
          </button>
        </div>

        {/* Gantt Chart */}
        <div className="flex-1 overflow-hidden p-4">
          {filteredTasks.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-fg font-medium mb-1">No tasks yet</p>
                <p className="text-muted text-sm mb-4">Add your first task to see the Gantt chart</p>
                <button
                  onClick={() => setShowTaskForm(true)}
                  className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
                >
                  + Add Task
                </button>
              </div>
            </div>
          ) : (
            <GanttChart
              tasks={filteredTasks}
              sprints={project.sprints}
              timelineStart={timelineStart}
              timelineEnd={timelineEnd}
              onUpdateTask={handleUpdateTask}
              onUpdateEntry={handleUpdateEntry}
              onDeleteEntry={handleDeleteEntry}
              onEditTask={task => { setEditTask(task); setShowTaskForm(true) }}
            />
          )}
        </div>
      </div>

      {/* Task form modal */}
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

      {/* Today panel */}
      {showToday && (
        <TodayPanel
          tasks={tasks}
          onUpdateEntry={handleUpdateEntry}
          onDeleteEntry={handleDeleteEntry}
          onClose={() => setShowToday(false)}
        />
      )}

      {/* Jira panel */}
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
    </ToolShell>
  )
}
