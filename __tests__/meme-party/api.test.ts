/** @jest-environment node */
import { NextRequest } from 'next/server'
import { POST as createRoom } from '@/app/api/meme-party/rooms/route'
import { POST as joinRoom } from '@/app/api/meme-party/rooms/join/route'
import { GET as getState } from '@/app/api/meme-party/rooms/[code]/state/route'
import { POST as postCommand } from '@/app/api/meme-party/rooms/[code]/command/route'
import { POST as login } from '@/app/api/meme-party/admin/login/route'
import { GET as listItems, POST as createItemRoute } from '@/app/api/meme-party/admin/items/route'
import { PATCH as patchItem } from '@/app/api/meme-party/admin/items/[id]/route'
import { POST as bulk } from '@/app/api/meme-party/admin/items/bulk/route'
import { POST as upload } from '@/app/api/meme-party/admin/upload/route'
import { POST as preview } from '@/app/api/meme-party/admin/import/preview/route'
import { POST as commit } from '@/app/api/meme-party/admin/import/[id]/commit/route'
import { GET as report } from '@/app/api/meme-party/admin/import/[id]/report/route'
import { GET as template } from '@/app/api/meme-party/admin/templates/[name]/route'
import { GET as history } from '@/app/api/meme-party/admin/import/route'
import { MEME_ADMIN_COOKIE, issueAdminCookieValue } from '@/lib/meme-party/admin-auth'
import { resetRateLimits } from '@/lib/meme-party/rate-limit'

process.env.MEME_ADMIN_PASSWORD = 'secret-pw'
process.env.MEME_PARTY_STORE = 'memory'

