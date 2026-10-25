/** @jest-environment node */
import { parseCsv, toCsv } from '@/lib/meme-party/csv'
import { checkImageUrl } from '@/lib/meme-party/image-url'
import { inspectImage, sanitizeFilename } from '@/lib/meme-party/image-info'
import { recordsFromCsv, recordsFromJson } from '@/lib/meme-party/import-validate'
import { planImport } from '@/lib/meme-party/import-plan'
import { cancelImport, commitImport, errorReportCsv, previewImport, retryFailed } from '@/lib/meme-party/import-service'
import { csvExample, csvTemplate, jsonExample, jsonTemplate } from '@/lib/meme-party/import-templates'
import { buildPool, MemoryContentStore } from '@/lib/meme-party/content-store'
import type { StagedFile } from '@/lib/meme-party/library-types'

describe('csv parser', () => {
  it('handles quotes, commas, escaped quotes, multiline cells, CRLF and BOM', () => {
    const text = '\ufeffa,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n1,2,3\r\n'
    const r = parseCsv(text)
    expect(r.errors).toEqual([])
    expect(r.headers).toEqual(['a', 'b', 'c'])
    expect(r.rows[0].values).toEqual({ a: 'x, y', b: 'say "hi"', c: 'line1\nline2' })
    expect(r.rows[1].line).toBe(4)
  })
  it('keeps Vietnamese text intact', () => {
    const r = parseCsv('title,prompt\nMèo,"Khi sếp bảo ""họp nhanh"" – ừ, 5 phút"\n')
    expect(r.rows[0].values.prompt).toBe('Khi sếp bảo "họp nhanh" – ừ, 5 phút')
  })
  it('reports column mismatches and unterminated quotes with line numbers', () => {
    const r = parseCsv('a,b\n1,2,3\n"oops,4\n')
    expect(r.errors.map((e) => e.line)).toContain(2)
    expect(r.errors.some((e) => /nháy/.test(e.message))).toBe(true)
  })
  it('supports semicolon-delimited exports', () => {
    expect(parseCsv('a;b\n1;2\n').rows[0].values).toEqual({ a: '1', b: '2' })
  })
  it('round-trips through toCsv', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'q"r'], ['m\nn', 'z']])
    expect(parseCsv(csv).rows.map((r) => r.values)).toEqual([{ a: 'x,y', b: 'q"r' }, { a: 'm\nn', b: 'z' }])
  })
})

describe('image url + file checks', () => {
  it('accepts https image urls and rejects bad protocols and internal hosts', () => {
    expect(checkImageUrl('https://example.com/a.jpg').ok).toBe(true)
    expect(checkImageUrl('ftp://example.com/a.jpg').ok).toBe(false)
    expect(checkImageUrl('javascript:alert(1)').ok).toBe(false)
    expect(checkImageUrl('http://127.0.0.1/a.png').ok).toBe(false)
    expect(checkImageUrl('http://169.254.169.254/latest/meta-data').ok).toBe(false)
    expect(checkImageUrl('http://192.168.1.2/a.png').ok).toBe(false)
    expect(checkImageUrl('http://localhost/a.png').ok).toBe(false)
    expect(checkImageUrl('https://user:pw@example.com/a.png').ok).toBe(false)
    expect(checkImageUrl('not a url').ok).toBe(false)
  })
  it('warns when the url does not look like a direct image', () => {
    const r = checkImageUrl('https://example.com/page')
    expect(r.ok).toBe(true)
    expect(r.warning).toBeDefined()
  })
  it('detects real image types from magic bytes and ignores extensions', () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]), Buffer.from([0, 0, 1, 0, 0, 0, 0, 200])])
    expect(inspectImage(png)).toMatchObject({ mime: 'image/png', width: 256, height: 200 })
    expect(inspectImage(Buffer.from('<?xml version="1.0"?><svg onload="x"/>'))).toBeNull()
    expect(inspectImage(Buffer.from('GIF89a......................'))).toBeNull()
    expect(inspectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.mime).toBe('image/jpeg')
  })
  it('sanitises filenames and strips traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('C:\\x\\mèo cười!.PNG')).toBe('meo_cuoi_.PNG')
    expect(sanitizeFilename('...')).toBe('image')
  })
})

