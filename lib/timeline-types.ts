export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'blocked'
export type TimeEntrySource = 'manual' | 'jira'

export interface TimeEntry {
  id: string
  date: string       // YYYY-MM-DD
  hours: number
  source: TimeEntrySource
  jiraWorklogId?: string
  note?: string
}

export interface Task {
  id: string
  projectId: string
  sprintId?: string
  jiraId?: string
  jiraKey?: string
  jiraStatus?: string   // original Jira status label e.g. "In Progress"
  parentKey?: string
  parentTitle?: string  // parent issue summary for grouping
  title: string
  description?: string
  link?: string
  dueDate?: string
  estimateStartDate?: string
  estimateEndDate?: string
  estimateHours?: number
  actualStartDate?: string
  actualEndDate?: string
  status: TaskStatus
  assignee?: string
  timeEntries: TimeEntry[]
  order: number
  createdAt: string
  updatedAt: string
}

export interface Sprint {
  id: string
  name: string
  startDate: string
  endDate: string
  isManual: boolean
}

export interface SprintConfig {
  defaultStartDayOfWeek: number  // 0=Sun,1=Mon,...6=Sat
  defaultWeeksPerSprint: number
}

export interface JiraConfig {
  host: string
  email: string
  token: string
}

export interface Project {
  id: string
  name: string
  description?: string
  sprintConfig: SprintConfig
  sprints: Sprint[]
  jiraConfig?: JiraConfig
  createdAt: string
  updatedAt: string
}

export interface ExportData {
  version: '1.0'
  exportedAt: string
  projects: Project[]
  tasks: Task[]
}

export interface JiraSyncLog {
  action: 'add' | 'update' | 'skip'
  jiraKey: string
  title: string
  reason?: string
}

export interface JiraUploadLog {
  action: 'create_worklog' | 'skip'
  jiraKey: string
  date: string
  hours: number
  reason?: string
}
