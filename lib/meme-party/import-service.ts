import { randomUUID } from 'crypto'
import { toCsv } from './csv'
import type { ContentStore } from './content-store'
import { logEvent } from './log'
import { planImport } from './import-plan'
import { recordsFromCsv, recordsFromJson, type ParsedSource } from './import-validate'
import type {
  DuplicatePolicy,
  ImportJob,
  ImportKind,
  ImportPlan,
  ItemStatus,
  LibraryItem,
  NewLibraryItem,
  NormalizedRecord,
  PlanItem,
  StagedFile,
} from './library-types'

const BATCH = 50

export function parseSource(kind: 'csv' | 'json', text: string): ParsedSource {
  return kind === 'csv' ? recordsFromCsv(text) : recordsFromJson(text)
}

const newJob = (kind: ImportKind, filename: string, policy: DuplicatePolicy, createdBy: string, records: NormalizedRecord[], files: StagedFile[]): ImportJob => ({
  id: randomUUID(),
  kind,
  filename,
  status: 'pending',
  policy,
  createdBy,
  startedAt: new Date().toISOString(),
  completedAt: null,
  total: records.length,
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  pending: records.length,
  records,
  files,
  items: records.map((r) => ({ index: r.index, where: r.where, status: 'pending' as ItemStatus, error: null })),
})

/** Validates a source and stores the pending job. Nothing is written to the library yet. */
export async function previewImport(
  store: ContentStore,
  args: { kind: ImportKind; format?: 'csv' | 'json'; filename: string; text?: string; policy: DuplicatePolicy; files?: StagedFile[]; createdBy: string },
): Promise<{ job: ImportJob | null; plan: ImportPlan }> {
  const files = args.files ?? []
  const source: ParsedSource = args.text !== undefined ? parseSource(args.format ?? (args.kind === 'csv' ? 'csv' : 'json'), args.text) : { records: [], errors: [] }
  const plan = planImport(source, { existing: await store.all(), policy: args.policy, files })
  const records = plan.items.filter((i): i is PlanItem & { record: NormalizedRecord } => i.record !== null && i.action !== 'invalid').map((i) => i.record)
  if (plan.summary.total === 0) return { job: null, plan }
  const job = newJob(args.kind, args.filename, args.policy, args.createdBy, records, files)
  // Invalid rows are recorded so they appear in history and the error report.
  for (const item of plan.items.filter((i) => i.action === 'invalid')) {
    job.items.push({ index: item.index, where: item.where, status: 'failed', error: item.errors.map((e) => `${e.field ? e.field + ': ' : ''}${e.message}`).join('; ') })
    job.failed++
  }
  job.total = plan.summary.total
  if (records.length === 0) {
    job.status = 'failed'
    job.completedAt = new Date().toISOString()
  }
  job.pending = job.items.filter((i) => i.status === 'pending').length
  await store.saveJob(job)
  return { job, plan }
}

function toNewItem(rec: NormalizedRecord, file: StagedFile | null, assetIdByExternal: Map<string, string>, importKey: string, forceNoId: boolean): NewLibraryItem {
  return {
    externalId: forceNoId ? null : rec.externalId,
    kind: rec.kind,
    title: rec.title,
    text: rec.text,
    imageUrl: file?.imageUrl ?? rec.imageUrl,
    storagePath: file?.storagePath ?? null,
    originalFilename: file?.filename ?? rec.filename,
    mime: file?.mime ?? null,
    width: file?.width ?? null,
    height: file?.height ?? null,
    sha256: file?.sha256 ?? null,
    gameMode: rec.gameMode,
    modes: rec.modes,
    assetId: rec.imageRef ? (assetIdByExternal.get(rec.imageRef) ?? null) : null,
    category: rec.category,
    tags: rec.tags,
    language: rec.language,
    status: rec.status,
    importKey,
  }
}

function finish(job: ImportJob): ImportJob {
  const counts = { created: 0, updated: 0, skipped: 0, failed: 0, pending: 0 }
  for (const it of job.items) counts[it.status]++
  Object.assign(job, counts)
  job.completedAt = counts.pending === 0 ? new Date().toISOString() : null
  job.status = counts.pending > 0 ? 'processing' : counts.failed > 0 ? 'completed_with_errors' : 'completed'
  if (counts.pending === 0 && counts.failed === job.total && job.total > 0) job.status = 'failed'
  return job
}

/**
 * Commits a previewed job in batches. Safe to call again for the same job:
 * items that already finished are skipped and creates are keyed by
 * `${jobId}:${index}`, so a retry never duplicates a record.
 */