describe('record validation', () => {
  it('validates required fields per content type with located errors', () => {
    const src = recordsFromJson(
      JSON.stringify({
        version: 1,
        items: [
          { contentType: 'memeAsset', title: 'ok', imageUrl: 'https://e.com/a.jpg' },
          { contentType: 'memeAsset', imageUrl: 'ftp://e.com/a.jpg' },
          { contentType: 'gamePrompt', gameMode: 'nope', prompt: '' },
          { contentType: 'captionOption' },
          { contentType: 'weird' },
        ],
      }),
    )
    const plan = planImport(src, { existing: [], policy: 'skip' })
    expect(plan.summary).toMatchObject({ total: 5, valid: 1, invalid: 4, create: 1 })
    const fields = plan.items[1].errors.map((e) => e.field)
    expect(fields).toEqual(expect.arrayContaining(['title', 'imageUrl']))
    expect(plan.items[1].where).toBe('items[1]')
    expect(plan.items[2].errors.map((e) => e.field)).toEqual(expect.arrayContaining(['gameMode', 'prompt']))
    expect(plan.items[4].errors[0].field).toBe('contentType')
  })

  it('rejects malformed JSON, wrong versions, oversized payloads and non-arrays', () => {
    expect(recordsFromJson('{oops').errors[0].message).toMatch(/JSON không hợp lệ/)
    expect(recordsFromJson('{"version":2,"items":[]}').errors[0].where).toBe('version')
    expect(recordsFromJson('{"items":"x","version":1}').errors[0].where).toBe('items')
    expect(recordsFromJson('"str"').errors).toHaveLength(1)
    expect(recordsFromJson('x'.repeat(3 * 1024 * 1024)).errors[0].message).toMatch(/dung lượng/)
    expect(recordsFromCsv('x'.repeat(3 * 1024 * 1024)).errors[0].message).toMatch(/dung lượng/)
  })

  it('treats imported text as plain text (angle brackets stripped)', () => {
    const src = recordsFromJson(JSON.stringify([{ contentType: 'captionOption', caption: '<img src=x onerror=alert(1)>hello' }]))
    const plan = planImport(src, { existing: [], policy: 'skip' })
    expect(plan.items[0].record?.text).not.toContain('<')
  })

  it('accepts the shipped CSV and JSON templates and examples', () => {
    for (const src of [recordsFromCsv(csvTemplate()), recordsFromCsv(csvExample()), recordsFromJson(jsonTemplate()), recordsFromJson(jsonExample())]) {
      expect(src.errors).toEqual([])
      const file: StagedFile = { filename: 'meo-cuoi.png', imageUrl: '/f/1', storagePath: 'x', mime: 'image/png', width: 1, height: 1, sha256: 'a', size: 1 }
      const plan = planImport(src, { existing: [], policy: 'skip', files: [file] })
      expect(plan.summary.invalid).toBe(0)
      expect(plan.summary.total).toBe(5)
    }
  })
})

