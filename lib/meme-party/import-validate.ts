import { checkImageUrl } from './image-url'
import { parseCsv } from './csv'
import {
  CONTENT_KINDS,
  type ContentKind,
  type ContentStatus,
  type FieldIssue,
  type NormalizedRecord,
  type RawRecord,
} from './library-types'
import { GAME_MODES, MODE_LABEL, type GameMode } from './types'

export const LIMITS = {
  maxRecords: Number(process.env.MEME_IMPORT_MAX_RECORDS) || 2000,
  maxFileBytes: (Number(process.env.MEME_IMPORT_MAX_FILE_KB) || 2048) * 1024,
  maxImageBytes: (Number(process.env.MEME_UPLOAD_MAX_MB) || 4) * 1024 * 1024,
  maxTitle: 80,
  maxPrompt: 280,
  maxCaption: 140,
  maxTags: 12,
}

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/

const MODE_ALIASES: Record<string, GameMode> = {
  caption: 'caption',
  'caption battle': 'caption',
  meme: 'meme',
  'meme battle': 'meme',
  reaction: 'reaction',
  'reaction battle': 'reaction',
}
for (const mode of GAME_MODES) MODE_ALIASES[MODE_LABEL[mode].toLowerCase()] = mode

export function parseMode(value: unknown): GameMode | null {
  return typeof value === 'string' ? (MODE_ALIASES[value.trim().toLowerCase()] ?? null) : null
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

/** Strips control characters and angle brackets; imported text is always treated as plain text. */
export function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[<>]/g, '').trim()
}

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => cleanText(str(x))).filter(Boolean)
  return str(v)
    .split(/[|;,]/)
    .map((x) => cleanText(x))
    .filter(Boolean)
}

/** Validates one raw record. Returns the normalised record, or the list of field issues. */
export function normalizeRecord(raw: RawRecord): { record: NormalizedRecord; warnings: FieldIssue[] } | { errors: FieldIssue[] } {
  const f = raw.fields
  const errors: FieldIssue[] = []
  const warnings: FieldIssue[] = []

  const kindRaw = str(f.contentType)
  const kind = CONTENT_KINDS.find((k) => k.toLowerCase() === kindRaw.toLowerCase()) as ContentKind | undefined
  if (!kind) {
    errors.push({ field: 'contentType', message: `contentType phải là một trong: ${CONTENT_KINDS.join(', ')}` })
    return { errors }
  }

  const externalId = str(f.id) || null
  if (externalId && !ID_RE.test(externalId)) errors.push({ field: 'id', message: 'id chỉ gồm chữ, số, _ . : - (tối đa 64 ký tự)' })

  const title = cleanText(str(f.title))
  if (title.length > LIMITS.maxTitle) errors.push({ field: 'title', message: `title tối đa ${LIMITS.maxTitle} ký tự` })

  const language = str(f.language) || 'vi'
  if (!LANG_RE.test(language)) errors.push({ field: 'language', message: 'language phải là mã ngôn ngữ như vi, en, en-US' })

  const statusRaw = (str(f.status) || 'active').toLowerCase()
  if (statusRaw !== 'active' && statusRaw !== 'inactive') errors.push({ field: 'status', message: 'status phải là active hoặc inactive' })

  const category = cleanText(str(f.category)).toLowerCase() || 'general'
  const tags = parseList(f.tags)
  if (tags.length > LIMITS.maxTags) errors.push({ field: 'tags', message: `Tối đa ${LIMITS.maxTags} tag` })

  let text = ''
  let imageUrl = ''
  let filename: string | null = null
  let gameMode: GameMode | null = null
  let modes: GameMode[] = []
  let imageRef: string | null = null

  if (kind === 'memeAsset') {
    if (!title) errors.push({ field: 'title', message: 'title là bắt buộc với memeAsset' })
    const url = str(f.imageUrl)
    filename = str(f.filename) || null
    if (!url && !filename && !externalId) errors.push({ field: 'imageUrl', message: 'Cần imageUrl, filename (ảnh tải lên kèm) hoặc id trùng tên file ảnh' })
    if (url) {
      const check = checkImageUrl(url)
      if (!check.ok) errors.push({ field: 'imageUrl', message: check.reason ?? 'URL ảnh không hợp lệ' })
      else {
        imageUrl = check.url
        if (check.warning) warnings.push({ field: 'imageUrl', message: check.warning })
      }
    }
    const modeList = f.modes === undefined || str(f.modes) === '' ? [] : parseList(f.modes)
    modes = []
    for (const m of modeList) {
      const parsed = parseMode(m)
      if (!parsed) errors.push({ field: 'modes', message: `Chế độ "${m}" không hợp lệ` })
      else if (!modes.includes(parsed)) modes.push(parsed)
    }
    if (modes.length === 0) modes = ['meme', 'reaction']
    if (modes.length === 1 && modes[0] === 'caption') errors.push({ field: 'modes', message: 'Caption Battle dùng caption, không dùng ảnh meme' })
    modes = modes.filter((m) => m !== 'caption')
  } else if (kind === 'gamePrompt') {
    gameMode = parseMode(f.gameMode)
    if (!gameMode) errors.push({ field: 'gameMode', message: `gameMode phải là: ${GAME_MODES.join(', ')}` })
    text = cleanText(str(f.prompt))
    if (!text) errors.push({ field: 'prompt', message: 'prompt là bắt buộc với gamePrompt' })
    if (text.length > LIMITS.maxPrompt) errors.push({ field: 'prompt', message: `prompt tối đa ${LIMITS.maxPrompt} ký tự` })
    imageRef = str(f.imageRef) || null
    if (imageRef && !ID_RE.test(imageRef)) errors.push({ field: 'imageRef', message: 'imageRef phải là id của một memeAsset' })
    if (str(f.imageUrl)) {
      const check = checkImageUrl(str(f.imageUrl))
      if (!check.ok) errors.push({ field: 'imageUrl', message: check.reason ?? 'URL ảnh không hợp lệ' })
      else imageUrl = check.url
    }
  } else {
    text = cleanText(str(f.caption))
    if (!text) errors.push({ field: 'caption', message: 'caption là bắt buộc với captionOption' })
    if (text.length > LIMITS.maxCaption) errors.push({ field: 'caption', message: `caption tối đa ${LIMITS.maxCaption} ký tự` })
  }

  if (errors.length > 0) return { errors }
  return {
    record: {
      index: raw.index,
      where: raw.where,
      kind,
      externalId,
      title: title || text.slice(0, 60),
      text,
      imageUrl,
      filename,
      gameMode,
      modes,
      imageRef,
      category,
      tags,
      language,
      status: statusRaw as ContentStatus,
    },
    warnings,
  }
}