export async function commitImport(store: ContentStore, jobId: string, actor: string): Promise<ImportJob | null> {
  const job = await store.getJob(jobId)
  if (!job) return null
  if (job.status === 'cancelled') return job
  job.status = 'processing'
  await store.saveJob(job)

  // Re-plan against the current library so edits made since the preview are respected.
  const plan = planImport(
    { records: job.records.map((r) => ({ index: r.index, where: r.where, fields: recordToFields(r) })), errors: [] },
    { existing: await store.all(), policy: job.policy, files: job.files },
  )
  const byIndex = new Map(plan.items.map((p) => [p.index, p]))
  const assetIdByExternal = new Map<string, string>()
  for (const i of await store.all()) if (i.kind === 'memeAsset' && i.externalId) assetIdByExternal.set(i.externalId, i.id)

  // Assets first so prompts can reference assets created in the same file.
  const order = job.items
    .filter((it) => it.status === 'pending')
    .sort((a, b) => Number(byIndex.get(a.index)?.record?.kind !== 'memeAsset') - Number(byIndex.get(b.index)?.record?.kind !== 'memeAsset'))

  for (let start = 0; start < order.length; start += BATCH) {
    for (const item of order.slice(start, start + BATCH)) {
      const planned = byIndex.get(item.index)
      try {
        if (!planned || !planned.record || planned.action === 'invalid') {
          item.status = 'failed'
          item.error = planned?.errors.map((e) => e.message).join('; ') || 'Bản ghi không hợp lệ'
        } else if (planned.action === 'skip') {
          item.status = 'skipped'
        } else if (planned.action === 'update' && planned.matchId) {
          const patch = toNewItem(planned.record, planned.stagedFile, assetIdByExternal, `${job.id}:${item.index}`, false)
          const { externalId: _e, importKey: _k, kind: _kind, ...rest } = patch
          void _e
          void _k
          void _kind
          const updated = await store.update(planned.matchId, rest)
          item.status = updated ? 'updated' : 'failed'
          if (!updated) item.error = 'Bản ghi cần cập nhật không còn tồn tại'
        } else {
          const forceNoId = planned.match === 'id'
          const [created] = await store.insert([toNewItem(planned.record, planned.stagedFile, assetIdByExternal, `${job.id}:${item.index}`, forceNoId)])
          if (created.externalId) assetIdByExternal.set(created.externalId, created.id)
          if (created.kind === 'memeAsset' && planned.record.externalId) assetIdByExternal.set(planned.record.externalId, created.id)
          item.status = 'created'
        }
      } catch (e) {
        item.status = 'failed'
        item.error = e instanceof Error ? e.message : 'Lỗi không xác định'
      }
    }
    finish(job)
    await store.saveJob(job)
  }
  finish(job)
  await store.saveJob(job)
  logEvent('meme_party.import', { jobId: job.id, kind: job.kind, status: job.status, created: job.created, updated: job.updated, skipped: job.skipped, failed: job.failed, actor })
  return job
}

/** Re-queues failed items (valid records only) so they can be committed again. */
export async function retryFailed(store: ContentStore, jobId: string, actor: string): Promise<ImportJob | null> {
  const job = await store.getJob(jobId)
  if (!job) return null
  const retryable = new Set(job.records.map((r) => r.index))
  let requeued = 0
  for (const it of job.items) {
    if (it.status === 'failed' && retryable.has(it.index)) {
      it.status = 'pending'
      it.error = null
      requeued++
    }
  }
  if (requeued === 0) return job
  finish(job)
  await store.saveJob(job)
  return commitImport(store, jobId, actor)
}

export async function cancelImport(store: ContentStore, jobId: string): Promise<ImportJob | null> {
  const job = await store.getJob(jobId)
  if (!job) return null
  if (job.status !== 'pending') return job
  job.status = 'cancelled'
  job.completedAt = new Date().toISOString()
  await store.saveJob(job)
  return job
}

/** Downloadable error report that can be corrected and re-imported. */
export function errorReportCsv(job: ImportJob): string {
  const rows = job.items.filter((i) => i.status === 'failed').map((i) => [String(i.index + 1), i.where, i.error ?? ''])
  return toCsv(['row', 'where', 'error'], rows)
}

function recordToFields(r: NormalizedRecord): Record<string, unknown> {
  return {
    id: r.externalId ?? '',
    contentType: r.kind,
    title: r.title,
    imageUrl: r.imageUrl,
    filename: r.filename ?? '',
    gameMode: r.gameMode ?? '',
    modes: r.modes,
    prompt: r.kind === 'gamePrompt' ? r.text : '',
    caption: r.kind === 'captionOption' ? r.text : '',
    imageRef: r.imageRef ?? '',
    category: r.category,
    tags: r.tags,
    language: r.language,
    status: r.status,
  }
}

export type { LibraryItem }
