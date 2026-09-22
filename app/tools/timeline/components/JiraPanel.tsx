'use client'

import { useState, useEffect } from 'react'
import { X, Plug, RefreshCw, Upload, CheckCircle, AlertCircle, Loader2, RotateCcw, Copy, Terminal, Download, MonitorDot, ChevronDown, Clock } from 'lucide-react'
import type { Project, Task, JiraConfig, JiraSyncLog, JiraUploadLog } from '@/lib/timeline-types'
import { generateId, PROXY_PORT_KEY, PROXY_TOKEN_KEY } from '@/lib/timeline-storage'

const FIELD_MAP_KEY = 'timeline:jira-field-map'

type FieldMap = {
  actualStart:   string
  actualEnd:     string
  estimateStart: string
  estimateEnd:   string
}

const DEFAULT_FIELD_MAP: FieldMap = {
  actualStart:   '',
  actualEnd:     '',
  estimateStart: '',
  estimateEnd:   '',
}

function loadFieldMap(): FieldMap {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(FIELD_MAP_KEY) : null
    if (!raw) return { ...DEFAULT_FIELD_MAP }
    return { ...DEFAULT_FIELD_MAP, ...JSON.parse(raw) as Partial<FieldMap> }
  } catch { return { ...DEFAULT_FIELD_MAP } }
}

interface Props {
  project: Project
  tasks: Task[]
  onUpdateConfig: (config: JiraConfig) => void
  onSyncTasks: (tasks: Task[]) => void
  onSyncTime: (updates: { taskId: string; entries: Task['timeEntries'] }[]) => void
  onClose: () => void
}

type SyncStep = 'idle' | 'syncing' | 'preview' | 'uploading' | 'done'

const DEFAULT_JQL = 'issuetype = Sub-task AND assignee = currentUser() AND sprint in openSprints() ORDER BY key ASC'
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
  // Jira CSRF bypass — required for write ops when Origin header is present (browser cross-origin requests)
  if (method !== 'GET' && method !== 'HEAD') headers['X-Atlassian-Token'] = 'no-check'
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

function extractJiraDate(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  return raw.slice(0, 10)
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
  estimateStartDate: string | null
  estimateEndDate: string | null
  dueDate: string | null
  actualStartDate: string | null
  actualEndDate: string | null
  manualCount: number
  manualHours: number
}>

