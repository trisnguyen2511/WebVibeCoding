import type { ContentStore } from './content-store'
import { normalizeRecord } from './import-validate'
import { logEvent } from './log'
import type { FieldIssue, LibraryItem, NewLibraryItem } from './library-types'

export type ItemResult = { ok: true; item: LibraryItem } | { ok: false; status: number; errors: FieldIssue[] }

export function itemToFields(i: LibraryItem): Record<string, unknown> {
  return {
    id: i.externalId ?? '',
    contentType: i.kind,
    title: i.title,
    imageUrl: i.imageUrl,
    filename: i.originalFilename ?? '',
    gameMode: i.gameMode ?? '',
    modes: i.modes,
    prompt: i.kind === 'gamePrompt' ? i.text : '',
    caption: i.kind === 'captionOption' ? i.text : '',
    imageRef: '',
    category: i.category,
    tags: i.tags,
    language: i.language,
    status: i.status,
  }
}

async function resolveAssetId(store: ContentStore, imageRef: string | null): Promise<string | null | undefined> {
  if (!imageRef) return null
  const target = (await store.all()).find((i) => i.kind === 'memeAsset' && (i.externalId === imageRef || i.id === imageRef))
  return target?.id
}

export async function createItem(store: ContentStore, fields: Record<string, unknown>, actor: string): Promise<ItemResult> {
  const res = normalizeRecord({ index: 0, where: 'form', fields })
  if ('errors' in res) return { ok: false, status: 400, errors: res.errors }
  const rec = res.record
  const assetId = await resolveAssetId(store, rec.imageRef)
  if (assetId === undefined) return { ok: false, status: 400, errors: [{ field: 'imageRef', message: 'Không tìm thấy meme tham chiếu' }] }
  if (rec.externalId && (await store.all()).some((i) => i.externalId === rec.externalId)) {
    return { ok: false, status: 409, errors: [{ field: 'id', message: `id "${rec.externalId}" đã tồn tại` }] }
  }
  const row: NewLibraryItem = {
    externalId: rec.externalId,
    kind: rec.kind,
    title: rec.title,
    text: rec.text,
    imageUrl: rec.imageUrl,
    storagePath: null,
    originalFilename: rec.filename,
    mime: null,
    width: null,
    height: null,
    sha256: null,
    gameMode: rec.gameMode,
    modes: rec.modes,
    assetId,
    category: rec.category,
    tags: rec.tags,
    language: rec.language,
    status: rec.status,
    importKey: null,
  }
  if (row.kind === 'memeAsset' && !row.imageUrl) return { ok: false, status: 400, errors: [{ field: 'imageUrl', message: 'Cần imageUrl hoặc tải ảnh lên' }] }
  const [item] = await store.insert([row])
  logEvent('meme_party.library.create', { id: item.id, kind: item.kind, actor })
  return { ok: true, item }
}

/** Partial edit: merges the patch over the stored values, then re-validates the whole record. */
export async function updateItem(store: ContentStore, id: string, patch: Record<string, unknown>, actor: string): Promise<ItemResult> {
  const cur = await store.get(id)
  if (!cur || cur.deletedAt) return { ok: false, status: 404, errors: [{ field: '', message: 'Không tìm thấy' }] }
  const merged = { ...itemToFields(cur), ...patch, contentType: cur.kind }
  const res = normalizeRecord({ index: 0, where: 'form', fields: merged })
  if ('errors' in res) return { ok: false, status: 400, errors: res.errors }
  const rec = res.record
  if (rec.externalId && rec.externalId !== cur.externalId && (await store.all()).some((i) => i.externalId === rec.externalId)) {
    return { ok: false, status: 409, errors: [{ field: 'id', message: `id "${rec.externalId}" đã tồn tại` }] }
  }
  const updated = await store.update(id, {
    externalId: rec.externalId,
    title: rec.title,
    text: rec.text,
    imageUrl: rec.imageUrl || cur.imageUrl,
    gameMode: rec.gameMode,
    modes: rec.modes,
    category: rec.category,
    tags: rec.tags,
    language: rec.language,
    status: rec.status,
  })
  if (!updated) return { ok: false, status: 404, errors: [{ field: '', message: 'Không tìm thấy' }] }
  logEvent('meme_party.library.update', { id, actor })
  return { ok: true, item: updated }
}

export async function bulkAction(store: ContentStore, ids: string[], action: 'activate' | 'deactivate' | 'delete', actor: string): Promise<number> {
  const clean = ids.filter((x) => typeof x === 'string').slice(0, 500)
  const n = action === 'delete' ? await store.softDelete(clean) : await store.setStatus(clean, action === 'activate' ? 'active' : 'inactive')
  logEvent('meme_party.library.bulk', { action, requested: clean.length, affected: n, actor })
  return n
}
