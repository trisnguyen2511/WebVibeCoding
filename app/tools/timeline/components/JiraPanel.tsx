'use client'

import { useState } from 'react'
import { X, Plug, RefreshCw, Upload, CheckCircle, AlertCircle, Loader2, Copy, Terminal, RotateCcw } from 'lucide-react'
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

const BRIDGE_DEFAULT = 'http://localhost:3456'
const DEFAULT_JQL = 'issuetype = Sub-task AND assignee = currentUser() ORDER BY parent, updated DESC'
const FIELDS = 'summary,status,parent,duedate,timeoriginalestimate,timespent'

async function jiraRequest(
  config: JiraConfig, path: string, method = 'GET',
  data?: unknown, serverMode = false, bridge = BRIDGE_DEFAULT,
): Promise<unknown> {
  if (serverMode) {
    const res = await fetch(bridge, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: config.host, token: config.token, path, method, data }),
    })
    if (!res.ok) {
      const text = await res.text()
      let msg = `HTTP ${res.status}`
      try { const j = JSON.parse(text) as { errorMessages?: string[]; message?: string; error?: string }; msg = j.errorMessages?.[0] ?? j.message ?? j.error ?? msg } catch { /* noop */ }
      throw new Error(msg)
    }
    return res.json()
  }

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

function buildCurl(host: string, token: string, path: string, method = 'GET', body?: unknown): string {
  const base = host.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
  const url = `${base}/rest/api/2${path}`
  const lines = [
    `curl -k -s${method !== 'GET' ? ` -X ${method}` : ''}`,
    `  -H "Authorization: Bearer ${token}"`,
    `  -H "Accept: application/json"`,
  ]
  if (body) {
    lines.push(`  -H "Content-Type: application/json"`)
    lines.push(`  -d '${JSON.stringify(body)}'`)
  }
  lines.push(`  "${url}"`)
  return lines.join(' \\\n')
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 text-[11px] text-accent-soft hover:text-accent transition-colors shrink-0">
      <Copy size={11} />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CurlBlock({ label, curl }: { label: string; curl: string }) {
  if (!curl) return null
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted">{label}</span>
        <CopyButton text={curl} />
      </div>
      <pre className="rounded-lg bg-background border border-border p-3 text-[10px] font-mono text-fg overflow-x-auto whitespace-pre-wrap">
        {curl}
      </pre>
    </div>
  )
}