function buildBaseline(tasks: Task[]): JiraBaseline {
  const b: JiraBaseline = {}
  for (const t of tasks) {
    if (!t.jiraId) continue
    const manual = t.timeEntries.filter(e => e.source === 'manual')
    b[t.jiraId] = {
      estimateHours: t.estimateHours ?? null,
      estimateStartDate: t.estimateStartDate ?? null,
      estimateEndDate: t.estimateEndDate ?? null,
      dueDate: t.dueDate ?? null,
      actualStartDate: t.actualStartDate ?? null,
      actualEndDate: t.actualEndDate ?? null,
      manualCount: manual.length,
      manualHours: manual.reduce((s, e) => s + e.hours, 0),
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

  const [fieldMap, setFieldMap] = useState<FieldMap>(() => loadFieldMap())
  const [fieldDetecting, setFieldDetecting] = useState(false)

  function saveFieldMap(fm: FieldMap) {
    setFieldMap(fm)
    localStorage.setItem(FIELD_MAP_KEY, JSON.stringify(fm))
  }

  const [connOpen,  setConnOpen]  = useState(false)
  const [jql,      setJql]      = useState(DEFAULT_JQL)
  const [syncMode, setSyncMode] = useState<'merge' | 'replace' | 'clear'>('replace')

  const [step,            setStep]            = useState<SyncStep>('idle')
  const [error,           setError]           = useState('')
  const [syncLogs,        setSyncLogs]        = useState<JiraSyncLog[]>([])
  const [uploadLogs,      setUploadLogs]      = useState<JiraUploadLog[]>([])
  const [pendingTasks,    setPendingTasks]    = useState<Task[]>([])
  const [selectedSprintIds, setSelectedSprintIds] = useState<string[]>([])
  const [previewExpanded,   setPreviewExpanded]   = useState(false)
  const [pullingTime,     setPullingTime]     = useState(false)

  // Detect OS for platform-specific proxy download
  const osType: 'windows' | 'mac' | 'linux' = (() => {
    if (typeof window === 'undefined') return 'windows'
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('mac'))   return 'mac'
    if (ua.includes('linux')) return 'linux'
    return 'windows'
  })()

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
  function buildSearchPath(jqlStr: string) { return `/search?jql=${encodeURIComponent(jqlStr.trim())}&maxResults=100&fields=${buildFields()}` }

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

  async function detectFields() {
    const firstTask = tasks.find(t => t.jiraId && t.jiraKey)
    if (!firstTask) { setError('Cần có ít nhất 1 task Jira để detect fields'); return }
    setFieldDetecting(true); setError('')
    try {
      const resp = await req(`/issue/${firstTask.jiraKey}?expand=names`) as { names?: Record<string, string> }
      const names = resp.names ?? {}
      const newMap: FieldMap = { ...fieldMap }
      for (const [id, name] of Object.entries(names)) {
        const n = name.toLowerCase()
        if (/actual\s*start/.test(n))      newMap.actualStart   = id
        else if (/actual\s*end/.test(n))   newMap.actualEnd     = id
        else if (/target\s*start/.test(n)) newMap.estimateStart = id
        else if (/target\s*end/.test(n))   newMap.estimateEnd   = id
      }
      saveFieldMap(newMap)
      const parts = [
        `target start=${newMap.estimateStart || '?'}`,
        `target end=${newMap.estimateEnd || '?'}`,
        `actual start=${newMap.actualStart || '?'}`,
        `actual end=${newMap.actualEnd || '?'}`,
      ]
      setError(`✓ Field IDs detected: ${parts.join(', ')}`)
    } catch (e) {
      setError(`Detect failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setFieldDetecting(false)
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

  async function pullTimeOnly() {
    const jiraTasks = tasks.filter(t => t.jiraId)
    if (jiraTasks.length === 0) { setError('Không có task Jira nào để pull time'); return }
    setPullingTime(true); setError('')
    try {
      const myself = await req('/myself') as { accountId?: string; name?: string }
      const accountId = myself.accountId ?? myself.name ?? ''
      if (!accountId) throw new Error('Không lấy được accountId')

      const updates: { taskId: string; entries: Task['timeEntries'] }[] = []

      await Promise.allSettled(jiraTasks.map(async task => {
        try {
          const res = await req(`/issue/${task.jiraId}/worklog`) as {
            worklogs?: Array<{ id: string; author: { accountId?: string; name?: string }; started: string; timeSpentSeconds: number }>
          }
          const mine = (res.worklogs ?? []).filter(w => w.author.accountId === accountId || w.author.name === accountId)
          const newJiraEntries: Task['timeEntries'] = mine.map(w => ({
            id: `jira-${w.id}`, date: w.started.slice(0, 10),
            hours: w.timeSpentSeconds / 3600, source: 'jira' as const, jiraWorklogId: w.id,
          }))
          const manualEntries = task.timeEntries.filter(e => e.source === 'manual')
          const existingJiraIds = new Set(task.timeEntries.filter(e => e.jiraWorklogId).map(e => e.jiraWorklogId))
          const freshJira = newJiraEntries.filter(e => !existingJiraIds.has(e.jiraWorklogId))
          const mergedEntries = [...manualEntries, ...task.timeEntries.filter(e => e.source === 'jira'), ...freshJira]
          updates.push({ taskId: task.id, entries: mergedEntries })
        } catch { /* skip individual errors */ }
      }))

      onSyncTime(updates)
      setError(`✓ Đã pull time cho ${updates.length} task`)
    } catch (e) {
      setError(`Pull time failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setPullingTime(false)
    }
  }

  async function handleUploadTime() {
    setStep('uploading')
    const logs: JiraUploadLog[] = []

    // Auto-detect field IDs before pushing if fieldMap is empty and date changes exist
    let activeFieldMap = fieldMap
    const needsDetect = hasDateChanges && fieldMapEmpty
    if (needsDetect) {
      const firstTask = tasks.find(t => t.jiraId && t.jiraKey)
      if (firstTask) {
        try {
          const resp = await req(`/issue/${firstTask.jiraKey}?expand=names`) as { names?: Record<string, string> }
          const names = resp.names ?? {}
          const detected: FieldMap = { ...fieldMap }
          for (const [id, name] of Object.entries(names)) {
            const n = name.toLowerCase()
            if (/actual\s*start/.test(n))      detected.actualStart   = id
            else if (/actual\s*end/.test(n))   detected.actualEnd     = id
            else if (/target\s*start/.test(n)) detected.estimateStart = id
            else if (/target\s*end/.test(n))   detected.estimateEnd   = id
          }
          saveFieldMap(detected)
          activeFieldMap = detected
        } catch { /* proceed with empty fieldMap, will skip date fields */ }
      }
    }

    // Track which date fields were actually pushed per jiraId, to update baseline correctly
    const pushedDates: Record<string, { actualStart?: boolean; actualEnd?: boolean; estimateStart?: boolean; estimateEnd?: boolean }> = {}

    async function putFields(jiraId: string, jiraKey: string, fields: Record<string, unknown>, label: string) {
      try {
        await req(`/issue/${jiraId}`, 'PUT', { fields })
        logs.push({ action: 'update_fields', jiraKey, date: label, hours: 0 })
        return true
      } catch (e) {
        logs.push({ action: 'skip', jiraKey, date: label, hours: 0, reason: e instanceof Error ? e.message : 'error' })
        return false
      }
    }

    await Promise.allSettled(tasks.filter(t => t.jiraId).map(async task => {
      const key  = task.jiraKey ?? task.id
      const b    = baseline?.[task.jiraId!]
      const manual        = task.timeEntries.filter(e => e.source === 'manual')
      const curCount      = manual.length
      const curHours      = manual.reduce((s, e) => s + e.hours, 0)
      const baseCount     = b?.manualCount  ?? 0
      const baseHours     = b?.manualHours  ?? 0
      const timeChanged   = curCount !== baseCount || curHours !== baseHours

      pushedDates[task.jiraId!] = {}

      // 1. Worklogs — only when time entries changed since baseline
      if (timeChanged) {
        const entriesToPush = curCount > baseCount ? manual.slice(baseCount) : manual
        await Promise.allSettled(entriesToPush.map(async entry => {
          try {
            await req(`/issue/${task.jiraId}/worklog`, 'POST', {
              started: `${entry.date}T09:00:00.000+0000`,
              timeSpentSeconds: Math.round(entry.hours * 3600),
              comment: entry.note ?? 'Logged via Timeline',
            })
            logs.push({ action: 'create_worklog', jiraKey: key, date: entry.date, hours: entry.hours })
          } catch (e) {
            logs.push({ action: 'skip', jiraKey: key, date: entry.date, hours: entry.hours, reason: e instanceof Error ? e.message : 'worklog error' })
          }
        }))
      }

      // 2. Original Estimate — try timeoriginalestimate (seconds), fallback to timetracking composite field
      if ((task.estimateHours ?? null) !== (b?.estimateHours ?? null) && task.estimateHours != null) {
        const secs = Math.round(task.estimateHours * 3600)
        const hStr = task.estimateHours % 1 === 0 ? `${task.estimateHours}h` : `${Math.floor(task.estimateHours)}h ${Math.round((task.estimateHours % 1) * 60)}m`
        let estOk = false
        try {
          await req(`/issue/${task.jiraId}`, 'PUT', { fields: { timeoriginalestimate: secs } })
          estOk = true
        } catch { /* not on Edit screen — try timetracking composite */ }
        if (!estOk) {
          try {
            await req(`/issue/${task.jiraId}`, 'PUT', { fields: { timetracking: { originalEstimate: hStr } } })
            estOk = true
          } catch { /* neither field accessible via API */ }
        }
        if (estOk) logs.push({ action: 'update_fields', jiraKey: key, date: 'estimate hours', hours: 0 })
        else logs.push({ action: 'skip', jiraKey: key, date: 'estimate hours', hours: 0, reason: 'timeoriginalestimate & timetracking không có trên Edit screen' })
      }
      if ((task.dueDate ?? null) !== (b?.dueDate ?? null) && task.dueDate) {
        await putFields(task.jiraId!, key, { duedate: task.dueDate }, 'due date')
      }

      // 3. Custom actual date fields — skip and warn if field ID not configured
      const actualFields: Record<string, unknown> = {}
      const actualStartChanged = (task.actualStartDate ?? null) !== (b?.actualStartDate ?? null) && task.actualStartDate
      const actualEndChanged   = (task.actualEndDate   ?? null) !== (b?.actualEndDate   ?? null) && task.actualEndDate

      if (actualStartChanged) {
        if (activeFieldMap.actualStart) { actualFields[activeFieldMap.actualStart] = task.actualStartDate; pushedDates[task.jiraId!].actualStart = true }
        else logs.push({ action: 'skip', jiraKey: key, date: 'actual start', hours: 0, reason: 'Field ID not found — check Jira field names' })
      }
      if (actualEndChanged) {
        if (activeFieldMap.actualEnd) { actualFields[activeFieldMap.actualEnd] = task.actualEndDate; pushedDates[task.jiraId!].actualEnd = true }
        else logs.push({ action: 'skip', jiraKey: key, date: 'actual end', hours: 0, reason: 'Field ID not found — check Jira field names' })
      }
      if (Object.keys(actualFields).length > 0) await putFields(task.jiraId!, key, actualFields, 'actual-dates')

      // 4. Custom estimate date fields (Target start/end) — skip and warn if field ID not found
      const estDateFields: Record<string, unknown> = {}
      const estStartChanged = (task.estimateStartDate ?? null) !== (b?.estimateStartDate ?? null) && task.estimateStartDate
      const estEndChanged   = (task.estimateEndDate   ?? null) !== (b?.estimateEndDate   ?? null) && task.estimateEndDate

      if (estStartChanged) {
        if (activeFieldMap.estimateStart) { estDateFields[activeFieldMap.estimateStart] = task.estimateStartDate; pushedDates[task.jiraId!].estimateStart = true }
        else logs.push({ action: 'skip', jiraKey: key, date: 'target start', hours: 0, reason: 'Field ID not found — check Jira field names' })
      }
      if (estEndChanged) {
        if (activeFieldMap.estimateEnd) { estDateFields[activeFieldMap.estimateEnd] = task.estimateEndDate; pushedDates[task.jiraId!].estimateEnd = true }
        else logs.push({ action: 'skip', jiraKey: key, date: 'target end', hours: 0, reason: 'Field ID not found — check Jira field names' })
      }
      if (Object.keys(estDateFields).length > 0) {
        await putFields(task.jiraId!, key, estDateFields, 'target-dates')
      }
    }))

    // Build baseline — preserve old values for date fields that were not pushed (field ID missing)
    const newBaseline = buildBaseline(tasks)
    for (const t of tasks) {
      if (!t.jiraId) continue
      const oldB  = baseline?.[t.jiraId]
      const pushed = pushedDates[t.jiraId] ?? {}
      if (!pushed.actualStart)   newBaseline[t.jiraId].actualStartDate   = oldB?.actualStartDate   ?? null
      if (!pushed.actualEnd)     newBaseline[t.jiraId].actualEndDate     = oldB?.actualEndDate     ?? null
      if (!pushed.estimateStart) newBaseline[t.jiraId].estimateStartDate = oldB?.estimateStartDate ?? null
      if (!pushed.estimateEnd)   newBaseline[t.jiraId].estimateEndDate   = oldB?.estimateEndDate   ?? null
    }

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
      [key: string]: unknown
    }
  }

  function buildFields(): string {
    const base = 'summary,status,parent,duedate,timeoriginalestimate,timespent'
    const extras: string[] = []
    if (fieldMap.estimateStart) extras.push(fieldMap.estimateStart)
    if (fieldMap.estimateEnd)   extras.push(fieldMap.estimateEnd)
    if (fieldMap.actualStart)   extras.push(fieldMap.actualStart)
    if (fieldMap.actualEnd)     extras.push(fieldMap.actualEnd)
    return extras.length > 0 ? `${base},${extras.join(',')}` : base
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
      const pulledEstimateStart = extractJiraDate(fieldMap.estimateStart ? issue.fields[fieldMap.estimateStart] : undefined)
      const pulledEstimateEnd   = extractJiraDate(fieldMap.estimateEnd   ? issue.fields[fieldMap.estimateEnd]   : undefined)
      const pulledActualStart   = extractJiraDate(fieldMap.actualStart   ? issue.fields[fieldMap.actualStart]   : undefined)
      const pulledActualEnd     = extractJiraDate(fieldMap.actualEnd     ? issue.fields[fieldMap.actualEnd]     : undefined)

      if (existingIdx >= 0) {
        const existing = result[existingIdx]
        const existingJiraIds = new Set(existing.timeEntries.filter(e => e.jiraWorklogId).map(e => e.jiraWorklogId))
        const freshJira = newJiraEntries.filter(e => !existingJiraIds.has(e.jiraWorklogId))
        const mergedEntries = [...existing.timeEntries.filter(e => e.source === 'manual'), ...existing.timeEntries.filter(e => e.source === 'jira'), ...freshJira]
        result[existingIdx] = { ...existing, title: issue.fields.summary, jiraKey: issue.key, jiraStatus: jiraStatusName, status, parentKey, parentTitle, ...(link ? { link } : {}), dueDate: issue.fields.duedate ?? existing.dueDate, estimateHours: issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : existing.estimateHours, estimateStartDate: pulledEstimateStart ?? existing.estimateStartDate, estimateEndDate: pulledEstimateEnd ?? existing.estimateEndDate, actualStartDate: pulledActualStart ?? existing.actualStartDate, actualEndDate: pulledActualEnd ?? existing.actualEndDate, timeEntries: mergedEntries, updatedAt: new Date().toISOString() }
        logs.push({ action: 'update', jiraKey: issue.key, title: issue.fields.summary })
      } else {
        const now = new Date().toISOString()
        result.push({ id: generateId(), projectId: project.id, jiraId: issue.id, jiraKey: issue.key, jiraStatus: jiraStatusName, parentKey, parentTitle, ...(link ? { link } : {}), title: issue.fields.summary, status, dueDate: issue.fields.duedate ?? undefined, estimateHours: issue.fields.timeoriginalestimate ? issue.fields.timeoriginalestimate / 3600 : undefined, estimateStartDate: pulledEstimateStart, estimateEndDate: pulledEstimateEnd, actualStartDate: pulledActualStart, actualEndDate: pulledActualEnd, timeEntries: newJiraEntries, order: result.length, createdAt: now, updatedAt: now })
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
    // Auto-select sprint(s) that contain today
    const today = new Date().toISOString().slice(0, 10)
    const todaySprints = project.sprints.filter(s => s.startDate <= today && s.endDate >= today).map(s => s.id)
    if (todaySprints.length > 0) setSelectedSprintIds(todaySprints)
    setPreviewExpanded(false)
    setSyncLogs(logs); setPendingTasks(result); setStep('preview')
  }

  // ── Derived ─────────────────────────────────────────────────
  const hasCredentials = fetchMode === 'local-proxy'
    ? !!(proxyPort.trim() && proxyToken.trim())
    : !!(host.trim() && token.trim())
  const manualEntryCount = tasks.filter(t => t.jiraId).reduce((n, t) => n + t.timeEntries.filter(e => e.source === 'manual').length, 0)
  const fieldsTaskCount  = tasks.filter(t => {
    if (!t.jiraId) return false
    const manual = t.timeEntries.filter(e => e.source === 'manual')
    const manualCount = manual.length
    const manualHours = manual.reduce((s, e) => s + e.hours, 0)
    const b = baseline?.[t.jiraId]
    if (!b) return (
      manualCount > 0 ||
      t.estimateHours != null ||
      !!t.estimateStartDate || !!t.estimateEndDate ||
      !!t.dueDate || !!t.actualStartDate || !!t.actualEndDate
    )
    return (
      (t.estimateHours ?? null) !== b.estimateHours ||
      (t.estimateStartDate ?? null) !== b.estimateStartDate ||
      (t.estimateEndDate ?? null) !== b.estimateEndDate ||
      (t.dueDate ?? null) !== b.dueDate ||
      (t.actualStartDate ?? null) !== b.actualStartDate ||
      (t.actualEndDate ?? null) !== b.actualEndDate ||
      manualCount !== b.manualCount ||
      manualHours !== b.manualHours
    )
  }).length
  const hasPushableData  = fieldsTaskCount > 0

  // Warn when date fields changed but field map not yet configured
  const fieldMapEmpty = !fieldMap.actualStart && !fieldMap.actualEnd && !fieldMap.estimateStart && !fieldMap.estimateEnd
  const hasDateChanges = tasks.some(t => {
    if (!t.jiraId) return false
    const b = baseline?.[t.jiraId]
    return (
      (t.estimateStartDate ?? null) !== (b?.estimateStartDate ?? null) ||
      (t.estimateEndDate   ?? null) !== (b?.estimateEndDate   ?? null) ||
      (t.actualStartDate   ?? null) !== (b?.actualStartDate   ?? null) ||
      (t.actualEndDate     ?? null) !== (b?.actualEndDate     ?? null)
    )
  })
  const showFieldMapWarning = fieldMapEmpty && hasDateChanges

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
                {/* Platform-specific download / setup */}
                {osType === 'windows' ? (
                  <>
                    <a href="https://github.com/trisnguyen2511/webvibecoding/releases/latest/download/jira-proxy-setup.exe"
                      target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors">
                      <Download size={13} />Tải Jira Proxy (Windows)
                    </a>
                    <div className="rounded-lg bg-surface border border-border px-2.5 py-2 space-y-1">
                      <p className="text-[10px] text-muted font-medium uppercase tracking-wide">Cách dùng:</p>
                      <p className="text-[10px] text-muted leading-relaxed">1. Chạy installer → Next → Install → Finish</p>
                      <p className="text-[10px] text-muted leading-relaxed">2. App mở, nhập Jira URL + PAT → bấm <strong className="text-fg">Bắt đầu</strong></p>
                      <p className="text-[10px] text-muted leading-relaxed">3. App thu vào system tray, chạy ngầm mãi mãi</p>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed bg-surface rounded-lg px-2.5 py-2 border border-border">
                      <span className="text-amber-400 font-medium">Lần đầu:</span> Chrome hiện dialog <em>&quot;Allow access to apps on this device?&quot;</em> — bấm <strong className="text-fg">Allow</strong>. Chỉ 1 lần.
                    </p>
                  </>
                ) : osType === 'mac' ? (
                  <>
                    <a href="https://github.com/trisnguyen2511/webvibecoding/releases/latest/download/jira-proxy-mac.dmg"
                      target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors">
                      <Download size={13} />Tải Jira Proxy (macOS)
                    </a>
                    <div className="rounded-lg bg-surface border border-border px-2.5 py-2 space-y-1">
                      <p className="text-[10px] text-muted font-medium uppercase tracking-wide">Cách dùng:</p>
                      <p className="text-[10px] text-muted leading-relaxed">1. Mở file .dmg → kéo Jira Proxy vào Applications</p>
                      <p className="text-[10px] text-muted leading-relaxed">2. Mở app, nhập Jira URL + PAT → bấm <strong className="text-fg">Bắt đầu</strong></p>
                      <p className="text-[10px] text-muted leading-relaxed">3. App thu vào menu bar, chạy ngầm mãi mãi</p>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed bg-surface rounded-lg px-2.5 py-2 border border-border">
                      <span className="text-amber-400 font-medium">Lần đầu:</span> Right-click → <strong className="text-fg">Open</strong> (bỏ qua cảnh báo Gatekeeper). Chỉ 1 lần.
                    </p>
                  </>
                ) : (
                  <>
                    <a href="https://github.com/trisnguyen2511/webvibecoding/releases/latest/download/jira-proxy-linux.AppImage"
                      target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors">
                      <Download size={13} />Tải Jira Proxy (Linux)
                    </a>
                    <div className="rounded-lg bg-surface border border-border px-2.5 py-2 space-y-1">
                      <p className="text-[10px] text-muted font-medium uppercase tracking-wide">Cách dùng:</p>
                      <p className="text-[10px] text-muted leading-relaxed">1. Tải file .AppImage về</p>
                      <p className="text-[10px] text-muted leading-relaxed">2. Right-click → Properties → <strong className="text-fg">Allow executing as program</strong></p>
                      <p className="text-[10px] text-muted leading-relaxed">3. Double-click để mở, nhập config → <strong className="text-fg">Bắt đầu</strong></p>
                    </div>
                  </>
                )}

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

                {/* Field ID mapping */}
                <div className="border-t border-border/40 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-fg">Custom Field IDs</span>
                    <button onClick={detectFields} disabled={fieldDetecting || !hasCredentials || tasks.filter(t => t.jiraId).length === 0}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-accent/10 text-accent-soft hover:bg-accent/20 transition-colors disabled:opacity-40">
                      {fieldDetecting ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                      Auto Detect
                    </button>
                  </div>
                  <p className="text-[10px] text-muted">Nhấn Auto Detect để tự tìm field ID từ Jira. Hoặc nhập thủ công (vd: customfield_10015).</p>
                  {(
                    [
                      { label: 'Target start (estimate)',  key: 'estimateStart' },
                      { label: 'Target end (estimate)',    key: 'estimateEnd'   },
                      { label: 'Actual start',             key: 'actualStart'   },
                      { label: 'Actual end',               key: 'actualEnd'     },
                    ] as { label: string; key: keyof FieldMap }[]
                  ).map(({ label, key }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted w-36 shrink-0">{label}</span>
                      <input
                        value={fieldMap[key]}
                        onChange={e => saveFieldMap({ ...fieldMap, [key]: e.target.value.trim() })}
                        placeholder="customfield_XXXXX"
                        className="flex-1 rounded border border-border bg-background px-2 py-1 text-[10px] font-mono text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                      />
                    </div>
                  ))}
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
              <div className="space-y-2">
                <button onClick={syncTasks} disabled={step === 'syncing' || !hasCredentials || !jql.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2.5 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40">
                  {step === 'syncing' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {step === 'syncing' ? 'Syncing...' : 'Pull Tasks + Time'}
                </button>
                <button onClick={pullTimeOnly} disabled={pullingTime || !hasCredentials || tasks.filter(t => t.jiraId).length === 0}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm text-muted hover:text-fg hover:border-border/80 transition-colors disabled:opacity-40">
                  {pullingTime ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
                  {pullingTime ? 'Pulling time...' : 'Pull Time'}
                </button>
              </div>
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

              <div className="flex gap-2">
                <button onClick={() => { setStep('idle'); setSyncLogs([]); setSelectedSprintIds([]) }}
                  className="flex-1 rounded-lg border border-border py-2 text-sm text-muted hover:text-fg transition-colors">Cancel</button>
                <button onClick={confirmSync}
                  className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors">Apply</button>
              </div>

              {/* Collapsible task preview list */}
              <button
                onClick={() => setPreviewExpanded(v => !v)}
                className="w-full flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted hover:text-fg transition-colors">
                <span>Tasks preview ({syncLogs.filter(l => l.action !== 'skip').length})</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${previewExpanded ? 'rotate-180' : ''}`} />
              </button>
              {previewExpanded && (
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
              )}
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
              <div className="space-y-2">
                {showFieldMapWarning && (
                  <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-300">
                    <RefreshCw size={13} className="shrink-0 mt-0.5" />
                    <span>
                      Có thay đổi Target/Actual dates — <strong>sẽ tự động detect field IDs từ Jira khi Push</strong>.
                    </span>
                  </div>
                )}
                <button onClick={handleUploadTime} disabled={step === 'uploading' || !hasCredentials || !hasPushableData}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent/15 border border-accent/20 py-2.5 text-sm text-accent-soft hover:bg-accent/25 transition-colors disabled:opacity-40">
                  {step === 'uploading' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {step === 'uploading' ? 'Uploading...' : 'Push Time Entries → Jira'}
                </button>
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
