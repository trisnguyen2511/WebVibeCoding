import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type {
  ContentKind,
  ContentStatus,
  ImportJob,
  LibraryFilter,
  LibraryItem,
  NewLibraryItem,
} from './library-types'
import { hasSupabaseConfig } from './room-store'
import { STARTER_POOL } from './starter-content'
import { GAME_MODES, type AssetContent, type ContentPool, type GameMode, type PromptContent } from './types'

export const IMAGE_BUCKET = 'meme-party'

export interface ContentStore {
  list(filter: LibraryFilter): Promise<{ items: LibraryItem[]; total: number }>
  /** Every non-deleted row (bounded) — used for duplicate detection and pool building. */
  all(): Promise<LibraryItem[]>
  get(id: string): Promise<LibraryItem | null>
  /** Inserts rows. Rows whose importKey already exists are returned untouched (retry-safe). */
  insert(items: NewLibraryItem[]): Promise<LibraryItem[]>
  update(id: string, patch: Partial<NewLibraryItem>): Promise<LibraryItem | null>
  setStatus(ids: string[], status: ContentStatus): Promise<number>
  softDelete(ids: string[]): Promise<number>
  findAssetBySha(sha: string): Promise<LibraryItem | null>
  getPool(): Promise<ContentPool>
  saveJob(job: ImportJob): Promise<void>
  getJob(id: string): Promise<ImportJob | null>
  listJobs(limit: number): Promise<ImportJob[]>
  putFile(key: string, bytes: Buffer, mime: string): Promise<{ url: string; storagePath: string }>
  getFile(key: string): Promise<{ bytes: Buffer; mime: string } | null>
}

// ── Pool building (shared) ──────────────────────────────────────────────────

/** Active, non-deleted library content; any category the library lacks falls back to the starter pack. */
export function buildPool(items: LibraryItem[]): ContentPool {
  const live = items.filter((i) => i.status === 'active' && !i.deletedAt)
  const assetsById = new Map(live.filter((i) => i.kind === 'memeAsset').map((i) => [i.id, i]))

  const prompts: PromptContent[] = live
    .filter((i) => i.kind === 'gamePrompt' && i.gameMode)
    .map((i) => ({
      id: i.id,
      mode: i.gameMode as GameMode,
      text: i.text,
      title: i.title,
      imageUrl: i.assetId ? assetsById.get(i.assetId)?.imageUrl || i.imageUrl || undefined : i.imageUrl || undefined,
    }))
  const captions = live.filter((i) => i.kind === 'captionOption').map((i) => ({ id: i.id, text: i.text }))
  const assets: AssetContent[] = live
    .filter((i) => i.kind === 'memeAsset' && i.imageUrl)
    .map((i) => ({ id: i.id, title: i.title, imageUrl: i.imageUrl, modes: i.modes }))

  const pool: ContentPool = { prompts, captions, assets }
  for (const mode of GAME_MODES) {
    if (!pool.prompts.some((p) => p.mode === mode)) pool.prompts.push(...STARTER_POOL.prompts.filter((p) => p.mode === mode))
  }
  if (pool.captions.length < 3) pool.captions.push(...STARTER_POOL.captions)
  for (const mode of ['meme', 'reaction'] as const) {
    if (pool.assets.filter((a) => a.modes.includes(mode)).length < 3) {
      pool.assets.push(...STARTER_POOL.assets.filter((a) => !pool.assets.some((x) => x.id === a.id)))
      break
    }
  }
  return pool
}

function applyFilter(items: LibraryItem[], f: LibraryFilter): LibraryItem[] {
  const q = f.q?.trim().toLowerCase()
  return items.filter((i) => {
    if (f.kind && i.kind !== f.kind) return false
    if (f.status && i.status !== f.status) return false
    if (f.category && i.category !== f.category) return false
    if (f.language && i.language !== f.language) return false
    if (f.tag && !i.tags.includes(f.tag)) return false
    if (f.mode && i.gameMode !== f.mode && !i.modes.includes(f.mode)) return false
    if (q && ![i.title, i.text, i.externalId ?? '', i.id].some((s) => s.toLowerCase().includes(q))) return false
    return true
  })
}

// ── In-memory implementation ────────────────────────────────────────────────

export class MemoryContentStore implements ContentStore {
  private items = new Map<string, LibraryItem>()
  private jobs = new Map<string, ImportJob>()
  private files = new Map<string, { bytes: Buffer; mime: string }>()