describe('import planning', () => {
  const sampleCsv = () => recordsFromCsv(csvTemplate())
  const file: StagedFile = { filename: 'meo-cuoi.png', imageUrl: '/f/1', storagePath: 'k', mime: 'image/png', width: 10, height: 10, sha256: 'sha-1', size: 100 }

  it('flags duplicate ids inside a file', () => {
    const src = recordsFromJson(JSON.stringify([
      { id: 'a', contentType: 'captionOption', caption: 'one' },
      { id: 'a', contentType: 'captionOption', caption: 'two' },
    ]))
    const plan = planImport(src, { existing: [], policy: 'skip' })
    expect(plan.items[1].action).toBe('invalid')
    expect(plan.items[1].errors[0].message).toMatch(/trùng trong file/)
  })

  it('flags content duplicates inside a file as skipped', () => {
    const src = recordsFromJson(JSON.stringify([
      { contentType: 'captionOption', caption: 'Giống Nhau' },
      { contentType: 'captionOption', caption: 'giống  nhau' },
    ]))
    expect(planImport(src, { existing: [], policy: 'update' }).items.map((i) => i.action)).toEqual(['create', 'skip'])
  })

  it('requires an image for every asset and rejects ambiguous file matches', () => {
    const noImage = recordsFromJson(JSON.stringify([{ contentType: 'memeAsset', title: 'x', filename: 'missing.png' }]))
    expect(planImport(noImage, { existing: [], policy: 'skip', files: [file] }).items[0].action).toBe('invalid')
    const ambiguous = recordsFromJson(JSON.stringify([{ contentType: 'memeAsset', title: 'x', filename: 'MEO-CUOI.png' }]))
    const twin = { ...file, imageUrl: '/f/2', sha256: 'sha-2' }
    const plan = planImport(ambiguous, { existing: [], policy: 'skip', files: [file, twin] })
    expect(plan.items[0].errors[0].message).toMatch(/trùng tên/)
  })

  it('matches images by filename or by the id naming convention and reports unused files', () => {
    const src = recordsFromJson(JSON.stringify([
      { id: 'asset_9', contentType: 'memeAsset', title: 'by id' },
      { contentType: 'memeAsset', title: 'by name', filename: 'meo-cuoi.png' },
    ]))
    const byId: StagedFile = { ...file, filename: 'asset_9.jpg', imageUrl: '/f/9', sha256: 's9' }
    const unused: StagedFile = { ...file, filename: 'unused.png', imageUrl: '/f/u', sha256: 'su' }
    const plan = planImport(src, { existing: [], policy: 'skip', files: [file, byId, unused] })
    expect(plan.items.map((i) => i.stagedFile?.filename)).toEqual(['asset_9.jpg', 'meo-cuoi.png'])
    expect(plan.summary.unusedFiles).toEqual(['unused.png'])
  })

  it('rejects a prompt that references an unknown asset', () => {
    const src = recordsFromJson(JSON.stringify([{ contentType: 'gamePrompt', gameMode: 'caption', prompt: 'x', imageRef: 'nope' }]))
    expect(planImport(src, { existing: [], policy: 'skip' }).items[0].errors[0].field).toBe('imageRef')
  })

  it('sample file plans cleanly', () => {
    const plan = planImport(sampleCsv(), { existing: [], policy: 'skip', files: [file] })
    expect(plan.summary).toMatchObject({ total: 5, create: 5, invalid: 0 })
  })
})

