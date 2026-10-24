import { normalizeRecord, type ParsedSource } from './import-validate'
import type {
  DuplicatePolicy,
  FieldIssue,
  ImportPlan,
  LibraryItem,
  NormalizedRecord,
  PlanItem,
  RawRecord,
  StagedFile,
} from './library-types'

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Content signature used to spot likely duplicates (different or missing IDs, same content). */
export function signature(r: Pick<NormalizedRecord, 'kind' | 'gameMode' | 'text' | 'title' | 'imageUrl'>, sha?: string | null): string {
  if (r.kind === 'memeAsset') return `asset|${sha ?? r.imageUrl}`
  if (r.kind === 'gamePrompt') return `prompt|${r.gameMode}|${norm(r.text)}`
  return `caption|${norm(r.text)}`
}

export function itemSignature(i: LibraryItem): string {
  if (i.kind === 'memeAsset') return `asset|${i.sha256 ?? i.imageUrl}`
  if (i.kind === 'gamePrompt') return `prompt|${i.gameMode}|${norm(i.text)}`
  return `caption|${norm(i.text)}`
}

const fileBase = (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase()

function matchFile(rec: NormalizedRecord, files: StagedFile[]): { file: StagedFile | null; issue?: FieldIssue } {
  const byName = rec.filename ? files.filter((f) => f.filename.toLowerCase() === rec.filename!.toLowerCase()) : []
  if (byName.length > 1) return { file: null, issue: { field: 'filename', message: `Có ${byName.length} file trùng tên "${rec.filename}" — đổi tên để không nhập nhằng` } }
  if (byName.length === 1) return { file: byName[0] }
  if (rec.filename) return { file: null, issue: { field: 'filename', message: `Không có file tải lên nào tên "${rec.filename}"` } }
  if (rec.externalId) {
    const byId = files.filter((f) => fileBase(f.filename) === rec.externalId!.toLowerCase())
    if (byId.length > 1) return { file: null, issue: { field: 'id', message: `Có ${byId.length} file khớp quy ước tên theo id "${rec.externalId}"` } }
    if (byId.length === 1) return { file: byId[0] }
  }
  return { file: null }
}

const fields: (keyof NormalizedRecord)[] = ['title', 'text', 'imageUrl', 'gameMode', 'modes', 'category', 'tags', 'language', 'status']

function changesFor(existing: LibraryItem, rec: NormalizedRecord, imageUrl: string): PlanItem['changes'] {
  const out: PlanItem['changes'] = []
  for (const field of fields) {
    const next = field === 'imageUrl' ? imageUrl : (rec[field] as unknown)
    const prev = (existing as unknown as Record<string, unknown>)[field]
    const a = Array.isArray(prev) ? prev.join('|') : String(prev ?? '')
    const b = Array.isArray(next) ? next.join('|') : String(next ?? '')
    // Prompts and captions have no image/modes; memeAssets have no text — skip fields that don't apply.
    if (rec.kind !== 'memeAsset' && (field === 'imageUrl' || field === 'modes') && !b) continue
    if (rec.kind === 'memeAsset' && (field === 'text' || field === 'gameMode')) continue
    if (rec.kind === 'captionOption' && field === 'gameMode') continue
    if (a !== b) out.push({ field, from: a, to: b })
  }
  return out
}

export function planImport(
  source: ParsedSource,
  opts: { existing: LibraryItem[]; policy: DuplicatePolicy; files?: StagedFile[] },
): ImportPlan {
  const files = opts.files ?? []
  const existingById = new Map(opts.existing.filter((i) => i.externalId).map((i) => [i.externalId as string, i]))
  const existingBySig = new Map<string, LibraryItem>()
  for (const i of opts.existing) if (!existingBySig.has(itemSignature(i))) existingBySig.set(itemSignature(i), i)

  const items: PlanItem[] = []
  const usedFiles = new Set<string>()

  const blank = (raw: RawRecord): PlanItem => ({
    index: raw.index,
    where: raw.where,
    action: 'invalid',
    match: null,
    matchId: null,
    errors: [],
    warnings: [],
    changes: [],
    record: null,
    stagedFile: null,
  })

  // Structural errors become invalid pseudo-items so nothing is silently skipped.
  source.errors.forEach((e, i) => {
    items.push({ ...blank({ index: -1 - i, where: e.where, fields: {} }), errors: [{ field: '', message: e.message }] })
  })

  const normalized: PlanItem[] = source.records.map((raw) => {
    const item = blank(raw)
    const res = normalizeRecord(raw)
    if ('errors' in res) item.errors = res.errors
    else {
      item.record = res.record
      item.warnings = res.warnings
    }
    return item
  })

  // Pass 1: in-file IDs and asset ids (for imageRef resolution).
  const seenIds = new Map<string, string>()
  const fileAssetIds = new Set<string>()
  for (const item of normalized) {
    const id = item.record?.externalId
    if (!item.record || !id) continue
    const prior = seenIds.get(id)
    if (prior) {
      item.errors.push({ field: 'id', message: `id "${id}" bị trùng trong file (đã dùng ở ${prior})` })
      item.record = null
    } else {
      seenIds.set(id, item.where)
      if (item.record.kind === 'memeAsset') fileAssetIds.add(id)
    }
  }

  const seenSigs = new Map<string, string>()
  for (const item of normalized) {
    const rec = item.record
    if (!rec) {
      item.action = 'invalid'
      items.push(item)
      continue
    }

    let sha: string | null = null
    if (rec.kind === 'memeAsset') {
      const { file, issue } = matchFile(rec, files)
      if (issue) item.errors.push(issue)
      if (file) {
        item.stagedFile = file
        usedFiles.add(file.filename)
        sha = file.sha256
        if (rec.imageUrl) item.warnings.push({ field: 'imageUrl', message: 'Có cả imageUrl và file tải lên — dùng file tải lên' })
      } else if (!rec.imageUrl && !issue) {
        item.errors.push({ field: 'imageUrl', message: 'Không có imageUrl và không tìm thấy file ảnh khớp' })
      }
    }
    if (rec.kind === 'gamePrompt' && rec.imageRef) {
      const target = existingById.get(rec.imageRef)
      if ((!target || target.kind !== 'memeAsset') && !fileAssetIds.has(rec.imageRef)) {
        item.errors.push({ field: 'imageRef', message: `Không tìm thấy memeAsset có id "${rec.imageRef}"` })
      }
    }
    if (item.errors.length > 0) {
      item.action = 'invalid'
      items.push(item)
      continue
    }

    const sig = signature(rec, sha)
    const priorSig = seenSigs.get(sig)
    if (priorSig) {
      item.action = 'skip'
      item.match = 'content'
      item.warnings.push({ field: '', message: `Trùng nội dung với ${priorSig} trong cùng file — bỏ qua` })
      items.push(item)
      continue
    }
    seenSigs.set(sig, item.where)

    const exactId = rec.externalId ? existingById.get(rec.externalId) : undefined
    if (exactId && exactId.kind !== rec.kind) {
      item.errors.push({ field: 'id', message: `id "${rec.externalId}" đã được dùng cho loại ${exactId.kind}` })
      item.action = 'invalid'
      items.push(item)
      continue
    }
    const match = exactId ?? existingBySig.get(sig)
    const imageUrl = item.stagedFile?.imageUrl ?? rec.imageUrl
    if (!match) {
      item.action = 'create'
    } else {
      item.match = exactId ? 'id' : 'content'
      item.matchId = match.id
      if (opts.policy === 'skip') {
        item.action = 'skip'
      } else if (opts.policy === 'update') {
        item.changes = changesFor(match, rec, imageUrl)
        item.action = item.changes.length > 0 ? 'update' : 'skip'
        if (item.changes.length === 0) item.warnings.push({ field: '', message: 'Không có thay đổi' })
      } else {
        item.action = 'create'
        if (exactId) item.warnings.push({ field: 'id', message: `id "${rec.externalId}" đã tồn tại — tạo bản ghi mới sẽ không giữ id này` })
      }
    }
    items.push(item)
  }

  items.sort((a, b) => a.index - b.index)
  const count = (a: PlanItem['action']) => items.filter((i) => i.action === a).length
  return {
    items,
    summary: {
      total: items.length,
      valid: items.length - count('invalid'),
      invalid: count('invalid'),
      create: count('create'),
      update: count('update'),
      skip: count('skip'),
      duplicates: items.filter((i) => i.match !== null).length,
      unmatchedRecords: items.filter((i) => i.record?.kind === 'memeAsset' && !i.stagedFile && !i.record.imageUrl).map((i) => i.where),
      unusedFiles: files.filter((f) => !usedFiles.has(f.filename)).map((f) => f.filename),
    },
  }
}