// ── Source parsing ──────────────────────────────────────────────────────────

export interface ParsedSource {
  records: RawRecord[]
  /** Structural errors (not tied to one record's fields). */
  errors: { where: string; message: string }[]
}

export function recordsFromCsv(text: string): ParsedSource {
  if (text.length > LIMITS.maxFileBytes) return { records: [], errors: [{ where: 'file', message: 'File CSV vượt giới hạn dung lượng' }] }
  const parsed = parseCsv(text)
  const errors = parsed.errors.map((e) => ({ where: `dòng ${e.line}`, message: e.message }))
  if (parsed.rows.length > LIMITS.maxRecords) {
    return { records: [], errors: [...errors, { where: 'file', message: `Tối đa ${LIMITS.maxRecords} dòng mỗi lần import` }] }
  }
  return {
    records: parsed.rows.map((r, i) => ({ index: i, where: `dòng ${r.line}`, fields: r.values })),
    errors,
  }
}

export function recordsFromJson(text: string): ParsedSource {
  if (text.length > LIMITS.maxFileBytes) return { records: [], errors: [{ where: 'file', message: 'File JSON vượt giới hạn dung lượng' }] }
  let data: unknown
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch (e) {
    return { records: [], errors: [{ where: 'file', message: 'JSON không hợp lệ: ' + (e instanceof Error ? e.message : 'lỗi cú pháp') }] }
  }
  let items: unknown
  let prefix = ''
  if (Array.isArray(data)) {
    items = data
  } else if (data && typeof data === 'object' && 'items' in data) {
    const version = (data as { version?: unknown }).version
    if (version !== undefined && version !== 1) return { records: [], errors: [{ where: 'version', message: 'Chỉ hỗ trợ version 1' }] }
    items = (data as { items: unknown }).items
    prefix = 'items'
  } else {
    return { records: [], errors: [{ where: 'file', message: 'Cần một mảng, hoặc object dạng { "version": 1, "items": [...] }' }] }
  }
  if (!Array.isArray(items)) return { records: [], errors: [{ where: 'items', message: 'items phải là một mảng' }] }
  if (items.length > LIMITS.maxRecords) return { records: [], errors: [{ where: 'file', message: `Tối đa ${LIMITS.maxRecords} bản ghi mỗi lần import` }] }
  const errors: ParsedSource['errors'] = []
  const records: RawRecord[] = []
  items.forEach((item, i) => {
    const where = prefix ? `items[${i}]` : `[${i}]`
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ where, message: 'Mỗi phần tử phải là một object' })
      return
    }
    records.push({ index: i, where, fields: item as Record<string, unknown> })
  })
  return { records, errors }
}
