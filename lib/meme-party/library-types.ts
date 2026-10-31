import type { GameMode } from './types'

export type ContentKind = 'memeAsset' | 'gamePrompt' | 'captionOption'
export const CONTENT_KINDS: ContentKind[] = ['memeAsset', 'gamePrompt', 'captionOption']
export type ContentStatus = 'active' | 'inactive'

export const KIND_LABEL: Record<ContentKind, string> = {
  memeAsset: 'Meme / ảnh',
  gamePrompt: 'Đề bài',
  captionOption: 'Caption',
}

/**
 * One row of the meme library. `kind` decides which fields apply:
 *  - memeAsset:     imageUrl (required), modes[]
 *  - gamePrompt:    gameMode + text (required), assetId (optional situation image)
 *  - captionOption: text (required)
 */
export interface LibraryItem {
  id: string
  /** Stable, human-declared ID used by imports to match existing rows. */
  externalId: string | null
  kind: ContentKind
  title: string
  text: string
  imageUrl: string
  storagePath: string | null
  originalFilename: string | null
  mime: string | null
  width: number | null
  height: number | null
  sha256: string | null
  gameMode: GameMode | null
  modes: GameMode[]
  assetId: string | null
  category: string
  tags: string[]
  language: string
  status: ContentStatus
  /** `${jobId}:${index}` of the import that created the row — makes commits retry-safe. */
  importKey: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export type NewLibraryItem = Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export interface LibraryFilter {
  q?: string
  kind?: ContentKind
  mode?: GameMode
  status?: ContentStatus
  category?: string
  tag?: string
  language?: string
  limit?: number
  offset?: number
}

// ── Import ──────────────────────────────────────────────────────────────────

export type DuplicatePolicy = 'skip' | 'update' | 'create_new'
export type ImportKind = 'csv' | 'json' | 'images' | 'combined'
export type JobStatus = 'pending' | 'processing' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'
export type ItemStatus = 'pending' | 'created' | 'updated' | 'skipped' | 'failed'

/** A record as parsed from CSV/JSON, before validation. All values are untrusted strings. */
export interface RawRecord {
  index: number
  /** CSV line number (1-based, header = 1) or JSON path like items[2]. */
  where: string
  fields: Record<string, unknown>
}

export interface FieldIssue {
  field: string
  message: string
}

export interface NormalizedRecord {
  index: number
  where: string
  kind: ContentKind
  externalId: string | null
  title: string
  text: string
  imageUrl: string
  filename: string | null
  gameMode: GameMode | null
  modes: GameMode[]
  /** Prompt situation image — externalId of a memeAsset. */
  imageRef: string | null
  category: string
  tags: string[]
  language: string
  status: ContentStatus
}

export interface StagedFile {
  /** Original (sanitised) filename. */
  filename: string
  imageUrl: string
  storagePath: string | null
  mime: string
  width: number | null
  height: number | null
  sha256: string
  size: number
}

export type PlanAction = 'create' | 'update' | 'skip' | 'invalid'

export interface PlanItem {
  index: number
  where: string
  action: PlanAction
  /** Why: exact explicit-ID match, likely duplicate content, or none. */
  match: 'id' | 'content' | null
  matchId: string | null
  errors: FieldIssue[]
  warnings: FieldIssue[]
  /** Fields that would change when updating: [field, old, new]. */
  changes: { field: string; from: string; to: string }[]
  record: NormalizedRecord | null
  /** Staged file chosen for this asset record, if any. */
  stagedFile: StagedFile | null
}

export interface PlanSummary {
  total: number
  valid: number
  invalid: number
  create: number
  update: number
  skip: number
  duplicates: number
  unmatchedRecords: string[]
  unusedFiles: string[]
}

export interface ImportPlan {
  items: PlanItem[]
  summary: PlanSummary
}

export interface ImportJob {
  id: string
  kind: ImportKind
  filename: string
  status: JobStatus
  policy: DuplicatePolicy
  createdBy: string
  startedAt: string
  completedAt: string | null
  total: number
  created: number
  updated: number
  skipped: number
  failed: number
  pending: number
  /** Normalised records + staged files held until commit. */
  records: NormalizedRecord[]
  files: StagedFile[]
  /** Per-item outcomes for the history view and error report. */
  items: { index: number; where: string; status: ItemStatus; error: string | null }[]
}