describe('import service (skip / update / create-new, retries, history)', () => {
  const caption = (id: string | undefined, text: string) => ({ ...(id ? { id } : {}), contentType: 'captionOption', caption: text })
  const json = (items: unknown[]) => JSON.stringify(items)

  async function importOnce(store: MemoryContentStore, items: unknown[], policy: 'skip' | 'update' | 'create_new') {
    const { job, plan } = await previewImport(store, { kind: 'json', filename: 'x.json', text: json(items), policy, createdBy: 'admin' })
    if (!job) throw new Error('no job')
    const done = await commitImport(store, job.id, 'admin')
    return { plan, job: done! }
  }

  it('previews without writing, then commits on confirmation', async () => {
    const store = new MemoryContentStore()
    const { job } = await previewImport(store, { kind: 'json', filename: 'x.json', text: json([caption('c1', 'Một')]), policy: 'skip', createdBy: 'admin' })
    expect((await store.all()).length).toBe(0)
    await commitImport(store, job!.id, 'admin')
    expect((await store.all()).map((i) => i.text)).toEqual(['Một'])
  })

  it('skip keeps the existing record untouched', async () => {
    const store = new MemoryContentStore()
    await importOnce(store, [caption('c1', 'Gốc')], 'skip')
    const { job } = await importOnce(store, [caption('c1', 'Mới')], 'skip')
    expect(job.skipped).toBe(1)
    expect((await store.all())[0].text).toBe('Gốc')
  })

  it('update shows changed fields and applies them', async () => {
    const store = new MemoryContentStore()
    await importOnce(store, [caption('c1', 'Gốc')], 'skip')
    const { plan, job } = await importOnce(store, [{ ...caption('c1', 'Mới'), category: 'moi' }], 'update')
    expect(plan.items[0].changes.map((c) => c.field)).toEqual(expect.arrayContaining(['text', 'category']))
    expect(job.updated).toBe(1)
    const all = await store.all()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ text: 'Mới', category: 'moi', externalId: 'c1' })
  })

  it('update with no changes is a skip', async () => {
    const store = new MemoryContentStore()
    await importOnce(store, [caption('c1', 'Gốc')], 'skip')
    const { job } = await importOnce(store, [caption('c1', 'Gốc')], 'update')
    expect(job.skipped).toBe(1)
  })

  it('create_new makes a second record without the clashing id', async () => {
    const store = new MemoryContentStore()
    await importOnce(store, [caption('c1', 'Gốc')], 'skip')
    const { job } = await importOnce(store, [caption('c1', 'Gốc')], 'create_new')
    expect(job.created).toBe(1)
    const all = await store.all()
    expect(all).toHaveLength(2)
    expect(all.filter((i) => i.externalId === 'c1')).toHaveLength(1)
  })

  it('detects likely duplicates without ids by content', async () => {
    const store = new MemoryContentStore()
    await importOnce(store, [caption(undefined, 'Giống nhau')], 'skip')
    const { plan } = await importOnce(store, [caption(undefined, 'GIỐNG  nhau')], 'skip')
    expect(plan.items[0]).toMatchObject({ action: 'skip', match: 'content' })
  })

  it('commits prompts referencing assets created in the same file', async () => {
    const store = new MemoryContentStore()
    await importOnce(
      store,
      [
        { id: 'p1', contentType: 'gamePrompt', gameMode: 'caption', prompt: 'Tình huống', imageRef: 'a1' },
        { id: 'a1', contentType: 'memeAsset', title: 'Ảnh', imageUrl: 'https://e.com/a.jpg' },
      ],
      'skip',
    )
    const all = await store.all()
    const asset = all.find((i) => i.kind === 'memeAsset')!
    expect(all.find((i) => i.kind === 'gamePrompt')!.assetId).toBe(asset.id)
  })

  it('committing the same job twice never duplicates records (idempotent)', async () => {
    const store = new MemoryContentStore()
    const { job } = await previewImport(store, { kind: 'json', filename: 'x.json', text: json([caption('c1', 'A'), caption('c2', 'B')]), policy: 'skip', createdBy: 'admin' })
    await Promise.all([commitImport(store, job!.id, 'admin'), commitImport(store, job!.id, 'admin')])
    await commitImport(store, job!.id, 'admin')
    expect((await store.all()).length).toBe(2)
  })

  it('partial failure is reported honestly and failed rows can be retried without duplicates', async () => {
    const store = new MemoryContentStore()
    const realInsert = store.insert.bind(store)
    let failFirst = true
    store.insert = async (rows) => {
      if (failFirst && rows[0].externalId === 'c2') {
        failFirst = false
        throw new Error('db hiccup')
      }
      return realInsert(rows)
    }
    const { job } = await previewImport(store, { kind: 'json', filename: 'x.json', text: json([caption('c1', 'A'), caption('c2', 'B'), { contentType: 'captionOption' }]), policy: 'skip', createdBy: 'admin' })
    const first = await commitImport(store, job!.id, 'admin')
    expect(first).toMatchObject({ status: 'completed_with_errors', created: 1, failed: 2, total: 3 })
    expect(errorReportCsv(first!)).toContain('db hiccup')
    const retried = await retryFailed(store, job!.id, 'admin')
    expect(retried).toMatchObject({ created: 2, failed: 1 })
    expect((await store.all()).map((i) => i.externalId).sort()).toEqual(['c1', 'c2'])
    await retryFailed(store, job!.id, 'admin')
    expect((await store.all()).length).toBe(2)
  })

  it('invalid rows are listed in history and the error report, never silently dropped', async () => {
    const store = new MemoryContentStore()
    const { job } = await importOnce(store, [caption('c1', 'ok'), { contentType: 'captionOption', caption: '' }], 'skip')
    expect(job.total).toBe(2)
    expect(job.failed).toBe(1)
    expect(errorReportCsv(job)).toContain('caption')
    expect((await store.listJobs(10))[0].id).toBe(job.id)
  })

  it('cancelling a pending job commits nothing', async () => {
    const store = new MemoryContentStore()
    const { job } = await previewImport(store, { kind: 'json', filename: 'x.json', text: json([caption('c1', 'A')]), policy: 'skip', createdBy: 'admin' })
    await cancelImport(store, job!.id)
    await commitImport(store, job!.id, 'admin')
    expect((await store.all()).length).toBe(0)
    expect((await store.getJob(job!.id))?.status).toBe('cancelled')
  })

  it('imports a metadata file together with matched images, reusing the physical image', async () => {
    const store = new MemoryContentStore()
    const file: StagedFile = { filename: 'meo.png', imageUrl: 'https://cdn/x/meo.png', storagePath: 'assets/sha.png', mime: 'image/png', width: 5, height: 5, sha256: 'sha', size: 5 }
    const { job } = await previewImport(store, { kind: 'combined', filename: 'x.json', text: json([{ id: 'a1', contentType: 'memeAsset', title: 'Mèo', filename: 'meo.png' }]), policy: 'skip', files: [file], createdBy: 'admin' })
    await commitImport(store, job!.id, 'admin')
    const asset = (await store.all())[0]
    expect(asset).toMatchObject({ imageUrl: file.imageUrl, sha256: 'sha', storagePath: 'assets/sha.png', originalFilename: 'meo.png' })
    expect((await store.findAssetBySha('sha'))?.id).toBe(asset.id)
  })
})