const url = (p: string) => `http://localhost${p}`
const json = (p: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new NextRequest(url(p), { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const authed = () => ({ cookie: `${MEME_ADMIN_COOKIE}=${issueAdminCookieValue()}` })

beforeEach(() => resetRateLimits())

describe('game API', () => {
  it('creates, joins and drives a room through HTTP handlers', async () => {
    const created = (await (await createRoom(json('/api/meme-party/rooms', { hostName: 'Cô Host' }))).json()).result
    expect(created.code).toMatch(/^\d{6}$/)
    const tokens: string[] = []
    for (let i = 1; i <= 5; i++) {
      const res = await joinRoom(json('/api/meme-party/rooms/join', { code: created.code, name: `P${i}` }))
      tokens.push((await res.json()).result.token)
    }
    const ctx = { params: { code: created.code } }
    const start = await postCommand(json(`/api/meme-party/rooms/${created.code}/command`, { cmdId: 'a1', command: { type: 'START_MATCH' } }, { 'x-mp-token': created.hostToken }), ctx)
    expect(start.status).toBe(200)
    const state = await (await getState(new NextRequest(url(`/api/meme-party/rooms/${created.code}/state`), { headers: { 'x-mp-token': tokens[0] } }), ctx)).json()
    expect(state.result.view.phase).toBe('ROUND_BRIEFING')
    expect(state.result.view.me.name).toBe('P1')
    // public screen view needs no token
    const screen = await (await getState(new NextRequest(url(`/api/meme-party/rooms/${created.code}/state`)), ctx)).json()
    expect(screen.result.view.viewer).toBe('screen')
    expect(screen.result.view.myHand).toBeNull()
    // unchanged short-circuit
    const lite = await (await getState(new NextRequest(url(`/api/meme-party/rooms/${created.code}/state?since=${state.result.view.stateVersion}&lite=1`), { headers: { 'x-mp-token': tokens[0] } }), ctx)).json()
    expect(lite.result.unchanged).toBe(true)
  })

  it('rejects malformed and unknown commands and missing tokens', async () => {
    const created = (await (await createRoom(json('/api/meme-party/rooms', { hostName: 'H' }))).json()).result
    const ctx = { params: { code: created.code } }
    const send = (body: unknown, token?: string) => postCommand(json(`/x`, body, token ? { 'x-mp-token': token } : {}), ctx)
    expect((await send({ cmdId: 'x', command: { type: 'SET_SCORE', points: 99 } }, created.hostToken)).status).toBe(400)
    expect((await send({ cmdId: 'x', command: { type: 'KICK' } }, created.hostToken)).status).toBe(400)
    expect((await send({ command: { type: 'PAUSE' } }, created.hostToken)).status).toBe(400)
    expect((await send({ cmdId: 'y', command: { type: 'START_MATCH' } })).status).toBe(403)
    expect((await postCommand(new NextRequest(url('/x'), { method: 'POST', body: '{"cmdId":"' + 'z'.repeat(10_000) }), ctx)).status).toBe(400)
    expect((await joinRoom(json('/j', { code: 'abc', name: 'x' }))).status).toBe(400)
    expect((await joinRoom(json('/j', { code: '000000', name: 'x' }))).status).toBe(404)
  })

  it('rate-limits room creation', async () => {
    let last = 200
    for (let i = 0; i < 12; i++) last = (await createRoom(json('/r', { hostName: 'H' }))).status
    expect(last).toBe(429)
  })
})

describe('library management API', () => {
  it('denies every admin route without the admin cookie', async () => {
    const denied = async (p: Promise<Response>) => expect((await p).status).toBe(401)
    await denied(listItems(new NextRequest(url('/a'))))
    await denied(createItemRoute(json('/a', { contentType: 'captionOption', caption: 'x' })))
    await denied(patchItem(json('/a', {}, {}, 'PATCH'), { params: { id: 'x' } }))
    await denied(bulk(json('/a', { ids: [], action: 'delete', confirm: true })))
    await denied(upload(new NextRequest(url('/a'), { method: 'POST' })))
    await denied(preview(json('/a', {})))
    await denied(commit(json('/a', {}), { params: { id: 'x' } }))
    await denied(report(new NextRequest(url('/a')), { params: { id: 'x' } }))
    await denied(template(new NextRequest(url('/a')), { params: { name: 'template.csv' } }))
    await denied(history(new NextRequest(url('/a'))))
    // a forged cookie is not accepted either
    await denied(listItems(new NextRequest(url('/a'), { headers: { cookie: `${MEME_ADMIN_COOKIE}=forged` } })))
  })

  it('logs in with the right password only', async () => {
    expect((await login(json('/l', { password: 'nope' }))).status).toBe(401)
    const ok = await login(json('/l', { password: 'secret-pw' }))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly/i)
  })

  it('creates, searches, edits, deactivates and soft-deletes content', async () => {
    const created = await (await createItemRoute(json('/a', { contentType: 'captionOption', caption: 'Một caption thật hài', tags: 'vui|meme' }, authed()))).json()
    expect(created.result.text).toBe('Một caption thật hài')
    const bad = await createItemRoute(json('/a', { contentType: 'gamePrompt', gameMode: 'meme' }, authed()))
    expect(bad.status).toBe(400)
    expect((await bad.json()).issues.some((i: { field: string }) => i.field === 'prompt')).toBe(true)

    const search = await (await listItems(new NextRequest(url('/a?q=th%E1%BA%ADt&kind=captionOption'), { headers: authed() }))).json()
    expect(search.result.total).toBe(1)
    const edited = await (await patchItem(json('/a', { caption: 'Đã sửa' }, authed(), 'PATCH'), { params: { id: created.result.id } })).json()
    expect(edited.result.text).toBe('Đã sửa')
    const fail = await patchItem(json('/a', { caption: '' }, authed(), 'PATCH'), { params: { id: created.result.id } })
    expect(fail.status).toBe(400)
    await bulk(json('/a', { ids: [created.result.id], action: 'deactivate' }, authed()))
    const inactive = await (await listItems(new NextRequest(url('/a?status=inactive'), { headers: authed() }))).json()
    expect(inactive.result.total).toBe(1)
    expect((await bulk(json('/a', { ids: [created.result.id], action: 'delete' }, authed()))).status).toBe(400) // needs confirm
    await bulk(json('/a', { ids: [created.result.id], action: 'delete', confirm: true }, authed()))
    expect((await (await listItems(new NextRequest(url('/a?q=s%E1%BB%ADa'), { headers: authed() }))).json()).result.total).toBe(0)
  })

  it('uploads real images only, enforcing type, emptiness and size', async () => {
    const pngBytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 8, 0, 0, 0, 6]), Buffer.alloc(40)])
    const send = (bytes: Buffer, name: string) => {
      const form = new FormData()
      form.set('file', new File([new Uint8Array(bytes)], name, { type: 'image/png' }))
      return upload(new NextRequest(url('/u'), { method: 'POST', headers: authed(), body: form }))
    }
    const good = await (await send(pngBytes, '../../Mèo cười.png')).json()
    expect(good.result.file).toMatchObject({ mime: 'image/png', width: 8, height: 6, filename: 'Meo_cuoi.png' })
    const dup = await (await send(pngBytes, 'copy.png')).json()
    expect(dup.result.file.sha256).toBe(good.result.file.sha256)
    expect((await send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.png')).status).toBe(415)
    expect((await send(Buffer.alloc(0), 'e.png')).status).toBe(400)
    expect((await send(Buffer.concat([pngBytes, Buffer.alloc(5 * 1024 * 1024)]), 'big.png')).status).toBe(413)
  })

  it('runs preview → confirm → history → error report, and serves templates', async () => {
    const csv = 'contentType,caption,title\r\ncaptionOption,"Xin chào, ""bạn""",\r\ncaptionOption,,\r\n'
    const prev = await (await preview(json('/p', { kind: 'csv', filename: 'a.csv', text: csv, policy: 'skip' }, authed()))).json()
    expect(prev.result.plan.summary).toMatchObject({ total: 2, valid: 1, invalid: 1 })
    const done = await (await commit(json('/c', {}, authed()), { params: { id: prev.result.jobId } })).json()
    expect(done.result).toMatchObject({ status: 'completed_with_errors', created: 1, failed: 1 })
    const hist = await (await history(new NextRequest(url('/h'), { headers: authed() }))).json()
    expect(hist.result[0].id).toBe(prev.result.jobId)
    expect(hist.result[0].records).toBeUndefined()
    const rep = await report(new NextRequest(url('/r'), { headers: authed() }), { params: { id: prev.result.jobId } })
    expect(await rep.text()).toContain('caption')
    for (const name of ['template.csv', 'example.csv', 'template.json', 'example.json', 'guide.txt']) {
      expect((await template(new NextRequest(url('/t'), { headers: authed() }), { params: { name } })).status).toBe(200)
    }
    expect((await template(new NextRequest(url('/t'), { headers: authed() }), { params: { name: '../secret' } })).status).toBe(404)
  })

  it('rejects malformed JSON and oversized payloads at preview', async () => {
    const bad = await (await preview(json('/p', { kind: 'json', filename: 'a.json', text: '{oops', policy: 'skip' }, authed()))).json()
    expect(bad.result.plan.summary.valid).toBe(0)
    const job = await (await history(new NextRequest(url('/h'), { headers: authed() }))).json()
    expect(job.result.find((j: { id: string }) => j.id === bad.result.jobId).status).toBe('failed')
    expect(bad.result.plan.items[0].errors[0].message).toMatch(/JSON không hợp lệ/)
    const big = new NextRequest(url('/p'), { method: 'POST', headers: { ...authed(), 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(4 * 1024 * 1024) }) })
    expect((await preview(big)).status).toBe(400)
  })
})