  async list(filter: LibraryFilter) {
    const matched = applyFilter(
      Array.from(this.items.values()).filter((i) => !i.deletedAt),
      filter,
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    const offset = filter.offset ?? 0
    return { items: matched.slice(offset, offset + (filter.limit ?? 50)), total: matched.length }
  }
  async all() {
    return Array.from(this.items.values()).filter((i) => !i.deletedAt)
  }
  async get(id: string) {
    return this.items.get(id) ?? null
  }
  async insert(rows: NewLibraryItem[]) {
    const out: LibraryItem[] = []
    for (const row of rows) {
      const dupe = row.importKey ? Array.from(this.items.values()).find((i) => i.importKey === row.importKey) : undefined
      if (dupe) {
        out.push(dupe)
        continue
      }
      if (row.externalId && Array.from(this.items.values()).some((i) => i.externalId === row.externalId && !i.deletedAt)) {
        throw new Error(`externalId "${row.externalId}" already exists`)
      }
      const now = new Date().toISOString()
      const item: LibraryItem = { ...row, id: randomUUID(), createdAt: now, updatedAt: now, deletedAt: null }
      this.items.set(item.id, item)
      out.push(item)
    }
    return out
  }
  async update(id: string, patch: Partial<NewLibraryItem>) {
    const cur = this.items.get(id)
    if (!cur || cur.deletedAt) return null
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() }
    this.items.set(id, next)
    return next
  }
  async setStatus(ids: string[], status: ContentStatus) {
    let n = 0
    for (const id of ids) if (await this.update(id, { status })) n++
    return n
  }
  async softDelete(ids: string[]) {
    let n = 0
    for (const id of ids) {
      const cur = this.items.get(id)
      if (cur && !cur.deletedAt) {
        this.items.set(id, { ...cur, deletedAt: new Date().toISOString(), status: 'inactive' })
        n++
      }
    }
    return n
  }
  async findAssetBySha(sha: string) {
    return Array.from(this.items.values()).find((i) => i.kind === 'memeAsset' && i.sha256 === sha && !i.deletedAt) ?? null
  }
  async getPool() {
    return buildPool(await this.all())
  }
  async saveJob(job: ImportJob) {
    this.jobs.set(job.id, JSON.parse(JSON.stringify(job)) as ImportJob)
  }
  async getJob(id: string) {
    const job = this.jobs.get(id)
    return job ? (JSON.parse(JSON.stringify(job)) as ImportJob) : null
  }
  async listJobs(limit: number) {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit)
  }
  async putFile(key: string, bytes: Buffer, mime: string) {
    this.files.set(key, { bytes, mime })
    return { url: `/api/meme-party/file/${encodeURIComponent(key)}`, storagePath: key }
  }
  async getFile(key: string) {
    return this.files.get(key) ?? null
  }
}

// ── Supabase implementation ─────────────────────────────────────────────────