describe('library content and live games', () => {
  const asset = (n: number, over = {}) => ({ externalId: `a${n}`, kind: 'memeAsset' as const, title: `A${n}`, text: '', imageUrl: `https://e/${n}.jpg`, storagePath: null, originalFilename: null, mime: null, width: null, height: null, sha256: null, gameMode: null, modes: ['meme' as const, 'reaction' as const], assetId: null, category: 'g', tags: [], language: 'vi', status: 'active' as const, importKey: null, ...over })

  it('lists with search and filters, hides deleted rows', async () => {
    const store = new MemoryContentStore()
    const [a, b] = await store.insert([asset(1), asset(2, { category: 'x', tags: ['hot'], status: 'inactive' })])
    expect((await store.list({ q: 'a1' })).items.map((i) => i.id)).toEqual([a.id])
    expect((await store.list({ category: 'x' })).total).toBe(1)
    expect((await store.list({ tag: 'hot' })).items[0].id).toBe(b.id)
    expect((await store.list({ status: 'inactive' })).total).toBe(1)
    await store.softDelete([a.id])
    expect((await store.list({})).total).toBe(1)
  })

  it('only active, non-deleted content reaches the game pool', async () => {
    const store = new MemoryContentStore()
    const rows = await store.insert([asset(1), asset(2), asset(3), asset(4), asset(5, { status: 'inactive' })])
    await store.softDelete([rows[0].id])
    const pool = await store.getPool()
    const ids = pool.assets.map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining([rows[1].id, rows[2].id, rows[3].id]))
    expect(ids).not.toContain(rows[0].id)
    expect(ids).not.toContain(rows[4].id)
  })

  it('falls back to the starter pack per category and keeps games playable on an empty library', () => {
    const pool = buildPool([])
    expect(pool.prompts.length).toBeGreaterThanOrEqual(18)
    expect(pool.captions.length).toBeGreaterThanOrEqual(3)
    expect(pool.assets.length).toBeGreaterThanOrEqual(3)
  })

  it('MEME_PARTY_STARTER_CONTENT=false disables the starter fallback entirely', async () => {
    const { applyCommand } = await import('@/lib/meme-party/engine')
    const { lobby, makeCtx, nextCmdId } = await import('../helpers/meme-party')
    const prev = process.env.MEME_PARTY_STARTER_CONTENT
    try {
      for (const off of ['false', '0', 'OFF']) {
        process.env.MEME_PARTY_STARTER_CONTENT = off
        expect(buildPool([])).toEqual({ prompts: [], captions: [], assets: [] })
        const res = applyCommand(lobby(5), 'host', nextCmdId(), { type: 'START_MATCH' }, makeCtx({ content: buildPool([]) }))
        expect(!res.ok && res.error.code).toBe('not_enough_content')
      }
      process.env.MEME_PARTY_STARTER_CONTENT = 'true'
      expect(buildPool([]).prompts.length).toBeGreaterThan(0)
      delete process.env.MEME_PARTY_STARTER_CONTENT
      expect(buildPool([]).prompts.length).toBeGreaterThan(0)
    } finally {
      if (prev === undefined) delete process.env.MEME_PARTY_STARTER_CONTENT
      else process.env.MEME_PARTY_STARTER_CONTENT = prev
    }
  })

  it('editing or deleting library content does not alter a running round snapshot', async () => {
    const { applyCommand } = await import('@/lib/meme-party/engine')
    const { lobby, makeCtx, nextCmdId } = await import('../helpers/meme-party')
    const store = new MemoryContentStore()
    const rows = await store.insert([asset(1), asset(2), asset(3)])
    const ctx = makeCtx({ content: await store.getPool() })
    const res = applyCommand(lobby(5), 'host', nextCmdId(), { type: 'START_MATCH' }, ctx)
    if (!res.ok) throw new Error(res.error.message)
    const before = JSON.stringify(res.state.rounds[0])
    await store.update(rows[0].id, { title: 'Changed', imageUrl: 'https://evil/x.jpg' })
    await store.softDelete([rows[1].id])
    expect(JSON.stringify(res.state.rounds[0])).toBe(before)
  })
})
