'use client'

import { useState } from 'react'
import { X, Plug, RefreshCw, Upload, CheckCircle, AlertCircle, Loader2, RotateCcw } from 'lucide-react'
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

const DEFAULT_JQL = 'issuetype = Sub-task AND assignee = currentUser() ORDER BY updated DESC'
const FIELDS = 'summary,status,parent,duedate,timeoriginalestimate,timespent'

async function jiraRequest(
  config: JiraConfig, path: string, method = 'GET', data?: unknown, serverMode = false,
): Promise<unknown> {
  const base = config.host.trim().replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
  const url = `${base}/rest/api/2${path}`
  const auth = serverMode
    ? `Bearer ${config.token}`
    : `Basic ${btoa(`${config.email}:${config.token}`)}`
  const headers: Record<string, string> = {
    'Authorization': auth,
    'Accept': 'application/json',
  }
  if (data) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = {} }
  const j = json as { errorMessages?: string[]; message?: string; error?: string }
  if (!res.ok) {
    throw new Error(j.errorMessages?.[0] ?? j.message ?? j.error ?? `HTTP ${res.status}`)
  }
  return json
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function JiraPanel({ project, tasks, onUpdateConfig, onSyncTasks, onSyncTime, onClose }: Props) {
  const [host,  setHost]  = useState(project.jiraConfig?.host  ?? '')
  const [email, setEmail] = useState(project.jiraConfig?.email ?? '')
  const [token, setToken] = useState(project.jiraConfig?.token ?? '')
  const [serverMode, setServerMode] = useState(() => {
    const h = project.jiraConfig?.host ?? ''
    return h.length === 0 || !h.includes('atlassian.net')
  })

  const [jql,      setJql]      = useState(DEFAULT_JQL)
  const [syncMode, setSyncMode] = useState<'merge' | 'replace' | 'clear'>('replace')

  const [step,       setStep]       = useState<SyncStep>('idle')
  const [error,      setError]      = useState('')
  const [syncLogs,   setSyncLogs]   = useState<JiraSyncLog[]>([])
  const [uploadLogs, setUploadLogs] = useState<JiraUploadLog[]>([])
  const [pendingTasks, setPendingTasks] = useState<Task[]>([])

  function getConfig(): JiraConfig {
    return { host: host.trim(), email: email.trim(), token: token.trim() }
  }

  function req(path: string, method = 'GET', data?: unknown) {
    return jiraRequest(getConfig(), path, method, data, serverMode)
  }

  function buildSearchPath(jqlStr: string) {
    return `/search?jql=${encodeURIComponent(jqlStr.trim())}&maxResults=100&fields=${FIELDS}`
  }

  async function testConnection() {
    setError('')
    try {
      const res = await req('/myself') as { displayName?: string; accountId?: string; name?: string; errorMessages?: string[] }
      if (res.errorMessages?.length) throw new Error(res.errorMessages[0])
      const id = res.accountId ?? res.name
      if (!id) throw new Error('Invalid response — check host URL and credentials')
      setError(`✓ Connected as ${res.displayName ?? id}`)
      onUpdateConfig(getConfig())
    } catch (e) {
      setError(`Connection failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function syncTasks() {
    setStep('syncing')
    setError('')
    try {
      const searchRes = await req(buildSearchPath(jql)) as { issues?: IssueRow[] }
      const subtasks: IssueRow[] = searchRes.issues ?? []

      const parentKeysSet = new Set(subtasks.flatMap(i => i.fields.parent?.key ? [i.fields.parent.key] : []))
      let parentIssues: IssueRow[] = []
      if (parentKeysSet.size > 0) {
        try {
          const pKeys = Array.from(parentKeysSet).join(',')
          const parentRes = await req(`/search?jql=key in (${pKeys})&maxResults=${parentKeysSet.size}&fields=${FIELDS}`) as { issues?: IssueRow[] }
          parentIssues = parentRes.issues ?? []
        } catch (e) {
          console.warn('Parent fetch failed:', e)
        }
      }

      const parentMap: Record<string, string> = {}
      for (const p of parentIssues) parentMap[p.key] = p.fields.summary

      mergePulledIssues([...subtasks, ...parentIssues], parentMap)
    } catch (e) {
      setError(`Sync failed: ${e instanceof Error ? e.message : String(e)}`)
      setStep('idle')
    }
  }

  async function syncTime() {
    setStep('syncing')
    setError('')
    try {
      const myself = await req('/myself') as { accountId?: string; name?: string }
      const accountId = myself.accountId ?? myself.name
      const updates: { taskId: string; entries: Task['timeEntries'] }[] = []

      for (const task of tasks.filter(t => t.jiraId)) {
        const worklogRes = await req(`/issue/${task.jiraId}/worklog`) as {
          worklogs?: Array<{ id: string; author: { accountId: string }; started: string; timeSpentSeconds: number }>
        }
        const myWorklogs = (worklogRes.worklogs ?? []).filter(w =>
          w.author.accountId === accountId || (w.author as { name?: string }).name === accountId
        )
        const newEntries = myWorklogs.map(w => ({
          id: `jira-${w.id}`, date: w.started.slice(0, 10),
          hours: w.timeSpentSeconds / 3600, source: 'jira' as const, jiraWorklogId: w.id,
        }))
        const manualEntries = task.timeEntries.filter(e => e.source === 'manual')
        const mergedEntries = [...manualEntries]
        for (const jiraEntry of newEntries) {
          if (!mergedEntries.find(e => e.jiraWorklogId === jiraEntry.jiraWorklogId || (e.source === 'jira' && e.date === jiraEntry.date)))
            mergedEntries.push(jiraEntry)
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
    const logs: JiraUploadLog[] = []
    for (const task of tasks.filter(t => t.jiraId)) {
      for (const entry of task.timeEntries.filter(e => e.source === 'manual')) {
        try {
          await req(`/issue/${task.jiraId}/worklog`, 'POST', {
            started: `${entry.date}T09:00:00.000+0000`,
            timeSpentSeconds: Math.round(entry.hours * 3600),
            comment: entry.note ?? 'Logged via Timeline',
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

  // ── Shared merge/replace logic ──────────────────────────────

  type IssueRow = {
    id: string; key: string
    fields: { summary: string; status: { name: string }; parent?: { key: string }; duedate?: string; timeoriginalestimate?: number }
  }

  function buildIssueLink(key: string): string | undefined {
    const h = host.trim()
    if (!h) return undefined
    const base = h.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
    return `${base}/browse/${key}`
  }

  function mergePulledIssues(issues: IssueRow[], parentMap: Record<string, string>) {
    const logs: JiraSyncLog[] = []

    const base: Task[] =
      syncMode === 'clear'   ? [] :
      syncMode === 'replace' ? tasks.filter(t => !t.jiraId) :
      [...tasks]

    const result: Task[] = [...base]

    for (const issue of issues) {
      const existingIdx = result.findIndex(t => t.jiraId === issue.id)
      const jiraStatusName = issue.fields.status.name
      const statusName = jiraStatusName.toLowerCase()
      const status = statusName.includes('done') || statusName.includes('closed') || statusName.includes('resolved') ? 'done' as const
        : statusName.includes('progress') || statusName.includes('review') || statusName.includes('testing') ? 'in-progress' as const
        : statusName.includes('block') ? 'blocked' as const
        : 'todo' as const
      const parentKey = issue.fields.parent?.key
      const parentTitle = parentKey ? (parentMap[parentKey] ?? parentKey) : undefined
      const link = buildIssueLink(issue.key)

      if (existingIdx >= 0) {
        result[existingIdx] = {
          ...result[existingIdx],
          title: issue.fields.summary,
          jiraKey: issue.key,
          jiraStatus: jiraStatusName,
          status,
          parentKey,
          parentTitle,
          ...(link ? { link } : {}),
          dueDate: issue.fields.duedate ?? result[existingIdx].dueDate,
          estimateHours: issue.fields.timeoriginalestimate
            ? issue.fields.timeoriginalestimate / 3600
            : result[existingIdx].estimateHours,
          updatedAt: new Date().toISOString(),
        }
        logs.push({ action: 'update', jiraKey: issue.key, title: issue.fields.summary })
      } else {
        const now = new Date().toISOString()
        result.push({
          id: generateId(), projectId: project.id, jiraId: issue.id, jiraKey: issue.key,
          jiraStatus: jiraStatusName, parentKey, parentTitle,
          ...(link ? { link } : {}),
          title: issue.fields.summary, status,
          dueDate: issue.fields.duedate ?? undefined,
          estimateHours: issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : undefined,
          timeEntries: [], order: result.length, createdAt: now, updatedAt: now,
        })
        logs.push({ action: 'add', jiraKey: issue.key, title: issue.fields.summary })
      }
    }

    if (syncMode !== 'merge') {
      const removedCount = tasks.filter(t => t.jiraId && !issues.find(i => i.id === t.jiraId)).length
      if (removedCount > 0) logs.push({ action: 'skip', jiraKey: '—', title: `${removedCount} Jira task(s) removed`, reason: syncMode })
    }
    if (syncMode === 'clear') {
      const removedManual = tasks.filter(t => !t.jiraId).length
      if (removedManual > 0) logs.push({ action: 'skip', jiraKey: '—', title: `${removedManual} manual task(s) cleared`, reason: 'clear-all' })
    }

    setSyncLogs(logs)
    setPendingTasks(result)
    setStep('preview')
  }

  // ── Derived ─────────────────────────────────────────────────

  const hasCredentials = !!(host.trim() && token.trim())
  const manualEntryCount = tasks
    .filter(t => t.jiraId)
    .reduce((n, t) => n + t.timeEntries.filter(e => e.source === 'manual').length, 0)

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

          {/* ── Connection config ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-fg">Connection</h3>
              <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
                <button onClick={() => setServerMode(false)}
                  className={`px-3 py-1 transition-colors ${!serverMode ? 'bg-accent text-white' : 'text-muted hover:text-fg'}`}>
                  Cloud
                </button>
                <button onClick={() => setServerMode(true)}
                  className={`px-3 py-1 transition-colors ${serverMode ? 'bg-accent text-white' : 'text-muted hover:text-fg'}`}>
                  Server / DC
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <input value={host} onChange={e => setHost(e.target.value)}
                placeholder={serverMode ? 'https://jira.company.com:8443' : 'https://company.atlassian.net'}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none" />
              {!serverMode && (
                <input value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none" />
              )}
              <input type="password" value={token} onChange={e => setToken(e.target.value)}
                placeholder={serverMode ? 'Personal Access Token (PAT)' : 'Jira API Token'}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none font-mono" />

              <button onClick={testConnection} disabled={!hasCredentials}
                className="w-full rounded-lg border border-accent/30 py-2 text-sm text-accent-soft hover:bg-accent/10 transition-colors disabled:opacity-40">
                Test Connection
              </button>
            </div>
          </div>

          {error && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${error.startsWith('✓') ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
              {error.startsWith('✓') ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {error}
            </div>
          )}

          {/* ── Pull from Jira ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-fg">Pull from Jira</h3>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted">JQL Query</label>
                <button onClick={() => setJql(DEFAULT_JQL)}
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-accent-soft transition-colors">
                  <RotateCcw size={10} />
                  Reset
                </button>
              </div>
              <textarea value={jql} onChange={e => setJql(e.target.value)}
                rows={3} placeholder={DEFAULT_JQL}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-mono text-fg placeholder:text-muted focus:border-accent focus:outline-none resize-y" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-muted">Sync mode</label>
              <div className="space-y-1">
                {([
                  { value: 'merge',   label: 'Merge',        desc: 'Chỉ add / update — giữ lại tất cả tasks cũ' },
                  { value: 'replace', label: 'Replace Jira', desc: 'Xóa Jira tasks cũ, giữ manual tasks' },
                  { value: 'clear',   label: 'Clear All',    desc: 'Xóa toàn bộ rồi import lại từ đầu', danger: true },
                ] as { value: 'merge' | 'replace' | 'clear'; label: string; desc: string; danger?: boolean }[]).map(opt => (
                  <button key={opt.value} onClick={() => setSyncMode(opt.value)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                      syncMode === opt.value
                        ? opt.danger ? 'border-red-500/50 bg-red-500/10' : 'border-accent/50 bg-accent/10'
                        : 'border-border hover:border-border/80 hover:bg-surface/60'
                    }`}>
                    <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors ${
                      syncMode === opt.value
                        ? opt.danger ? 'border-red-400 bg-red-400' : 'border-accent bg-accent'
                        : 'border-muted/50'
                    }`} />
                    <div className="min-w-0">
                      <span className={`text-xs font-medium ${opt.danger ? 'text-red-400' : 'text-fg'}`}>{opt.label}</span>
                      <span className="text-[10px] text-muted ml-2">{opt.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={syncTasks}
              disabled={step === 'syncing' || !hasCredentials || !jql.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2.5 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40">
              {step === 'syncing' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {step === 'syncing' ? 'Syncing...' : 'Pull Tasks'}
            </button>

            <button onClick={syncTime}
              disabled={step === 'syncing' || !hasCredentials}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2.5 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40">
              {step === 'syncing' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Pull Time (Jira worklogs → local)
            </button>
          </div>

          {/* ── Sync preview ── */}
          {step === 'preview' && syncLogs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-fg">Preview ({syncLogs.filter(l => l.action !== 'skip').length} tasks)</h3>
                {syncMode === 'clear' && (
                  <span className="text-[10px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">⚠ Clear All</span>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {syncLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs">
                    <span className={`font-medium shrink-0 ${log.action === 'add' ? 'text-green-400' : log.action === 'update' ? 'text-blue-400' : 'text-red-400/70'}`}>
                      {log.action === 'add' ? '+add' : log.action === 'update' ? '~update' : '−remove'}
                    </span>
                    <span className="font-mono text-accent-soft shrink-0">{log.jiraKey}</span>
                    <span className="text-muted truncate">{log.title}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setStep('idle'); setSyncLogs([]) }} className="flex-1 rounded-lg border border-border py-2 text-sm text-muted">Cancel</button>
                <button onClick={confirmSync} className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-white">Apply</button>
              </div>
            </div>
          )}

          {/* ── Push Time → Jira ── */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-fg">Push Time → Jira</h3>
            <p className="text-xs text-muted">
              Uploads manual time entries to Jira worklogs.
              {manualEntryCount > 0 && ` ${manualEntryCount} entr${manualEntryCount === 1 ? 'y' : 'ies'} ready.`}
            </p>
            <button onClick={handleUploadTime}
              disabled={step === 'uploading' || !hasCredentials || manualEntryCount === 0}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-accent/40 py-2.5 text-sm text-accent-soft hover:bg-accent/10 transition-colors disabled:opacity-40">
              {step === 'uploading' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {step === 'uploading' ? 'Uploading...' : 'Push Time Entries → Jira'}
            </button>
          </div>

          {/* ── Upload log ── */}
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