export function JiraPanel({ project, tasks, onUpdateConfig, onSyncTasks, onSyncTime, onClose }: Props) {
  const [host, setHost] = useState(project.jiraConfig?.host ?? '')
  const [email, setEmail] = useState(project.jiraConfig?.email ?? '')
  const [token, setToken] = useState(project.jiraConfig?.token ?? '')
  // Default: Server/DC + curl/Postman
  const [serverMode, setServerMode] = useState(() => {
    const h = project.jiraConfig?.host ?? ''
    return h.length === 0 || !h.includes('atlassian.net')
  })
  const [bridge, setBridge] = useState(BRIDGE_DEFAULT)
  const [curlMode, setCurlMode] = useState(true)

  // JQL query (user-editable)
  const [jql, setJql] = useState(DEFAULT_JQL)

  // Replace mode: replace all Jira tasks instead of merging
  const [replaceMode, setReplaceMode] = useState(true)

  const [step, setStep] = useState<SyncStep>('idle')
  const [error, setError] = useState('')
  const [syncLogs, setSyncLogs] = useState<JiraSyncLog[]>([])
  const [uploadLogs, setUploadLogs] = useState<JiraUploadLog[]>([])
  const [pendingTasks, setPendingTasks] = useState<Task[]>([])

  // Curl mode state
  const [tasksCurl, setTasksCurl] = useState('')
  const [tasksPaste, setTasksPaste] = useState('')
  const [uploadCurls, setUploadCurls] = useState('')

  function getConfig(): JiraConfig {
    return { host: host.trim(), email: email.trim(), token: token.trim() }
  }

  function req(path: string, method = 'GET', data?: unknown) {
    return jiraRequest(getConfig(), path, method, data, serverMode, bridge)
  }

  function buildSearchPath(jqlStr: string) {
    return `/search?jql=${encodeURIComponent(jqlStr.trim())}&maxResults=100&fields=${FIELDS}`
  }

  // ── Live mode handlers ──────────────────────────────────────

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
      const searchRes = await req(buildSearchPath(jql)) as {
        issues?: Array<{
          id: string; key: string
          fields: { summary: string; status: { name: string }; parent?: { key: string }; duedate?: string; timeoriginalestimate?: number }
        }>
      }
      const issues = searchRes.issues ?? []

      // Batch-fetch parent issue summaries
      const parentKeysSet = new Set(issues.flatMap(i => i.fields.parent?.key ? [i.fields.parent.key] : []))
      const parentMap: Record<string, string> = {}
      if (parentKeysSet.size > 0) {
        try {
          const pKeys = Array.from(parentKeysSet).map(k => `"${k}"`).join(',')
          const parentRes = await req(`/search?jql=key in (${pKeys})&maxResults=${parentKeysSet.size}&fields=summary`) as {
            issues?: Array<{ key: string; fields: { summary: string } }>
          }
          for (const p of parentRes.issues ?? []) parentMap[p.key] = p.fields.summary
        } catch { /* best-effort */ }
      }

      mergePulledIssues(issues, parentMap)
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

  // ── Curl mode handlers ──────────────────────────────────────

  function generateTasksCurl() {
    const h = host.trim(); const t = token.trim()
    if (!h || !t) { setError('Enter host and token first'); return }
    setTasksCurl(buildCurl(h, t, buildSearchPath(jql)))
    setError('')
    onUpdateConfig(getConfig())
  }

  function importTasksFromPaste() {
    setError('')
    try {
      const parsed = JSON.parse(tasksPaste) as { issues?: unknown[] }
      if (!Array.isArray(parsed.issues)) throw new Error('Expected {"issues": [...]} — paste the full Jira search response')
      mergePulledIssues(parsed.issues as Array<{
        id: string; key: string
        fields: { summary: string; status: { name: string }; parent?: { key: string }; duedate?: string; timeoriginalestimate?: number }
      }>, {})
    } catch (e) {
      setError(`Parse error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function generateUploadCurls() {
    const h = host.trim(); const t = token.trim()
    if (!h || !t) { setError('Enter host and token first'); return }
    const entries = tasks.filter(task => task.jiraId).flatMap(task =>
      task.timeEntries.filter(e => e.source === 'manual').map(entry => ({ task, entry }))
    )
    if (entries.length === 0) { setError('No manual time entries to upload'); return }
    const curls = entries.map(({ task, entry }) => {
      const body = {
        started: `${entry.date}T09:00:00.000+0000`,
        timeSpentSeconds: Math.round(entry.hours * 3600),
        comment: entry.note ?? 'Logged via Timeline',
      }
      return `# ${task.jiraKey ?? task.id} — ${entry.date} (${entry.hours}h)\n${buildCurl(h, t, `/issue/${task.jiraId}/worklog`, 'POST', body)}`
    })
    setUploadCurls(curls.join('\n\n'))
    setError('')
  }

  // ── Shared merge/replace logic ──────────────────────────────

  type IssueRow = {
    id: string; key: string
    fields: { summary: string; status: { name: string }; parent?: { key: string }; duedate?: string; timeoriginalestimate?: number }
  }

  function buildIssueLink(key: string): string {
    const base = host.trim().replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
    return `${base}/browse/${key}`
  }

  function mergePulledIssues(issues: IssueRow[], parentMap: Record<string, string>) {
    const logs: JiraSyncLog[] = []

    // In replace mode: start from non-Jira tasks only, then add all synced issues fresh
    // In merge mode: carry all existing tasks forward and update matches
    const base: Task[] = replaceMode
      ? tasks.filter(t => !t.jiraId)
      : [...tasks]

    const result: Task[] = [...base]

    for (const issue of issues) {
      const existing = result.find(t => t.jiraId === issue.id)
      const jiraStatusName = issue.fields.status.name
      const statusName = jiraStatusName.toLowerCase()
      const status = statusName.includes('done') || statusName.includes('closed') || statusName.includes('resolved') ? 'done' as const
        : statusName.includes('progress') || statusName.includes('review') || statusName.includes('testing') ? 'in-progress' as const
        : statusName.includes('block') ? 'blocked' as const
        : 'todo' as const
      const parentKey = issue.fields.parent?.key
      const parentTitle = parentKey ? (parentMap[parentKey] ?? parentKey) : undefined
      const link = buildIssueLink(issue.key)

      if (existing) {
        existing.title = issue.fields.summary
        existing.jiraKey = issue.key
        existing.jiraStatus = jiraStatusName
        existing.status = status
        existing.parentKey = parentKey
        existing.parentTitle = parentTitle
        existing.link = link
        existing.dueDate = issue.fields.duedate ?? existing.dueDate
        existing.estimateHours = issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : existing.estimateHours
        existing.updatedAt = new Date().toISOString()
        logs.push({ action: 'update', jiraKey: issue.key, title: issue.fields.summary })
      } else {
        const now = new Date().toISOString()
        result.push({
          id: generateId(), projectId: project.id, jiraId: issue.id, jiraKey: issue.key,
          jiraStatus: jiraStatusName, parentKey, parentTitle, link,
          title: issue.fields.summary, status,
          dueDate: issue.fields.duedate ?? undefined,
          estimateHours: issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : undefined,
          timeEntries: [], order: result.length, createdAt: now, updatedAt: now,
        })
        logs.push({ action: 'add', jiraKey: issue.key, title: issue.fields.summary })
      }
    }

    // In replace mode, count removed tasks in the log
    if (replaceMode) {
      const removedCount = tasks.filter(t => t.jiraId && !issues.find(i => i.id === t.jiraId)).length
      if (removedCount > 0) {
        logs.push({ action: 'skip', jiraKey: '—', title: `${removedCount} old Jira task(s) removed`, reason: 'replace mode' })
      }
    }

    setSyncLogs(logs)
    setPendingTasks(result)
    setStep('preview')
  }

  function confirmSync() {
    onSyncTasks(pendingTasks)
    setStep('idle')
    setSyncLogs([])
    setTasksPaste('')
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
                <button onClick={() => { setServerMode(false); setCurlMode(false) }}
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

              {/* Server/DC: Bridge vs curl/Postman toggle */}
              {serverMode && (
                <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
                  <button onClick={() => setCurlMode(false)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 transition-colors ${!curlMode ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-fg'}`}>
                    <Plug size={11} />
                    Bridge (jira-bridge.js)
                  </button>
                  <button onClick={() => setCurlMode(true)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 transition-colors ${curlMode ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-fg'}`}>
                    <Terminal size={11} />
                    curl / Postman
                  </button>
                </div>
              )}

              {/* Bridge instructions */}
              {serverMode && !curlMode && (
                <div className="rounded-lg bg-surface border border-border p-3 space-y-2.5">
                  <p className="text-[11px] text-fg font-medium">Cần chạy Jira Bridge (1 lần)</p>
                  <div className="text-[11px] text-muted space-y-1">
                    <p>1. Tải <a href="/jira-bridge.js" download className="text-accent-soft underline">jira-bridge.js</a> về máy</p>
                    <p>2. Mở terminal, chạy: <code className="font-mono bg-background px-1.5 py-0.5 rounded text-fg">node jira-bridge.js</code></p>
                    <p>3. Giữ terminal mở → Test Connection</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted shrink-0">Bridge:</span>
                    <input value={bridge} onChange={e => setBridge(e.target.value)}
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-[11px] font-mono text-fg focus:border-accent focus:outline-none" />
                  </div>
                </div>
              )}

              {/* Curl mode: connection test curl */}
              {curlMode && host.trim() && token.trim() && (
                <CurlBlock label="Test Connection:" curl={buildCurl(host.trim(), token.trim(), '/myself')} />
              )}

              {/* Test connection (live modes only) */}
              {!curlMode && (
                <button onClick={testConnection}
                  className="w-full rounded-lg border border-accent/30 py-2 text-sm text-accent-soft hover:bg-accent/10 transition-colors">
                  Test Connection
                </button>
              )}
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

            {/* JQL query input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted">JQL Query</label>
                <button
                  onClick={() => setJql(DEFAULT_JQL)}
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-accent-soft transition-colors"
                  title="Reset to default"
                >
                  <RotateCcw size={10} />
                  Reset
                </button>
              </div>
              <textarea
                value={jql}
                onChange={e => setJql(e.target.value)}
                rows={3}
                placeholder={DEFAULT_JQL}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-mono text-fg placeholder:text-muted focus:border-accent focus:outline-none resize-y"
              />
            </div>

            {/* Replace vs Merge toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <button
                role="switch"
                aria-checked={replaceMode}
                onClick={() => setReplaceMode(v => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${replaceMode ? 'bg-accent' : 'bg-border'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${replaceMode ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-xs text-fg">
                {replaceMode ? 'Replace all Jira tasks' : 'Merge (add / update only)'}
              </span>
              <span className="text-[10px] text-muted">
                {replaceMode ? '— xóa tasks cũ không có trong kết quả mới' : '— giữ lại tasks cũ'}
              </span>
            </label>

            {!curlMode ? (
              <>
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
              </>
            ) : (
              <div className="space-y-3">
                <button onClick={generateTasksCurl}
                  disabled={!hasCredentials || !jql.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40">
                  <Terminal size={13} />
                  Generate curl — Pull Tasks
                </button>

                {tasksCurl && (
                  <div className="space-y-2">
                    <CurlBlock label="Chạy lệnh này trong Postman / terminal:" curl={tasksCurl} />
                    <p className="text-[11px] text-muted">Paste response JSON vào đây rồi bấm Import:</p>
                    <textarea
                      value={tasksPaste}
                      onChange={e => setTasksPaste(e.target.value)}
                      rows={5}
                      placeholder={'{\n  "issues": [...]\n}'}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-mono text-fg placeholder:text-muted focus:border-accent focus:outline-none resize-y"
                    />
                    <button
                      onClick={importTasksFromPaste}
                      disabled={!tasksPaste.trim()}
                      className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-40">
                      Import Tasks from Response
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Sync preview ── */}
          {step === 'preview' && syncLogs.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-fg">Preview Changes ({syncLogs.filter(l => l.action !== 'skip').length} tasks)</h3>
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

            {!curlMode ? (
              <button onClick={handleUploadTime}
                disabled={step === 'uploading' || !hasCredentials || manualEntryCount === 0}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-accent/40 py-2.5 text-sm text-accent-soft hover:bg-accent/10 transition-colors disabled:opacity-40">
                {step === 'uploading' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {step === 'uploading' ? 'Uploading...' : 'Push Time Entries → Jira'}
              </button>
            ) : (
              <div className="space-y-2">
                <button onClick={generateUploadCurls}
                  disabled={manualEntryCount === 0}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-accent/40 py-2 text-sm text-accent-soft hover:bg-accent/10 transition-colors disabled:opacity-40">
                  <Terminal size={13} />
                  Generate curls — Upload Time ({manualEntryCount})
                </button>
                {uploadCurls && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted">Chạy từng lệnh trong Postman để log time lên Jira:</p>
                      <CopyButton text={uploadCurls} />
                    </div>
                    <pre className="rounded-lg bg-background border border-border p-3 text-[10px] font-mono text-fg overflow-x-auto max-h-64 whitespace-pre-wrap">
                      {uploadCurls}
                    </pre>
                  </div>
                )}
              </div>
            )}
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