interface Row {
  id: string
  external_id: string | null
  kind: ContentKind
  title: string
  text: string
  image_url: string
  storage_path: string | null
  original_filename: string | null
  mime: string | null
  width: number | null
  height: number | null
  sha256: string | null
  game_mode: GameMode | null
  modes: GameMode[]
  asset_id: string | null
  category: string
  tags: string[]
  language: string
  status: ContentStatus
  import_key: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

const fromRow = (r: Row): LibraryItem => ({
  id: r.id,
  externalId: r.external_id,
  kind: r.kind,
  title: r.title,
  text: r.text,
  imageUrl: r.image_url,
  storagePath: r.storage_path,
  originalFilename: r.original_filename,
  mime: r.mime,
  width: r.width,
  height: r.height,
  sha256: r.sha256,
  gameMode: r.game_mode,
  modes: r.modes ?? [],
  assetId: r.asset_id,
  category: r.category,
  tags: r.tags ?? [],
  language: r.language,
  status: r.status,
  importKey: r.import_key,
  deletedAt: r.deleted_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const toRow = (i: Partial<NewLibraryItem>): Partial<Row> => {
  const out: Partial<Row> = {}
  if (i.externalId !== undefined) out.external_id = i.externalId
  if (i.kind !== undefined) out.kind = i.kind
  if (i.title !== undefined) out.title = i.title
  if (i.text !== undefined) out.text = i.text
  if (i.imageUrl !== undefined) out.image_url = i.imageUrl
  if (i.storagePath !== undefined) out.storage_path = i.storagePath
  if (i.originalFilename !== undefined) out.original_filename = i.originalFilename
  if (i.mime !== undefined) out.mime = i.mime
  if (i.width !== undefined) out.width = i.width
  if (i.height !== undefined) out.height = i.height
  if (i.sha256 !== undefined) out.sha256 = i.sha256
  if (i.gameMode !== undefined) out.game_mode = i.gameMode
  if (i.modes !== undefined) out.modes = i.modes
  if (i.assetId !== undefined) out.asset_id = i.assetId
  if (i.category !== undefined) out.category = i.category
  if (i.tags !== undefined) out.tags = i.tags
  if (i.language !== undefined) out.language = i.language
  if (i.status !== undefined) out.status = i.status
  if (i.importKey !== undefined) out.import_key = i.importKey
  return out
}

const ALL_LIMIT = 5000

export class SupabaseContentStore implements ContentStore {
  private db = getSupabaseAdmin()

  async list(f: LibraryFilter) {
    let q = this.db.from('meme_library_items').select('*', { count: 'exact' }).is('deleted_at', null)
    if (f.kind) q = q.eq('kind', f.kind)
    if (f.status) q = q.eq('status', f.status)
    if (f.category) q = q.eq('category', f.category)
    if (f.language) q = q.eq('language', f.language)
    if (f.tag) q = q.contains('tags', [f.tag])
    if (f.mode) q = q.or(`game_mode.eq.${f.mode},modes.cs.{${f.mode}}`)
    if (f.q?.trim()) {
      const term = f.q.trim().replace(/[%,()]/g, ' ')
      q = q.or(`title.ilike.%${term}%,text.ilike.%${term}%,external_id.ilike.%${term}%`)
    }
    const offset = f.offset ?? 0
    const { data, error, count } = await q.order('created_at', { ascending: false }).range(offset, offset + (f.limit ?? 50) - 1)
    if (error) throw new Error(error.message)
    return { items: ((data ?? []) as Row[]).map(fromRow), total: count ?? 0 }
  }
  async all() {
    const { data, error } = await this.db.from('meme_library_items').select('*').is('deleted_at', null).limit(ALL_LIMIT)
    if (error) throw new Error(error.message)
    return ((data ?? []) as Row[]).map(fromRow)
  }
  async get(id: string) {
    const { data, error } = await this.db.from('meme_library_items').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? fromRow(data as Row) : null
  }
  async insert(rows: NewLibraryItem[]) {
    const out: LibraryItem[] = []
    for (const row of rows) {
      if (row.importKey) {
        const { data: existing } = await this.db.from('meme_library_items').select('*').eq('import_key', row.importKey).maybeSingle()
        if (existing) {
          out.push(fromRow(existing as Row))
          continue
        }
      }
      const { data, error } = await this.db.from('meme_library_items').insert(toRow(row)).select('*').single()
      if (error) throw new Error(error.message)
      out.push(fromRow(data as Row))
    }
    return out
  }
  async update(id: string, patch: Partial<NewLibraryItem>) {
    const { data, error } = await this.db
      .from('meme_library_items')
      .update({ ...toRow(patch), updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? fromRow(data as Row) : null
  }
  async setStatus(ids: string[], status: ContentStatus) {
    if (ids.length === 0) return 0
    const { data, error } = await this.db.from('meme_library_items').update({ status, updated_at: new Date().toISOString() }).in('id', ids).is('deleted_at', null).select('id')
    if (error) throw new Error(error.message)
    return data?.length ?? 0
  }
  async softDelete(ids: string[]) {
    if (ids.length === 0) return 0
    const { data, error } = await this.db.from('meme_library_items').update({ deleted_at: new Date().toISOString(), status: 'inactive' }).in('id', ids).is('deleted_at', null).select('id')
    if (error) throw new Error(error.message)
    return data?.length ?? 0
  }
  async findAssetBySha(sha: string) {
    const { data, error } = await this.db.from('meme_library_items').select('*').eq('kind', 'memeAsset').eq('sha256', sha).is('deleted_at', null).limit(1).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? fromRow(data as Row) : null
  }
  async getPool() {
    return buildPool(await this.all())
  }
  async saveJob(job: ImportJob) {
    const { error } = await this.db.from('meme_import_jobs').upsert({
      id: job.id,
      kind: job.kind,
      filename: job.filename,
      status: job.status,
      created_by: job.createdBy,
      started_at: job.startedAt,
      completed_at: job.completedAt,
      data: job,
    })
    if (error) throw new Error(error.message)
  }
  async getJob(id: string) {
    const { data, error } = await this.db.from('meme_import_jobs').select('data').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ? ((data as { data: ImportJob }).data) : null
  }
  async listJobs(limit: number) {
    const { data, error } = await this.db.from('meme_import_jobs').select('data').order('started_at', { ascending: false }).limit(limit)
    if (error) throw new Error(error.message)
    return ((data ?? []) as { data: ImportJob }[]).map((r) => r.data)
  }
  async putFile(key: string, bytes: Buffer, mime: string) {
    const { error } = await this.db.storage.from(IMAGE_BUCKET).upload(key, bytes, { contentType: mime, upsert: true })
    if (error) throw new Error(error.message)
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${key}`
    return { url, storagePath: key }
  }
  async getFile() {
    return null
  }
}

// ── Selection ───────────────────────────────────────────────────────────────

const g = globalThis as unknown as { __memePartyContentStore?: MemoryContentStore }

export function getContentStore(): ContentStore {
  if (process.env.MEME_PARTY_STORE === 'memory' || (!hasSupabaseConfig() && process.env.NODE_ENV !== 'production')) {
    g.__memePartyContentStore ??= new MemoryContentStore()
    return g.__memePartyContentStore
  }
  return new SupabaseContentStore()
}
