'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Banner, Btn, cx } from '@/components/meme-party/parts'
import { api } from '@/lib/meme-party/client'
import {
  CONTENT_KINDS,
  KIND_LABEL,
  type ContentKind,
  type DuplicatePolicy,
  type FieldIssue,
  type ImportPlan,
  type LibraryItem,
  type PlanItem,
  type StagedFile,
} from '@/lib/meme-party/library-types'
import { GAME_MODES, MODE_LABEL, type GameMode } from '@/lib/meme-party/types'

const field = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none placeholder:text-muted focus:border-accent'

export function Label({ text, error, children }: { text: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{text}</span>
      {children}
      {error && <span role="alert" className="block text-xs text-red-400">{error}</span>}
    </label>
  )
}

/** Probes an image URL in the browser (the server never fetches remote URLs, which rules out SSRF). */
export function ImageProbe({ url, className }: { url: string; className?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'bad'>('loading')
  useEffect(() => setState('loading'), [url])
  if (!url) return null
  return (
    <span className={cx('relative inline-flex items-center justify-center overflow-hidden rounded-lg border border-border bg-background', className ?? 'h-16 w-16')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" referrerPolicy="no-referrer" onLoad={() => setState('ok')} onError={() => setState('bad')} className={cx('h-full w-full object-contain', state === 'bad' && 'hidden')} />
      {state === 'bad' && <span className="p-1 text-center text-[10px] leading-tight text-red-400">Không tải được ảnh</span>}
    </span>
  )
}

// ── Item form (create / edit) ───────────────────────────────────────────────

interface FormState {
  contentType: ContentKind
  id: string
  title: string
  imageUrl: string
  gameMode: GameMode
  modes: GameMode[]
  prompt: string
  caption: string
  imageRef: string
  category: string
  tags: string
  language: string
  status: 'active' | 'inactive'
}

const emptyForm = (): FormState => ({ contentType: 'memeAsset', id: '', title: '', imageUrl: '', gameMode: 'meme', modes: ['meme', 'reaction'], prompt: '', caption: '', imageRef: '', category: 'general', tags: '', language: 'vi', status: 'active' })

const fromItem = (i: LibraryItem): FormState => ({
  contentType: i.kind,
  id: i.externalId ?? '',
  title: i.title,
  imageUrl: i.imageUrl,
  gameMode: i.gameMode ?? 'meme',
  modes: i.modes.length ? i.modes : ['meme', 'reaction'],
  prompt: i.kind === 'gamePrompt' ? i.text : '',
  caption: i.kind === 'captionOption' ? i.text : '',
  imageRef: '',
  category: i.category,
  tags: i.tags.join('|'),
  language: i.language,
  status: i.status,
})

export function ItemForm({ item, onDone, onCancel }: { item: LibraryItem | null; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState<FormState>(item ? fromItem(item) : emptyForm())
  const [issues, setIssues] = useState<FieldIssue[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const err = (name: string) => issues.find((i) => i.field === name)?.message
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((cur) => ({ ...cur, [k]: v }))

  async function save() {
    setBusy(true)
    setIssues([])
    setError(null)
    const body = { ...f, modes: f.modes }
    const res = await fetch(item ? `/api/meme-party/admin/items/${item.id}` : '/api/meme-party/admin/items', {
      method: item ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as { error?: string; issues?: FieldIssue[] } | null
    setBusy(false)
    if (res.ok) return onDone()
    setIssues(data?.issues ?? [])
    setError(data?.error ?? `Lỗi ${res.status}`)
  }

  return (
    <div role="form" aria-label="Biểu mẫu bản ghi" className="space-y-3 rounded-2xl border border-accent/40 bg-surface p-4">
      <h3 className="font-display text-sm font-semibold text-fg">{item ? 'Sửa bản ghi' : 'Thêm bản ghi'}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label text="Loại">
          <select className={field} disabled={!!item} value={f.contentType} onChange={(e) => set('contentType', e.target.value as ContentKind)}>
            {CONTENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Label>
        <Label text="ID tuỳ chọn (để import cập nhật sau)" error={err('id')}>
          <input className={field} value={f.id} onChange={(e) => set('id', e.target.value)} />
        </Label>
        <Label text="Tiêu đề" error={err('title')}>
          <input className={field} value={f.title} onChange={(e) => set('title', e.target.value)} />
        </Label>
        {f.contentType === 'memeAsset' && (
          <Label text="URL ảnh trực tiếp (http/https)" error={err('imageUrl')}>
            <div className="flex items-center gap-2">
              <input className={field} value={f.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://…/meme.jpg" />
              <ImageProbe url={f.imageUrl} />
            </div>
          </Label>
        )}
        {f.contentType === 'memeAsset' && (
          <Label text="Dùng cho chế độ" error={err('modes')}>
            <div className="flex gap-3 py-2 text-sm text-fg">
              {(['meme', 'reaction'] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={f.modes.includes(m)} onChange={(e) => set('modes', e.target.checked ? [...f.modes, m] : f.modes.filter((x) => x !== m))} />
                  {MODE_LABEL[m]}
                </label>
              ))}
            </div>
          </Label>
        )}
        {f.contentType === 'gamePrompt' && (
          <>
            <Label text="Chế độ" error={err('gameMode')}>
              <select className={field} value={f.gameMode} onChange={(e) => set('gameMode', e.target.value as GameMode)}>
                {GAME_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select>
            </Label>
            <div className="sm:col-span-2">
              <Label text="Đề bài / tình huống" error={err('prompt')}>
                <textarea className={field} rows={2} value={f.prompt} onChange={(e) => set('prompt', e.target.value)} />
              </Label>
            </div>
            <Label text="ID meme làm ảnh tình huống (tuỳ chọn)" error={err('imageRef')}>
              <input className={field} value={f.imageRef} onChange={(e) => set('imageRef', e.target.value)} />
            </Label>
          </>
        )}
        {f.contentType === 'captionOption' && (
          <div className="sm:col-span-2">
            <Label text="Nội dung caption" error={err('caption')}>
              <textarea className={field} rows={2} value={f.caption} onChange={(e) => set('caption', e.target.value)} />
            </Label>
          </div>
        )}
        <Label text="Danh mục" error={err('category')}><input className={field} value={f.category} onChange={(e) => set('category', e.target.value)} /></Label>
        <Label text="Tag (ngăn cách bằng |)" error={err('tags')}><input className={field} value={f.tags} onChange={(e) => set('tags', e.target.value)} /></Label>
        <Label text="Ngôn ngữ" error={err('language')}><input className={field} value={f.language} onChange={(e) => set('language', e.target.value)} /></Label>
        <Label text="Trạng thái" error={err('status')}>
          <select className={field} value={f.status} onChange={(e) => set('status', e.target.value as 'active' | 'inactive')}>
            <option value="active">Đang dùng</option>
            <option value="inactive">Tạm tắt</option>
          </select>
        </Label>
      </div>
      {error && !issues.length && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {issues.length > 0 && <p role="alert" className="text-sm text-red-400">Vui lòng sửa các trường được đánh dấu — dữ liệu bạn nhập vẫn được giữ.</p>}
      <div className="flex gap-2">
        <Btn tone="primary" disabled={busy} onClick={save}>{item ? 'Lưu thay đổi' : 'Tạo'}</Btn>
        <Btn onClick={onCancel}>Huỷ</Btn>
      </div>
    </div>
  )
}

// ── Browse / manage ─────────────────────────────────────────────────────────

export function LibraryBrowser() {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [mode, setMode] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [language, setLanguage] = useState('')
  const [layout, setLayout] = useState<'list' | 'grid'>('list')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<LibraryItem | 'new' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const p = new URLSearchParams({ limit: '100' })
    for (const [k, v] of Object.entries({ q, kind, mode, status, category, language })) if (v) p.set(k, v)
    const res = await api<{ items: LibraryItem[]; total: number }>(`/api/meme-party/admin/items?${p}`)
    if (res.ok) {
      setItems(res.result.items)
      setTotal(res.result.total)
    } else setMsg(res.error)
  }, [q, kind, mode, status, category, language])

  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  async function bulk(action: 'activate' | 'deactivate' | 'delete') {
    const ids = Array.from(selected)
    if (action === 'delete' && !window.confirm(`Xoá ${ids.length} bản ghi? (xoá mềm — các ván đang/đã chơi không bị ảnh hưởng)`)) return
    const res = await api<{ affected: number }>('/api/meme-party/admin/items/bulk', { method: 'POST', body: JSON.stringify({ ids, action, confirm: action === 'delete' }) })
    setMsg(res.ok ? `Đã cập nhật ${res.result.affected} bản ghi` : res.error)
    setSelected(new Set())
    load()
  }

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <input className={cx(field, 'col-span-2')} placeholder="Tìm tiêu đề, nội dung, ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm kiếm" />
        <select className={field} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Loại"><option value="">Mọi loại</option>{CONTENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <select className={field} value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Chế độ"><option value="">Mọi chế độ</option>{GAME_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</select>
        <select className={field} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái"><option value="">Mọi trạng thái</option><option value="active">Đang dùng</option><option value="inactive">Tạm tắt</option></select>
        <input className={field} placeholder="Danh mục" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Danh mục" />
        <input className={field} placeholder="Ngôn ngữ" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Ngôn ngữ" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Btn tone="primary" onClick={() => setEditing('new')}>＋ Thêm mới</Btn>
        <Btn onClick={() => setLayout(layout === 'list' ? 'grid' : 'list')}>{layout === 'list' ? '▦ Lưới' : '☰ Danh sách'}</Btn>
        <span className="ml-auto font-mono text-xs text-muted">{total} bản ghi</span>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-surface px-3 py-2 text-sm">
          <span className="text-fg">Đã chọn {selected.size}</span>
          <Btn className="!min-h-9" onClick={() => bulk('activate')}>Bật</Btn>
          <Btn className="!min-h-9" onClick={() => bulk('deactivate')}>Tắt</Btn>
          <Btn tone="danger" className="!min-h-9" onClick={() => bulk('delete')}>Xoá</Btn>
        </div>
      )}
      {msg && <p role="status" className="text-xs text-muted">{msg}</p>}

      {editing && <ItemForm item={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); load() }} />}

      {items.length === 0 ? (
        <Banner icon="📚" title="Chưa có bản ghi nào khớp" text="Ván chơi dùng bộ starter có sẵn cho tới khi bạn thêm nội dung vào thư viện." />
      ) : layout === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((i) => (
            <div key={i.id} className={cx('space-y-1 rounded-xl border bg-surface p-2', selected.has(i.id) ? 'border-accent' : 'border-border', i.status === 'inactive' && 'opacity-60')}>
              <button type="button" className="block w-full" onClick={() => toggle(i.id)}>
                {i.kind === 'memeAsset' ? <ImageProbe url={i.imageUrl} className="h-28 w-full" /> : <p className="min-h-28 p-2 text-left text-xs text-fg">{i.text}</p>}
              </button>
              <p className="truncate text-xs text-fg">{i.title}</p>
              <button className="text-[11px] text-accent-soft hover:underline" onClick={() => setEditing(i)}>Sửa</button>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id} className={cx('flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2', i.status === 'inactive' && 'opacity-60')}>
              <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Chọn ${i.title}`} />
              {i.kind === 'memeAsset' ? <ImageProbe url={i.imageUrl} /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-xl">{i.kind === 'gamePrompt' ? '❓' : '💬'}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{i.kind === 'memeAsset' ? i.title : i.text}</p>
                <p className="truncate text-xs text-muted">
                  {KIND_LABEL[i.kind]} · {i.gameMode ? MODE_LABEL[i.gameMode] : i.modes.map((m) => MODE_LABEL[m]).join(', ') || '—'} · {i.category}
                  {i.tags.length ? ` · #${i.tags.join(' #')}` : ''} · {i.language}
                  {i.externalId ? ` · ${i.externalId}` : ''}
                </p>
              </div>
              <span className={cx('rounded-full border px-2 py-0.5 text-[10px]', i.status === 'active' ? 'border-accent/50 text-accent-soft' : 'border-border text-muted')}>{i.status === 'active' ? 'Đang dùng' : 'Tắt'}</span>
              <button className="text-xs text-accent-soft hover:underline" onClick={() => setEditing(i)}>Sửa</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Multi-image uploader ────────────────────────────────────────────────────

interface UploadRow {
  key: string
  file: File
  preview: string
  status: 'queued' | 'uploading' | 'done' | 'error'
  error?: string
  staged?: StagedFile
  reused?: boolean
}

export function ImageUploader({ onChange, hint }: { onChange: (files: StagedFile[]) => void; hint?: string }) {
  const [rows, setRows] = useState<UploadRow[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  useEffect(() => {
    onChange(rows.filter((r) => r.staged).map((r) => r.staged as StagedFile))
  }, [rows, onChange])

  function add(list: FileList | File[]) {
    const next: UploadRow[] = Array.from(list).map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, preview: URL.createObjectURL(file), status: 'queued' }))
    setRows((cur) => [...cur, ...next])
  }

  async function uploadOne(row: UploadRow) {
    setRows((cur) => cur.map((r) => (r.key === row.key ? { ...r, status: 'uploading', error: undefined } : r)))
    const form = new FormData()
    form.set('file', row.file)
    const res = await api<{ file: StagedFile; reused: boolean }>('/api/meme-party/admin/upload', { method: 'POST', body: form })
    setRows((cur) => cur.map((r) => (r.key === row.key ? (res.ok ? { ...r, status: 'done', staged: res.result.file, reused: res.result.reused } : { ...r, status: 'error', error: res.error }) : r)))
  }

  async function uploadAll() {
    const todo = rows.filter((r) => r.status === 'queued' || r.status === 'error')
    for (let i = 0; i < todo.length; i += 2) await Promise.all(todo.slice(i, i + 2).map(uploadOne))
  }

  const failed = rows.filter((r) => r.status === 'error').length
  const done = rows.filter((r) => r.status === 'done').length
  const waiting = rows.filter((r) => r.status === 'queued' || r.status === 'error').length

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }}
        className={cx('flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-surface p-6 text-center', drag ? 'border-accent' : 'border-border')}
      >
        <p className="text-sm text-fg">Kéo thả nhiều ảnh vào đây hoặc</p>
        <Btn onClick={() => inputRef.current?.click()}>Chọn ảnh</Btn>
        <p className="text-xs text-muted">{hint ?? 'JPG, PNG, WebP — tối đa 4MB/ảnh. Loại file được kiểm tra theo nội dung thật.'}</p>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }} />
      </div>

      {rows.length > 0 && (
        <>
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.preview} alt="" className="h-12 w-12 rounded-lg border border-border object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{r.file.name}</p>
                  <p className="text-xs text-muted">{(r.file.size / 1024).toFixed(0)} KB</p>
                  {r.error && <p role="alert" className="text-xs text-red-400">{r.error}</p>}
                </div>
                <span className={cx('text-xs', r.status === 'done' ? 'text-accent-soft' : r.status === 'error' ? 'text-red-400' : 'text-muted')}>
                  {r.status === 'queued' && 'Chờ tải'}
                  {r.status === 'uploading' && 'Đang tải…'}
                  {r.status === 'done' && (r.reused ? '✓ Đã có sẵn (dùng lại)' : '✓ Đã lưu')}
                  {r.status === 'error' && 'Lỗi'}
                </span>
                {r.status !== 'uploading' && (
                  <button className="text-xs text-muted hover:text-fg" aria-label={`Bỏ ${r.file.name}`} onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}>✕</button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Btn tone="primary" disabled={waiting === 0} onClick={uploadAll}>{failed > 0 && waiting === failed ? `Thử lại ${failed} ảnh lỗi` : `Tải lên ${waiting} ảnh`}</Btn>
            <span className="font-mono text-xs text-muted">{done} thành công · {failed} lỗi</span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Import preview / confirm ────────────────────────────────────────────────

const ACTION_LABEL: Record<PlanItem['action'], string> = { create: 'Tạo mới', update: 'Cập nhật', skip: 'Bỏ qua', invalid: 'Lỗi' }

export function PlanPreview({ plan, policy }: { plan: ImportPlan; policy: DuplicatePolicy }) {
  const s = plan.summary
  const stat = (label: string, v: number, bad?: boolean) => (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-center">
      <p className={cx('font-mono text-xl font-bold', bad && v > 0 ? 'text-red-400' : 'text-fg')}>{v}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stat('Tổng', s.total)}
        {stat('Hợp lệ', s.valid)}
        {stat('Lỗi', s.invalid, true)}
        {stat('Tạo mới', s.create)}
        {stat('Cập nhật', s.update)}
        {stat('Trùng', s.duplicates)}
      </div>
      <p className="text-xs text-muted">
        Chính sách trùng: <strong className="text-fg">{policy === 'skip' ? 'Bỏ qua (giữ bản cũ)' : policy === 'update' ? 'Cập nhật bản cũ' : 'Tạo bản ghi mới'}</strong>
        {s.invalid > 0 && <> · <span className="text-red-400">{s.invalid} dòng lỗi sẽ KHÔNG được nhập</span></>}
        {s.unusedFiles.length > 0 && <> · Ảnh chưa dùng: {s.unusedFiles.join(', ')}</>}
      </p>
      <ul className="max-h-[28rem] space-y-1.5 overflow-auto">
        {plan.items.map((it) => (
          <li key={`${it.index}-${it.where}`} className={cx('rounded-xl border bg-surface px-3 py-2 text-sm', it.action === 'invalid' ? 'border-red-400/40' : 'border-border')}>
            <div className="flex items-center gap-2">
              {(it.stagedFile?.imageUrl || it.record?.imageUrl) && <ImageProbe url={it.stagedFile?.imageUrl ?? it.record?.imageUrl ?? ''} className="h-10 w-10" />}
              <span className="min-w-0 flex-1 truncate text-fg">{it.record ? (it.record.kind === 'memeAsset' ? it.record.title : it.record.text) : '—'}</span>
              <span className="font-mono text-[11px] text-muted">{it.where}</span>
              <span className={cx('rounded-full border px-2 py-0.5 text-[10px]', it.action === 'invalid' ? 'border-red-400/50 text-red-400' : it.action === 'skip' ? 'border-border text-muted' : 'border-accent/50 text-accent-soft')}>
                {ACTION_LABEL[it.action]}{it.match ? ` · trùng ${it.match === 'id' ? 'ID' : 'nội dung'}` : ''}
              </span>
            </div>
            {it.errors.map((e, i) => <p key={i} className="mt-1 text-xs text-red-400">• {e.field ? <code>{it.where}.{e.field}</code> : null} {e.message}</p>)}
            {it.warnings.map((e, i) => <p key={i} className="mt-1 text-xs text-muted">⚠ {e.message}</p>)}
            {it.changes.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {it.changes.map((c) => <li key={c.field}><code>{c.field}</code>: <s>{c.from || '∅'}</s> → <span className="text-fg">{c.to || '∅'}</span></li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
