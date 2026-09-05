'use client'

import { useState, useEffect } from 'react'
import { X, Plug, RefreshCw, Upload, CheckCircle, AlertCircle, Loader2, RotateCcw, Copy, Terminal, Download, MonitorDot, ChevronDown } from 'lucide-react'
import type { Project, Task, JiraConfig, JiraSyncLog, JiraUploadLog } from '@/lib/timeline-types'
import { generateId, PROXY_PORT_KEY, PROXY_TOKEN_KEY } from '@/lib/timeline-storage'

interface Props {
  project: Project
  tasks: Task[]
  onUpdateConfig: (config: JiraConfig) => void
  onSyncTasks: (tasks: Task[]) => void
  onSyncTime: (updates: { taskId: string; entries: Task['timeEntries'] }[]) => void
  onClose: () => void
}

type SyncStep = 'idle' | 'syncing' | 'preview' | 'uploading' | 'done'

const DEFAULT_JQL = 'issuetype = Sub-task AND assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC'
const FIELDS = 'summary,status,parent,duedate,timeoriginalestimate,timespent'

// ── Direct fetch (CORS must be handled by caller) ─────────────
async function jiraRequest(
  config: JiraConfig, path: string, method = 'GET', data?: unknown, serverMode = false,
): Promise<unknown> {
  const base = config.host.trim().replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
  const url = `${base}/rest/api/2${path}`
  // local-proxy: email is empty → use Bearer PAT; serverMode: also Bearer; direct: Basic email:token
  const auth = (serverMode || !config.email)
    ? `Bearer ${config.token}`
    : `Basic ${btoa(`${config.email}:${config.token}`)}`
  const headers: Record<string, string> = { 'Authorization': auth, 'Accept': 'application/json' }
  if (data) headers['Content-Type'] = 'application/json'
  // Chrome 142+ Local Network Access: loopback fetch needs targetAddressSpace hint
  const isLoopback = /^https?:\/\/(127\.|localhost)/.test(url)
  const init: RequestInit & { targetAddressSpace?: string } = {
    method, headers, body: data ? JSON.stringify(data) : undefined,
    ...(isLoopback ? { targetAddressSpace: 'loopback' } : {}),
  }
  const res = await fetch(url, init)
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = {} }
  const j = json as { errorMessages?: string[]; message?: string; error?: string }
  if (!res.ok) throw new Error(j.errorMessages?.[0] ?? j.message ?? j.error ?? `HTTP ${res.status}`)
  return json
}

// ── curl builder ──────────────────────────────────────────────
function buildCurl(host: string, token: string, path: string, method = 'GET', body?: unknown): string {
  const base = host.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
  const url = `${base}/rest/api/2${path}`
  const lines = [
    `curl -k -s${method !== 'GET' ? ` -X ${method}` : ''}`,
    `  -H "Authorization: Bearer ${token}"`,
    `  -H "Accept: application/json"`,
  ]
  if (body) { lines.push(`  -H "Content-Type: application/json"`); lines.push(`  -d '${JSON.stringify(body)}'`) }
  lines.push(`  "${url}"`)
  return lines.join(' \\\n')
}

// ── Baseline tracking (detect changes since last pull/push) ──
type JiraBaseline = Record<string, {
  estimateHours: number | null
  dueDate: string | null
  actualStartDate: string | null
  actualEndDate: string | null
  manualCount: number
}>

function buildBaseline(tasks: Task[]): JiraBaseline {
  const b: JiraBaseline = {}
  for (const t of tasks) {
    if (!t.jiraId) continue
    b[t.jiraId] = {
      estimateHours: t.estimateHours ?? null,
      dueDate: t.dueDate ?? null,
      actualStartDate: t.actualStartDate ?? null,
      actualEndDate: t.actualEndDate ?? null,
      manualCount: t.timeEntries.filter(e => e.source === 'manual').length,
    }
  }
  return b
}

function loadBaselineFromStorage(projectId: string): JiraBaseline | null {
  try {
    const raw = localStorage.getItem(`timeline:jira-baseline:${projectId}`)
    return raw ? JSON.parse(raw) as JiraBaseline : null
  } catch { return null }
}

