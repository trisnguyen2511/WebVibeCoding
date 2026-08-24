'use client'

import { useState } from 'react'
import { X, Plug, RefreshCw, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import type { Project, Task, JiraConfig, JiraSyncLog, JiraUploadLog } from '@/lib/timeline-types'

interface Props {
  project: Project
  tasks: Task[]
  onUpdateConfig: (config: JiraConfig) => void
  onSyncTasks: (tasks: Task[]) => void
  onSyncTime: (updates: { taskId: string; entries: Task['timeEntries'] }[]) => void
  onClose: () => void
}

type SyncStep = 'idle' | 'syncing' | 'preview' | 'uploading' | 'done'

async function jiraRequest(config: JiraConfig, path: string, method = 'GET', data?: unknown): Promise<unknown> {
  const res = await fetch('/api/jira', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: config.host, email: config.email, token: config.token, path, method, data }),
  })
  const json = await res.json() as Record<string, unknown>
  if (!res.ok && !json.errorMessages) {
    throw new Error((json.error as string) ?? `HTTP ${res.status}`)
  }
  return json
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function JiraPanel({ project, tasks, onUpdateConfig, onSyncTasks, onSyncTime, onClose }: Props) {
  const [host, setHost] = useState(project.jiraConfig?.host ?? '')
  const [email, setEmail] = useState(project.jiraConfig?.email ?? '')
  const [token, setToken] = useState(project.jiraConfig?.token ?? '')
  const [step, setStep] = useState<SyncStep>('idle')
  const [error, setError] = useState('')
  const [syncLogs, setSyncLogs] = useState<JiraSyncLog[]>([])
  const [uploadLogs, setUploadLogs] = useState<JiraUploadLog[]>([])
  const [pendingTasks, setPendingTasks] = useState<Task[]>([])

  function getConfig(): JiraConfig {
    return { host: host.trim(), email: email.trim(), token: token.trim() }
  }

  async function testConnection() {
    setError('')
    try {
      const res = await jiraRequest(getConfig(), '/myself') as { displayName?: string; accountId?: string; errorMessages?: string[] }
      if (res.errorMessages?.length) throw new Error(res.errorMessages[0])
      if (!res.accountId) throw new Error('Invalid response from Jira — check your host URL, email, and API token')
      setError(`✓ Connected as ${res.displayName ?? res.accountId}`)
      onUpdateConfig(getConfig())
    } catch (e) {
      setError(`Connection failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function syncTasks() {
    setStep('syncing')
    setError('')
    try {
      const config = getConfig()
      const myself = await jiraRequest(config, '/myself') as { accountId: string }
      const accountId = myself.accountId

      const jql = `assignee = "${accountId}" ORDER BY updated DESC`
      const searchRes = await jiraRequest(config, `/search?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,status,parent,duedate,timeoriginalestimate,timespent`) as {
        issues?: Array<{
          id: string
          key: string
          fields: {
            summary: string
            status: { name: string }
            parent?: { key: string }
            duedate?: string
            timeoriginalestimate?: number
            timespent?: number
          }
        }>
      }

      const issues = searchRes.issues ?? []
      const logs: JiraSyncLog[] = []
      const merged: Task[] = [...tasks]

      for (const issue of issues) {
        const existing = merged.find(t => t.jiraId === issue.id)
        const statusName = issue.fields.status.name.toLowerCase()
        const status = statusName.includes('done') ? 'done' as const
          : statusName.includes('progress') ? 'in-progress' as const
          : statusName.includes('block') ? 'blocked' as const
          : 'todo' as const

        if (existing) {
          existing.title = issue.fields.summary
          existing.jiraKey = issue.key
          existing.status = status
          existing.parentKey = issue.fields.parent?.key
          existing.dueDate = issue.fields.duedate ?? existing.dueDate
          existing.estimateHours = issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : existing.estimateHours
          existing.updatedAt = new Date().toISOString()
          logs.push({ action: 'update', jiraKey: issue.key, title: issue.fields.summary })
        } else {
          const now = new Date().toISOString()
          merged.push({
            id: generateId(),
            projectId: project.id,
            jiraId: issue.id,
            jiraKey: issue.key,
            parentKey: issue.fields.parent?.key,
            title: issue.fields.summary,
            status,
            dueDate: issue.fields.duedate ?? undefined,
            estimateHours: issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : undefined,
            timeEntries: [],
            order: merged.length,
            createdAt: now,
            updatedAt: now,
          })
          logs.push({ action: 'add', jiraKey: issue.key, title: issue.fields.summary })
        }
      }

      setSyncLogs(logs)
      setPendingTasks(merged)
      setStep('preview')
    } catch (e) {
      setError(`Sync failed: ${e instanceof Error ? e.message : String(e)}`)
      setStep('idle')
    }
  }

  async function syncTime() {
    setStep('syncing')
    setError('')
    try {
      const config = getConfig()
      const myself = await jiraRequest(config, '/myself') as { accountId: string }
      const accountId = myself.accountId
      const updates: { taskId: string; entries: Task['timeEntries'] }[] = []

      for (const task of tasks.filter(t => t.jiraId)) {
        const worklogRes = await jiraRequest(config, `/issue/${task.jiraId}/worklog`) as {
          worklogs?: Array<{
            id: string
            author: { accountId: string }
            started: string
            timeSpentSeconds: number
          }>
        }
        const myWorklogs = (worklogRes.worklogs ?? []).filter(w => w.author.accountId === accountId)
        const newEntries = myWorklogs.map(w => ({
          id: `jira-${w.id}`,
          date: w.started.slice(0, 10),
          hours: w.timeSpentSeconds / 3600,
          source: 'jira' as const,
          jiraWorklogId: w.id,
        }))

        const manualEntries = task.timeEntries.filter(e => e.source === 'manual')
        const mergedEntries = [...manualEntries]
        for (const jiraEntry of newEntries) {
          const existing = mergedEntries.find(e => e.jiraWorklogId === jiraEntry.jiraWorklogId || (e.source === 'jira' && e.date === jiraEntry.date))
          if (!existing) mergedEntries.push(jiraEntry)
        }
        updates.push({ taskId: task.id, entries: mergedEntries })
      }

      onSyncTime(updates)
      setError(`✓ Synced time for ${updates.length} tasks`)
      setStep('idle')
    } catch (e) {
      setError(`Sync failed: ${e instanceof Error ? e.message : String(e)}`)
      setStep('idle')
    }
  }

  async function handleUploadTime() {
    setStep('uploading')
    const config = getConfig()
    const logs: JiraUploadLog[] = []

    for (const task of tasks.filter(t => t.jiraId)) {
      const manualEntries = task.timeEntries.filter(e => e.source === 'manual')
      for (const entry of manualEntries) {
        try {
          await jiraRequest(config, `/issue/${task.jiraId}/worklog`, 'POST', {
            started: `${entry.date}T09:00:00.000+0000`,
            timeSpentSeconds: Math.round(entry.hours * 3600),
            comment: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: entry.note ?? 'Logged via Timeline' }] }] },
          })
          logs.push({ action: 'create_worklog', jiraKey: task.jiraKey ?? task.id, date: entry.date, hours: entry.hours })
        } catch {
          logs.push({ action: 'skip', jiraKey: task.jiraKey ?? task.id, date: entry.date, hours: entry.hours, reason: 'API error' })
        }
      }
    }

    setUploadLogs(logs)
    setStep('done')
  }

  function confirmSync() {
    onSyncTasks(pendingTasks)
    setStep('idle')
    setSyncLogs([])
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-surface border-l border-border flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Plug size={15} className="text-blue-400" />
            </div>
            <h2 className="font-display text-base font-semibold text-fg">Jira Integration</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:text-fg hover:bg-border/60 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Connection config */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-fg">Connection</h3>
            <div className="space-y-2">
              <input value={host} onChange={e => setHost(e.target.value)} placeholder="https://company.atlassian.net" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none" />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none" />
              <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Jira API Token" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none font-mono" />
            </div>
            <button onClick={testConnection} className="w-full rounded-lg border border-accent/30 py-2 text-sm text-accent-soft hover:bg-accent/10 transition-colors">
              Test Connection
            </button>
          </div>

          {error && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${error.startsWith('✓') ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
              {error.startsWith('✓') ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {error}
            </div>
          )}

          {/* Sync actions */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-fg">Sync Actions</h3>
            <button
              onClick={syncTasks}
              disabled={step === 'syncing' || !host || !email || !token}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2.5 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40"
            >
              {step === 'syncing' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {step === 'syncing' ? 'Syncing...' : 'Pull Tasks (my subtasks from Jira)'}
            </button>
            <button
              onClick={syncTime}
              disabled={step === 'syncing' || !host || !email || !token}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2.5 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40"
            >
              {step === 'syncing' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Pull Time (Jira worklogs → local)
            </button>
          </div>

          {/* Sync preview */}
          {step === 'preview' && syncLogs.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-fg">Preview Changes ({syncLogs.length})</h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {syncLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs">
                    <span className={`font-medium ${log.action === 'add' ? 'text-green-400' : log.action === 'update' ? 'text-blue-400' : 'text-muted'}`}>
                      {log.action}
                    </span>
                    <span className="font-mono text-accent-soft">{log.jiraKey}</span>
                    <span className="text-muted truncate">{log.title}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('idle')} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted">Cancel</button>
                <button onClick={confirmSync} className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-white">Apply</button>
              </div>
            </div>
          )}

          {/* Upload time */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-fg">Upload to Jira</h3>
            <p className="text-xs text-muted">Uploads manually entered time entries to Jira worklogs. Review the log before confirming.</p>
            <button
              onClick={handleUploadTime}
              disabled={step === 'uploading' || !host || !email || !token}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-accent/40 py-2.5 text-sm text-accent-soft hover:bg-accent/10 transition-colors disabled:opacity-40"
            >
              {step === 'uploading' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {step === 'uploading' ? 'Uploading...' : 'Push Time Entries → Jira'}
            </button>
          </div>

          {/* Upload log */}
          {uploadLogs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-fg">Upload Result</h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {uploadLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs">
                    <span className={`font-medium ${log.action === 'create_worklog' ? 'text-green-400' : 'text-muted'}`}>
                      {log.action === 'create_worklog' ? '✓' : '–'}
                    </span>
                    <span className="font-mono text-accent-soft">{log.jiraKey}</span>
                    <span className="text-muted">{log.date}</span>
                    <span className="font-mono text-fg">{log.hours}h</span>
                    {log.reason && <span className="text-red-400">{log.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
