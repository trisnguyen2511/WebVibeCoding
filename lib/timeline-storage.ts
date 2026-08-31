import type { Project, Task, TimeEntry, ExportData } from './timeline-types'

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const PROJECTS_KEY = 'timeline:projects'
const TASKS_KEY = 'timeline:tasks'

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getProjects(): Project[] {
  return read<Project[]>(PROJECTS_KEY, [])
}

export function getProject(id: string): Project | undefined {
  return getProjects().find(p => p.id === id)
}

export function saveProject(project: Project): void {
  const all = getProjects()
  const idx = all.findIndex(p => p.id === project.id)
  if (idx >= 0) all[idx] = project
  else all.push(project)
  write(PROJECTS_KEY, all)
}

export function deleteProject(id: string): void {
  write(PROJECTS_KEY, getProjects().filter(p => p.id !== id))
  write(TASKS_KEY, getAllTasks().filter(t => t.projectId !== id))
}

function getAllTasks(): Task[] {
  return read<Task[]>(TASKS_KEY, [])
}

export function getTasks(projectId: string): Task[] {
  return getAllTasks()
    .filter(t => t.projectId === projectId)
    .sort((a, b) => a.order - b.order)
}

export function getTask(id: string): Task | undefined {
  return getAllTasks().find(t => t.id === id)
}

export function saveTask(task: Task): void {
  const all = getAllTasks()
  const idx = all.findIndex(t => t.id === task.id)
  if (idx >= 0) all[idx] = task
  else all.push(task)
  write(TASKS_KEY, all)
}

export function deleteTask(id: string): void {
  write(TASKS_KEY, getAllTasks().filter(t => t.id !== id))
}

export function upsertTimeEntry(taskId: string, entry: TimeEntry): void {
  const all = getAllTasks()
  const task = all.find(t => t.id === taskId)
  if (!task) return
  const idx = task.timeEntries.findIndex(e => e.id === entry.id)
  if (idx >= 0) task.timeEntries[idx] = entry
  else task.timeEntries.push(entry)
  task.updatedAt = new Date().toISOString()
  write(TASKS_KEY, all)
}

export function deleteTimeEntry(taskId: string, entryId: string): void {
  const all = getAllTasks()
  const task = all.find(t => t.id === taskId)
  if (!task) return
  task.timeEntries = task.timeEntries.filter(e => e.id !== entryId)
  task.updatedAt = new Date().toISOString()
  write(TASKS_KEY, all)
}

export function exportData(projectId?: string, opts?: { includeSensitive?: boolean }): ExportData {
  const rawProjects = projectId ? getProjects().filter(p => p.id === projectId) : getProjects()
  const projects: Project[] = rawProjects.map(p => {
    if (opts?.includeSensitive || !p.jiraConfig) return p
    // Strip token when not explicitly included
    return { ...p, jiraConfig: { ...p.jiraConfig, token: '' } }
  })
  const projectIds = new Set(projects.map(p => p.id))
  const tasks = getAllTasks().filter(t => projectIds.has(t.projectId))
  const collapsedParents: Record<string, string[]> = {}
  Array.from(projectIds).forEach(id => {
    try {
      const raw = localStorage.getItem(`timeline:collapsed:${id}`)
      if (raw) collapsedParents[id] = JSON.parse(raw) as string[]
    } catch { /* noop */ }
  })
  return { version: '1.0', exportedAt: new Date().toISOString(), projects, tasks, collapsedParents }
}

export function importData(data: ExportData): void {
  const existing = getProjects()
  for (const p of data.projects) {
    const idx = existing.findIndex(e => e.id === p.id)
    if (idx >= 0) existing[idx] = p
    else existing.push(p)
  }
  write(PROJECTS_KEY, existing)

  const existingTasks = getAllTasks()
  for (const t of data.tasks) {
    const idx = existingTasks.findIndex(e => e.id === t.id)
    if (idx >= 0) existingTasks[idx] = t
    else existingTasks.push(t)
  }
  write(TASKS_KEY, existingTasks)

  if (data.collapsedParents) {
    for (const [id, keys] of Object.entries(data.collapsedParents)) {
      try { localStorage.setItem(`timeline:collapsed:${id}`, JSON.stringify(keys)) } catch { /* noop */ }
    }
  }
}