function saveBaselineToStorage(projectId: string, baseline: JiraBaseline): void {
  try { localStorage.setItem(`timeline:jira-baseline:${projectId}`, JSON.stringify(baseline)) } catch { /* noop */ }
}

// ── UI helpers ────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
      className="flex items-center gap-1 text-[11px] text-accent-soft hover:text-accent transition-colors shrink-0">
      <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
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
      <pre className="rounded-lg bg-background border border-border p-3 text-[10px] font-mono text-fg overflow-x-auto whitespace-pre-wrap">{curl}</pre>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export function JiraPanel({ project, tasks, onUpdateConfig, onSyncTasks, onSyncTime, onClose }: Props) {
  const [host,  setHost]  = useState(project.jiraConfig?.host  ?? '')
  const [email, setEmail] = useState(project.jiraConfig?.email ?? '')
  const [token, setToken] = useState(project.jiraConfig?.token ?? '')
  const [serverMode, setServerMode] = useState(() => {
    const h = project.jiraConfig?.host ?? ''
    return h.length === 0 || !h.includes('atlassian.net')
  })
  // 'curl' | 'direct' | 'local-proxy'
  type FetchMode = 'curl' | 'direct' | 'local-proxy'
  const [fetchMode, setFetchMode] = useState<FetchMode>('local-proxy')

  // Local Proxy — persisted to localStorage
  const [proxyPort,  setProxyPort]  = useState(() =>
    (typeof window !== 'undefined' ? localStorage.getItem(PROXY_PORT_KEY)  : null) ?? '8765')
  const [proxyToken, setProxyToken] = useState(() =>
    (typeof window !== 'undefined' ? localStorage.getItem(PROXY_TOKEN_KEY) : null) ?? '')

  useEffect(() => { localStorage.setItem(PROXY_PORT_KEY,  proxyPort)  }, [proxyPort])
  useEffect(() => { localStorage.setItem(PROXY_TOKEN_KEY, proxyToken) }, [proxyToken])

  const [connOpen,  setConnOpen]  = useState(false)
  const [jql,      setJql]      = useState(DEFAULT_JQL)
  const [syncMode, setSyncMode] = useState<'merge' | 'replace' | 'clear'>('replace')

  const [step,            setStep]            = useState<SyncStep>('idle')
  const [error,           setError]           = useState('')
  const [syncLogs,        setSyncLogs]        = useState<JiraSyncLog[]>([])
  const [uploadLogs,      setUploadLogs]      = useState<JiraUploadLog[]>([])
  const [pendingTasks,    setPendingTasks]    = useState<Task[]>([])
  const [selectedSprintIds, setSelectedSprintIds] = useState<string[]>([])

  const [baseline, setBaseline] = useState<JiraBaseline | null>(() =>
    typeof window !== 'undefined' ? loadBaselineFromStorage(project.id) : null
  )

  // curl/Postman state
  const [tasksCurl,   setTasksCurl]   = useState('')
  const [tasksPaste,  setTasksPaste]  = useState('')
  const [uploadCurls, setUploadCurls] = useState('')

  function getConfig(): JiraConfig { return { host: host.trim(), email: email.trim(), token: token.trim() } }
  function getProxyConfig(): JiraConfig { return { host: `http://127.0.0.1:${proxyPort.trim() || '8765'}`, email: '', token: proxyToken.trim() } }
  const isDirectMode = fetchMode === 'direct' || fetchMode === 'local-proxy'
  const curlMode = fetchMode === 'curl'
  function req(path: string, method = 'GET', data?: unknown) {
    if (fetchMode === 'local-proxy') return jiraRequest(getProxyConfig(), path, method, data, false)
    return jiraRequest(getConfig(), path, method, data, serverMode)
  }
  function buildSearchPath(jqlStr: string) { return `/search?jql=${encodeURIComponent(jqlStr.trim())}&maxResults=100&fields=${FIELDS}` }

  // ── curl/Postman handlers ───────────────────────────────────
  function generateTasksCurl() {
    const h = host.trim(); const t = token.trim()
    if (!h || !t) { setError('Nhập host và token trước'); return }
    setTasksCurl(buildCurl(h, t, buildSearchPath(jql)))
    setError('')
    onUpdateConfig(getConfig())
  }

  function importTasksFromPaste() {
    setError('')
    try {
      const parsed = JSON.parse(tasksPaste) as { issues?: unknown[] }
      if (!Array.isArray(parsed.issues)) throw new Error('Expected {"issues": [...]} — paste full Jira search response')
      // Parse subtasks
      const subtasks = parsed.issues as IssueRow[]
      // Extract parent keys and build parentMap from existing tasks
      const parentMap: Record<string, string> = {}
      for (const task of tasks) {
        if (task.jiraKey && task.title && !task.parentKey) parentMap[task.jiraKey] = task.title
      }
      mergePulledIssues(subtasks, parentMap)
    } catch (e) {
      setError(`Parse error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function generateUploadCurls() {
    const h = host.trim(); const t = token.trim()
    if (!h || !t) { setError('Nhập host và token trước'); return }
    const entries = tasks.filter(task => task.jiraId).flatMap(task =>
      task.timeEntries.filter(e => e.source === 'manual').map(entry => ({ task, entry }))
    )
    if (entries.length === 0) { setError('Không có manual time entry nào để upload'); return }
    const curls = entries.map(({ task, entry }) => {
      const body = { started: `${entry.date}T09:00:00.000+0000`, timeSpentSeconds: Math.round(entry.hours * 3600), comment: entry.note ?? 'Logged via Timeline' }
      return `# ${task.jiraKey ?? task.id} — ${entry.date} (${entry.hours}h)\n${buildCurl(h, t, `/issue/${task.jiraId}/worklog`, 'POST', body)}`
    })
    setUploadCurls(curls.join('\n\n'))
    setError('')
  }

  // ── Direct fetch handlers ───────────────────────────────────
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
      const msg = e instanceof Error ? e.message : String(e)
      const isNetwork = msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror') || msg.toLowerCase().includes('err_failed') || msg.toLowerCase().includes('address space')
      if (fetchMode === 'local-proxy' && isNetwork) {
        setError('Chrome chặn kết nối — bấm "Test Connection" lần nữa và bấm Allow trên dialog của Chrome. Nếu không thấy dialog: vào địa chỉ bar → 🔒 → Site settings → "Apps on device" → Allow.')
      } else {
        setError(`Connection failed: ${msg}`)
      }
    }
  }

  async function syncTasks() {
    setStep('syncing'); setError('')
    try {
      // ── Fetch issues (JQL + parent keys) ──
      const searchRes = await req(buildSearchPath(jql)) as { issues?: IssueRow[] }
      const subtasks: IssueRow[] = searchRes.issues ?? []
      const parentKeysSet = new Set(subtasks.flatMap(i => i.fields.parent?.key ? [i.fields.parent.key] : []))
      let parentIssues: IssueRow[] = []
      if (parentKeysSet.size > 0) {
        try {
          const pKeys = Array.from(parentKeysSet).join(',')
          const parentRes = await req(`/search?jql=key in (${pKeys})&maxResults=${parentKeysSet.size}&fields=${FIELDS}`) as { issues?: IssueRow[] }
          parentIssues = parentRes.issues ?? []
        } catch (e) { console.warn('Parent fetch failed:', e) }
      }
      const parentMap: Record<string, string> = {}
      for (const p of parentIssues) parentMap[p.key] = p.fields.summary
      const issueMap = new Map<string, IssueRow>()
      for (const issue of [...subtasks, ...parentIssues]) {
        if (!issueMap.has(issue.id)) issueMap.set(issue.id, issue)
      }
      const allIssues = Array.from(issueMap.values())

      // ── Fetch worklogs for all issues in parallel ──
      const worklogMap = new Map<string, Task['timeEntries']>()
      try {
        const myself = await req('/myself') as { accountId?: string; name?: string }
        const accountId = myself.accountId ?? myself.name ?? ''
        if (accountId) {
          await Promise.allSettled(allIssues.map(async issue => {
            try {
              const res = await req(`/issue/${issue.id}/worklog`) as {
                worklogs?: Array<{ id: string; author: { accountId?: string; name?: string }; started: string; timeSpentSeconds: number }>
              }
              const mine = (res.worklogs ?? []).filter(w => w.author.accountId === accountId || w.author.name === accountId)
              if (mine.length > 0) {
                worklogMap.set(issue.id, mine.map(w => ({
                  id: `jira-${w.id}`, date: w.started.slice(0, 10),
                  hours: w.timeSpentSeconds / 3600, source: 'jira' as const, jiraWorklogId: w.id,
                })))
              }
            } catch { /* skip individual worklog errors */ }
          }))
        }
      } catch { /* continue without time if /myself fails */ }

      mergePulledIssues(allIssues, parentMap, worklogMap)
    } catch (e) { setError(`Sync failed: ${e instanceof Error ? e.message : String(e)}`); setStep('idle') }
  }

  async function handleUploadTime() {
    setStep('uploading')
    const logs: JiraUploadLog[] = []
    // Process all tasks in parallel
    await Promise.allSettled(tasks.filter(t => t.jiraId).map(async task => {
      // 1. Create worklogs in parallel
      await Promise.allSettled(task.timeEntries.filter(e => e.source === 'manual').map(async entry => {
        try {
          await req(`/issue/${task.jiraId}/worklog`, 'POST', {
            started: `${entry.date}T09:00:00.000+0000`,
            timeSpentSeconds: Math.round(entry.hours * 3600),
            comment: entry.note ?? 'Logged via Timeline',
          })
          logs.push({ action: 'create_worklog', jiraKey: task.jiraKey ?? task.id, date: entry.date, hours: entry.hours })
        } catch {
          logs.push({ action: 'skip', jiraKey: task.jiraKey ?? task.id, date: entry.date, hours: entry.hours, reason: 'worklog error' })
        }
      }))
      // 2. Update estimate + due date on the Jira issue
      const fields: Record<string, unknown> = {}
      if (task.estimateHours) fields.timeoriginalestimate = Math.round(task.estimateHours * 3600)
      if (task.dueDate) fields.duedate = task.dueDate
      if (task.actualStartDate) fields.customfield_actualstart = task.actualStartDate
      if (task.actualEndDate)   fields.customfield_actualend   = task.actualEndDate
      if (Object.keys(fields).length > 0) {
        try {
          await req(`/issue/${task.jiraId}`, 'PUT', { fields })
          logs.push({ action: 'update_fields', jiraKey: task.jiraKey ?? task.id, date: '', hours: 0 })
        } catch {
          logs.push({ action: 'skip', jiraKey: task.jiraKey ?? task.id, date: '', hours: 0, reason: 'fields update skipped' })
        }
      }
    }))
    const newBaseline = buildBaseline(tasks)
    saveBaselineToStorage(project.id, newBaseline)
    setBaseline(newBaseline)
    setUploadLogs(logs); setStep('done')
  }

  function confirmSync() {
    const tasksWithSprints = pendingTasks.map(t => ({
      ...t,
      sprintId: selectedSprintIds[0] ?? t.sprintId,
      sprintIds: selectedSprintIds.length > 0 ? selectedSprintIds : t.sprintIds,
    }))
    onSyncTasks(tasksWithSprints)
    const newBaseline = buildBaseline(tasksWithSprints)
    saveBaselineToStorage(project.id, newBaseline)
    setBaseline(newBaseline)
    setStep('idle')
    setSyncLogs([])
    setSelectedSprintIds([])
  }

  // ── Shared merge/replace logic ──────────────────────────────
  type IssueRow = {
    id: string; key: string
    fields: {
      summary: string
      status: { name: string }
      parent?: { key: string; fields?: { summary?: string } }
      duedate?: string
      timeoriginalestimate?: number
    }
  }

  function buildIssueLink(key: string): string | undefined {
    const h = host.trim(); if (!h) return undefined
    return `${h.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')}/browse/${key}`
  }

  function dedupeByJira(list: Task[]): Task[] {
    const jiraMap = new Map<string, Task>()
    const nonJira: Task[] = []
    for (const t of list) {
      const key = t.jiraKey || t.jiraId
      if (!key) { nonJira.push(t); continue }
      const prev = jiraMap.get(key)
      if (!prev || (t.timeEntries?.length ?? 0) > (prev.timeEntries?.length ?? 0)) jiraMap.set(key, t)
    }
    return [...nonJira, ...Array.from(jiraMap.values())]
  }

  function mergePulledIssues(issues: IssueRow[], parentMap: Record<string, string>, worklogMap = new Map<string, Task['timeEntries']>()) {
    for (const issue of issues) {
      const pk = issue.fields.parent?.key
      const ps = issue.fields.parent?.fields?.summary
      if (pk && ps && !parentMap[pk]) parentMap[pk] = ps
    }

    const logs: JiraSyncLog[] = []
    const rawBase: Task[] = syncMode === 'clear' ? [] : syncMode === 'replace' ? tasks.filter(t => !t.jiraId) : [...tasks]
    const base = dedupeByJira(rawBase)
    const result: Task[] = [...base]
    for (const issue of issues) {
      const existingIdx = result.findIndex(t => t.jiraId === issue.id || t.jiraKey === issue.key)
      const jiraStatusName = issue.fields.status.name
      const s = jiraStatusName.toLowerCase()
      const status = s.includes('done') || s.includes('closed') || s.includes('resolved') ? 'done' as const
        : s.includes('progress') || s.includes('review') || s.includes('testing') ? 'in-progress' as const
        : s.includes('block') ? 'blocked' as const : 'todo' as const
      const parentKey = issue.fields.parent?.key
      const parentTitle = parentKey ? (parentMap[parentKey] ?? parentKey) : undefined
      const link = buildIssueLink(issue.key)
      const newJiraEntries = worklogMap.get(issue.id) ?? []
      if (existingIdx >= 0) {
        const existing = result[existingIdx]
        const existingJiraIds = new Set(existing.timeEntries.filter(e => e.jiraWorklogId).map(e => e.jiraWorklogId))
        const freshJira = newJiraEntries.filter(e => !existingJiraIds.has(e.jiraWorklogId))
        const mergedEntries = [...existing.timeEntries.filter(e => e.source === 'manual'), ...existing.timeEntries.filter(e => e.source === 'jira'), ...freshJira]
        result[existingIdx] = { ...existing, title: issue.fields.summary, jiraKey: issue.key, jiraStatus: jiraStatusName, status, parentKey, parentTitle, ...(link ? { link } : {}), dueDate: issue.fields.duedate ?? existing.dueDate, estimateHours: issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : existing.estimateHours, timeEntries: mergedEntries, updatedAt: new Date().toISOString() }
        logs.push({ action: 'update', jiraKey: issue.key, title: issue.fields.summary })
      } else {
        const now = new Date().toISOString()
        result.push({ id: generateId(), projectId: project.id, jiraId: issue.id, jiraKey: issue.key, jiraStatus: jiraStatusName, parentKey, parentTitle, ...(link ? { link } : {}), title: issue.fields.summary, status, dueDate: issue.fields.duedate ?? undefined, estimateHours: issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : undefined, timeEntries: newJiraEntries, order: result.length, createdAt: now, updatedAt: now })
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
    setSyncLogs(logs); setPendingTasks(result); setStep('preview')
  }

  // ── Derived ─────────────────────────────────────────────────
  const hasCredentials = fetchMode === 'local-proxy'
    ? !!(proxyPort.trim() && proxyToken.trim())
    : !!(host.trim() && token.trim())
  const manualEntryCount = tasks.filter(t => t.jiraId).reduce((n, t) => n + t.timeEntries.filter(e => e.source === 'manual').length, 0)
  const fieldsTaskCount  = tasks.filter(t => {
    if (!t.jiraId) return false
    const manualCount = t.timeEntries.filter(e => e.source === 'manual').length
    if (!baseline) return manualCount > 0
    const b = baseline[t.jiraId]
    if (!b) return manualCount > 0
    return (
      (t.estimateHours ?? null) !== b.estimateHours ||
      (t.dueDate ?? null) !== b.dueDate ||
      (t.actualStartDate ?? null) !== b.actualStartDate ||
      (t.actualEndDate ?? null) !== b.actualEndDate ||
      manualCount !== b.manualCount
    )
  }).length
  const hasPushableData  = fieldsTaskCount > 0

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
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:text-fg hover:bg-border/60 transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Connection config ── */}
          <div className="space-y-3">
            <button onClick={() => setConnOpen(v => !v)} className="w-full flex items-center justify-between group py-0.5">
              <h3 className="text-sm font-medium text-fg">Connection</h3>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted">
                  {fetchMode === 'local-proxy' ? `Local Proxy · :${proxyPort || '8765'}` : fetchMode === 'curl' ? 'curl / Postman' : host.trim() ? host.trim().replace(/^https?:\/\//, '').split('/')[0].slice(0, 28) : 'Not configured'}
                </span>
                <ChevronDown size={13} className={`text-muted transition-transform duration-200 ${connOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {connOpen && <>
              <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
                <button onClick={() => { setServerMode(false); setFetchMode('direct') }}
                  className={`px-3 py-1 transition-colors ${!serverMode ? 'bg-accent text-white' : 'text-muted hover:text-fg'}`}>Cloud</button>
                <button onClick={() => { setServerMode(true); setFetchMode('curl') }}
                  className={`px-3 py-1 transition-colors ${serverMode ? 'bg-accent text-white' : 'text-muted hover:text-fg'}`}>Server / DC</button>
              </div>

            {/* Mode toggle: curl / direct / local-proxy */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
              <button onClick={() => setFetchMode('curl')}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 transition-colors ${fetchMode === 'curl' ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-fg'}`}>
                <Terminal size={11} />curl
              </button>
              <button onClick={() => setFetchMode('direct')}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 border-x border-border transition-colors ${fetchMode === 'direct' ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-fg'}`}>
                <Plug size={11} />Direct
              </button>
              <button onClick={() => setFetchMode('local-proxy')}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 transition-colors ${fetchMode === 'local-proxy' ? 'bg-accent/20 text-accent-soft' : 'text-muted hover:text-fg'}`}>
                <MonitorDot size={11} />Local Proxy
              </button>
            </div>

            {/* curl / direct: shared host+token fields */}
            {fetchMode !== 'local-proxy' && (
              <div className="space-y-2">
                <input value={host} onChange={e => setHost(e.target.value)}
                  placeholder={serverMode ? 'https://jira.company.com:8443' : 'https://company.atlassian.net'}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none" />
                {!serverMode && (
                  <input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none" />
                )}
                <input type="password" value={token} onChange={e => setToken(e.target.value)}
                  placeholder={serverMode ? 'Personal Access Token (PAT)' : 'Jira API Token'}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none font-mono" />
                {fetchMode === 'curl' && host.trim() && token.trim() && (
                  <CurlBlock label="Test Connection:" curl={buildCurl(host.trim(), token.trim(), '/myself')} />
                )}
                {fetchMode === 'direct' && (
                  <button onClick={testConnection} disabled={!hasCredentials}
                    className="w-full rounded-lg border border-accent/30 py-2 text-sm text-accent-soft hover:bg-accent/10 transition-colors disabled:opacity-40">
                    Test Connection
                  </button>
                )}
              </div>
            )}

            {/* local-proxy: own fields + setup card */}
            {fetchMode === 'local-proxy' && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 space-y-3">
                <div className="flex items-start gap-2.5">
                  <MonitorDot size={14} className="text-accent-soft shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs text-muted leading-relaxed">
                    <p className="text-fg font-medium">Local Proxy (VPN / nội bộ)</p>
                    <p>Chạy proxy trên máy bạn để bypass CORS khi Jira nằm trong mạng nội bộ.</p>
                  </div>
                </div>
                <a href="/jira-proxy.zip" download
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors">
                  <Download size={13} />Tải jira-proxy.zip
                </a>
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <span className="text-[11px] text-muted whitespace-nowrap">Port proxy</span>
                    <input value={proxyPort} onChange={e => setProxyPort(e.target.value)}
                      placeholder="8765"
                      className="w-24 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-fg font-mono placeholder:text-muted focus:border-accent focus:outline-none" />
                    <span className="text-[11px] text-muted font-mono truncate">→ http://127.0.0.1:{proxyPort || '8765'}</span>
                  </div>
                  <input type="password" value={proxyToken} onChange={e => setProxyToken(e.target.value)}
                    placeholder="Personal Access Token (PAT)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none font-mono" />
                </div>
                <p className="text-[11px] text-muted leading-relaxed bg-surface rounded-lg px-2.5 py-2 border border-border">
                  <span className="text-amber-400 font-medium">Lần đầu:</span> Chrome sẽ hiện dialog <em>&quot;Allow [site] to access apps on this device?&quot;</em> — bấm <strong className="text-fg">Allow</strong>. Chỉ cần làm 1 lần.
                </p>
                <div className="flex gap-2">
                  <button onClick={testConnection} disabled={!hasCredentials}
                    className="flex-1 rounded-lg border border-accent/30 py-2 text-sm text-accent-soft hover:bg-accent/10 transition-colors disabled:opacity-40">
                    Test Connection
                  </button>
                  <a href={`http://127.0.0.1:${proxyPort.trim() || '8765'}/health`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-fg hover:border-border/80 transition-colors">
                    <MonitorDot size={11} />Ping
                  </a>
                </div>
              </div>
            )}
            </>}
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
                <button onClick={() => setJql(DEFAULT_JQL)} className="flex items-center gap-1 text-[11px] text-muted hover:text-accent-soft transition-colors">
                  <RotateCcw size={10} />Reset
                </button>
              </div>
              <textarea value={jql} onChange={e => setJql(e.target.value)} rows={3} placeholder={DEFAULT_JQL}
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
                    className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${syncMode === opt.value ? (opt.danger ? 'border-red-500/50 bg-red-500/10' : 'border-accent/50 bg-accent/10') : 'border-border hover:border-border/80 hover:bg-surface/60'}`}>
                    <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${syncMode === opt.value ? (opt.danger ? 'border-red-400 bg-red-400' : 'border-accent bg-accent') : 'border-muted/50'}`} />
                    <div className="min-w-0">
                      <span className={`text-xs font-medium ${opt.danger ? 'text-red-400' : 'text-fg'}`}>{opt.label}</span>
                      <span className="text-[10px] text-muted ml-2">{opt.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* curl/Postman mode */}
            {fetchMode === 'curl' ? (
              <div className="space-y-3">
                <button onClick={generateTasksCurl} disabled={!hasCredentials || !jql.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2.5 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40">
                  <Terminal size={13} />Generate curl — Pull Tasks
                </button>
                {tasksCurl && (
                  <div className="space-y-2">
                    <CurlBlock label="Chạy lệnh này trong Postman / terminal:" curl={tasksCurl} />
                    <p className="text-[11px] text-muted">Paste response JSON vào đây rồi bấm Import:</p>
                    <textarea value={tasksPaste} onChange={e => setTasksPaste(e.target.value)} rows={5}
                      placeholder={'{\n  "issues": [...]\n}'}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-mono text-fg placeholder:text-muted focus:border-accent focus:outline-none resize-y" />
                    <button onClick={importTasksFromPaste} disabled={!tasksPaste.trim()}
                      className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-40">
                      Import Tasks from Response
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={syncTasks} disabled={step === 'syncing' || !hasCredentials || !jql.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2.5 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40">
                {step === 'syncing' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {step === 'syncing' ? 'Syncing...' : 'Pull Tasks + Time'}
              </button>
            )}
          </div>

          {/* ── Sync preview ── */}
          {step === 'preview' && syncLogs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-fg">Preview ({syncLogs.filter(l => l.action !== 'skip').length} tasks)</h3>
                {syncMode === 'clear' && <span className="text-[10px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">⚠ Clear All</span>}
              </div>

              {/* Sprint assignment */}
              {project.sprints.length > 0 && (
                <div className="rounded-xl border border-border bg-background/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-fg">Assign to Sprint(s)</p>
                    {selectedSprintIds.length > 0 && (
                      <button onClick={() => setSelectedSprintIds([])}
                        className="text-[10px] text-muted hover:text-fg transition-colors">Clear</button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted">Chọn một hoặc nhiều sprint — task có thể span 2–3 sprint</p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {project.sprints.map(sprint => {
                      const checked = selectedSprintIds.includes(sprint.id)
                      return (
                        <button key={sprint.id}
                          onClick={() => setSelectedSprintIds(prev =>
                            checked ? prev.filter(id => id !== sprint.id) : [...prev, sprint.id]
                          )}
                          className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                            checked ? 'border-accent/50 bg-accent/10' : 'border-border hover:border-border/80 hover:bg-surface/60'
                          }`}>
                          <span className={`w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                            checked ? 'border-accent bg-accent' : 'border-muted/50'
                          }`}>
                            {checked && <span className="text-white text-[9px] leading-none font-bold">✓</span>}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-medium text-fg">{sprint.name}</span>
                            <span className="text-[10px] text-muted ml-2 font-mono">
                              {sprint.startDate.slice(5)} → {sprint.endDate.slice(5)}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {selectedSprintIds.length > 0 && (
                    <p className="text-[10px] text-accent-soft">
                      {selectedSprintIds.length} sprint được chọn — sẽ gán cho {syncLogs.filter(l => l.action !== 'skip').length} tasks
                    </p>
                  )}
                </div>
              )}

              <div className="max-h-40 overflow-y-auto space-y-1">
                {syncLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs">
                    <span className={`font-medium shrink-0 ${log.action === 'add' ? 'text-green-400' : log.action === 'update' ? 'text-blue-400' : 'text-red-400/70'}`}>
                      {log.action === 'add' ? '+add' : log.action === 'update' ? '~upd' : '−rem'}
                    </span>
                    <span className="font-mono text-accent-soft shrink-0">{log.jiraKey}</span>
                    <span className="text-muted truncate">{log.title}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setStep('idle'); setSyncLogs([]); setSelectedSprintIds([]) }}
                  className="flex-1 rounded-lg border border-border py-2 text-sm text-muted">Cancel</button>
                <button onClick={confirmSync}
                  className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-white">Apply</button>
              </div>
            </div>
          )}

          {/* ── Push Time → Jira ── */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-fg">Push → Jira</h3>
            <p className="text-xs text-muted">
              Worklogs + estimate + due date.
              {manualEntryCount > 0 && ` ${manualEntryCount} entr${manualEntryCount === 1 ? 'y' : 'ies'} ready.`}
              {fieldsTaskCount > 0 && ` ${fieldsTaskCount} task${fieldsTaskCount === 1 ? '' : 's'} with fields.`}
            </p>
            {fetchMode === 'curl' ? (
              <div className="space-y-2">
                <button onClick={generateUploadCurls} disabled={!hasPushableData}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40">
                  <Terminal size={13} />Generate curls — Upload Time ({manualEntryCount})
                </button>
                {uploadCurls && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted">Chạy từng lệnh trong Postman để log time lên Jira:</p>
                      <CopyButton text={uploadCurls} />
                    </div>
                    <pre className="rounded-lg bg-background border border-border p-3 text-[10px] font-mono text-fg overflow-x-auto max-h-64 whitespace-pre-wrap">{uploadCurls}</pre>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={handleUploadTime} disabled={step === 'uploading' || !hasCredentials || !hasPushableData}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2.5 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40">
                {step === 'uploading' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {step === 'uploading' ? 'Uploading...' : 'Push Time Entries → Jira'}
              </button>
            )}
          </div>

          {/* ── Upload log ── */}
          {uploadLogs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-fg">Upload Result</h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {uploadLogs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs">
                    <span className={`font-medium shrink-0 ${log.action === 'skip' ? 'text-muted' : 'text-green-400'}`}>
                      {log.action === 'create_worklog' ? '✓ log' : log.action === 'update_fields' ? '✓ upd' : '–'}
                    </span>
                    <span className="font-mono text-accent-soft shrink-0">{log.jiraKey}</span>
                    {log.date && <span className="text-muted shrink-0">{log.date}</span>}
                    {log.hours > 0 && <span className="font-mono text-fg shrink-0">{log.hours}h</span>}
                    {log.reason && <span className="text-red-400 truncate">{log.reason}</span>}
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
