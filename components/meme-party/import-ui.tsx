'use client'
import { useCallback, useEffect, useState } from 'react'
import { Banner, Btn, cx } from '@/components/meme-party/parts'
import { ImageUploader, Label, PlanPreview } from '@/components/meme-party/library-ui'
import { api } from '@/lib/meme-party/client'
import type { DuplicatePolicy, ImportJob, ImportPlan, ImportKind, StagedFile } from '@/lib/meme-party/library-types'
import { MODE_LABEL } from '@/lib/meme-party/types'

type JobSummary = Omit<ImportJob, 'records' | 'files' | 'items'>

const field = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none focus:border-accent'
const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xác nhận',
  processing: 'Đang xử lý',
  completed: 'Hoàn tất',
  completed_with_errors: 'Hoàn tất (có lỗi)',
  failed: 'Thất bại',
  cancelled: 'Đã huỷ',
}

const TEMPLATES: [string, string][] = [
  ['template.csv', 'Template CSV'],
  ['example.csv', 'Ví dụ CSV'],
  ['template.json', 'Template JSON'],
  ['example.json', 'Ví dụ JSON'],
  ['guide.txt', 'Hướng dẫn cột'],
]

export function ImportWizard({ mode }: { mode: 'files' | 'images' }) {
  const [text, setText] = useState('')
  const [filename, setFilename] = useState('')
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [policy, setPolicy] = useState<DuplicatePolicy>('skip')
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [result, setResult] = useState<JobSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, { title: string; category: string; tags: string; modes: string }>>({})
  const onStaged = useCallback((files: StagedFile[]) => setStaged(files), [])

  useEffect(() => {
    setRows((cur) => {
      const next = { ...cur }
      for (const f of staged) next[f.filename] ??= { title: f.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), category: 'general', tags: '', modes: 'meme|reaction' }
      return next
    })
  }, [staged])

  async function pickFile(file: File | undefined) {
    if (!file) return
    setFilename(file.name)
    setFormat(file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv')
    setText(await file.text())
    setPlan(null)
    setResult(null)
  }

  async function runPreview() {
    setBusy(true)
    setError(null)
    setResult(null)
    let body: Record<string, unknown>
    if (mode === 'images') {
      const items = staged.map((f) => ({ contentType: 'memeAsset', title: rows[f.filename]?.title || f.filename, filename: f.filename, category: rows[f.filename]?.category, tags: rows[f.filename]?.tags, modes: rows[f.filename]?.modes }))
      body = { kind: 'images', format: 'json', filename: 'bulk-images.json', text: JSON.stringify(items), policy, files: staged }
    } else {
      body = { kind: staged.length ? 'combined' : format, format, filename, text, policy, files: staged }
    }
    const res = await api<{ jobId: string | null; plan: ImportPlan }>('/api/meme-party/admin/import/preview', { method: 'POST', body: JSON.stringify(body) })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setPlan(res.result.plan)
    setJobId(res.result.jobId)
  }

  async function act(action: 'commit' | 'cancel' | 'retry') {
    if (!jobId) return
    setBusy(true)
    const res = await api<JobSummary>(`/api/meme-party/admin/import/${jobId}/${action}`, { method: 'POST' })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setResult(res.result)
    if (action === 'cancel') {
      setPlan(null)
      setJobId(null)
    }
  }

  const canImport = !!plan && !!jobId && plan.summary.valid > 0 && !result
  const kindLabel: ImportKind = mode === 'images' ? 'images' : 'combined'
  void kindLabel

  return (
    <div className="space-y-4">
      {mode === 'files' && (
        <>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map(([name, label]) => (
              <a key={name} href={`/api/meme-party/admin/templates/${name}`} download className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-fg hover:border-accent/50">⬇ {label}</a>
            ))}
          </div>
          <Label text="File metadata (.csv hoặc .json, UTF-8)">
            <input type="file" accept=".csv,.json,text/csv,application/json" className={field} onChange={(e) => pickFile(e.target.files?.[0])} />
          </Label>
          {filename && <p className="font-mono text-xs text-muted">{filename} · {format.toUpperCase()} · {text.length.toLocaleString()} ký tự</p>}
          <details className="rounded-xl border border-border bg-surface p-3">
            <summary className="cursor-pointer text-sm text-fg">Kèm ảnh tải lên (khớp theo cột <code>filename</code> hoặc <code>id</code> trùng tên file)</summary>
            <div className="mt-3"><ImageUploader onChange={onStaged} /></div>
          </details>
        </>
      )}

      {mode === 'images' && (
        <>
          <ImageUploader onChange={onStaged} />
          {staged.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-fg">Thông tin cho {staged.length} ảnh đã tải</p>
              {staged.map((f) => (
                <div key={f.filename} className="grid items-center gap-2 rounded-xl border border-border bg-surface p-2 sm:grid-cols-[3rem_1fr_8rem_8rem_9rem]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.imageUrl} alt="" className="h-12 w-12 rounded-lg border border-border object-cover" />
                  <input className={field} aria-label={`Tiêu đề ${f.filename}`} value={rows[f.filename]?.title ?? ''} onChange={(e) => setRows({ ...rows, [f.filename]: { ...rows[f.filename], title: e.target.value } })} />
                  <input className={field} aria-label="Danh mục" placeholder="Danh mục" value={rows[f.filename]?.category ?? ''} onChange={(e) => setRows({ ...rows, [f.filename]: { ...rows[f.filename], category: e.target.value } })} />
                  <input className={field} aria-label="Tag" placeholder="tag|tag" value={rows[f.filename]?.tags ?? ''} onChange={(e) => setRows({ ...rows, [f.filename]: { ...rows[f.filename], tags: e.target.value } })} />
                  <select className={field} aria-label="Chế độ" value={rows[f.filename]?.modes ?? 'meme|reaction'} onChange={(e) => setRows({ ...rows, [f.filename]: { ...rows[f.filename], modes: e.target.value } })}>
                    <option value="meme|reaction">Meme + Reaction</option>
                    <option value="meme">{MODE_LABEL.meme}</option>
                    <option value="reaction">{MODE_LABEL.reaction}</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Label text="Khi bản ghi đã tồn tại (trùng ID hoặc nội dung)">
        <select className={field} value={policy} onChange={(e) => { setPolicy(e.target.value as DuplicatePolicy); setPlan(null); setJobId(null) }}>
          <option value="skip">Bỏ qua — giữ nguyên bản cũ</option>
          <option value="update">Cập nhật bản cũ (xem trước các trường sẽ đổi)</option>
          <option value="create_new">Tạo bản ghi mới (ID mới)</option>
        </select>
      </Label>

      <Btn tone="primary" disabled={busy || (mode === 'files' ? !text : staged.length === 0)} onClick={runPreview}>Xem trước (chưa ghi gì vào thư viện)</Btn>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {plan && (
        <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
          <h3 className="font-display text-sm font-semibold text-fg">Xem trước & xác nhận</h3>
          <PlanPreview plan={plan} policy={policy} />
          {!result && (
            <div className="flex flex-wrap gap-2">
              <Btn tone="primary" disabled={busy || !canImport} onClick={() => act('commit')}>
                Xác nhận nhập {plan.summary.valid} bản ghi hợp lệ{plan.summary.invalid > 0 ? ` (bỏ ${plan.summary.invalid} dòng lỗi)` : ''}
              </Btn>
              <Btn disabled={busy} onClick={() => act('cancel')}>Huỷ import</Btn>
            </div>
          )}
        </section>
      )}

      {result && <JobResult job={result} onRetry={() => act('retry')} busy={busy} />}
    </div>
  )
}

export function JobResult({ job, onRetry, busy }: { job: JobSummary; onRetry?: () => void; busy?: boolean }) {
  const ok = job.status === 'completed'
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <Banner icon={ok ? '✅' : job.status === 'failed' ? '❌' : '⚠️'} tone={ok ? 'info' : 'warn'} title={STATUS_LABEL[job.status] ?? job.status} text={`Tạo ${job.created} · Cập nhật ${job.updated} · Bỏ qua ${job.skipped} · Lỗi ${job.failed} · Chờ ${job.pending} / ${job.total}. Không đảm bảo atomic: các bản ghi đã nhập vẫn được giữ.`} />
      {job.failed > 0 && (
        <div className="flex flex-wrap gap-2">
          <a href={`/api/meme-party/admin/import/${job.id}/report`} className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-fg hover:border-accent/50">⬇ Tải báo cáo lỗi (CSV)</a>
          {onRetry && <Btn className="!min-h-9" disabled={busy} onClick={onRetry}>Thử lại các dòng lỗi hợp lệ</Btn>}
        </div>
      )}
    </div>
  )
}

export function ImportHistory() {
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<ImportJob | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await api<JobSummary[]>('/api/meme-party/admin/import')
    if (res.ok) setJobs(res.result)
  }, [])
  useEffect(() => { load() }, [load])

  async function show(id: string) {
    setOpen(open === id ? null : id)
    const res = await api<ImportJob>(`/api/meme-party/admin/import/${id}`)
    if (res.ok) setDetail(res.result)
  }
  async function retry(id: string) {
    setBusy(true)
    await api(`/api/meme-party/admin/import/${id}/retry`, { method: 'POST' })
    setBusy(false)
    await load()
    await show(id)
  }

  if (jobs.length === 0) return <Banner icon="🗂️" title="Chưa có lượt import nào" />
  return (
    <ul className="space-y-2">
      {jobs.map((j) => (
        <li key={j.id} className="rounded-xl border border-border bg-surface">
          <button className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left" onClick={() => show(j.id)}>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{j.filename}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted">{j.kind}</span>
            <span className={cx('text-xs', j.status === 'completed' ? 'text-accent-soft' : j.status === 'failed' ? 'text-red-400' : 'text-muted')}>{STATUS_LABEL[j.status] ?? j.status}</span>
            <span className="font-mono text-[11px] text-muted">{new Date(j.startedAt).toLocaleString('vi-VN')}</span>
          </button>
          {open === j.id && (
            <div className="space-y-2 border-t border-border px-4 py-3 text-xs text-muted">
              <p>Tổng {j.total} · Tạo {j.created} · Cập nhật {j.updated} · Bỏ qua {j.skipped} · Lỗi {j.failed} · Chờ {j.pending} · Chính sách: {j.policy}</p>
              {detail?.id === j.id && detail.items.filter((i) => i.status === 'failed').slice(0, 20).map((i) => <p key={`${i.index}-${i.where}`} className="text-red-400">• {i.where}: {i.error}</p>)}
              {j.failed > 0 && (
                <div className="flex gap-2">
                  <a href={`/api/meme-party/admin/import/${j.id}/report`} className="rounded-lg border border-border bg-background px-3 py-1.5 text-fg">⬇ Báo cáo lỗi</a>
                  <Btn className="!min-h-8 !px-3 !py-1 text-xs" disabled={busy} onClick={() => retry(j.id)}>Thử lại</Btn>
                </div>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
