// Multi-browser smoke test for Meme Party: 1 Host + 5 players + 1 shared screen.
// Usage: BASE=http://localhost:3100 SHOTS=/path/to/dir node e2e/meme-party.mjs
// Server must run with MEME_PARTY_STORE=memory and MEME_ADMIN_PASSWORD=e2e-pass.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const SHOTS = process.env.SHOTS ?? './e2e-shots'
const PASSWORD = process.env.MEME_ADMIN_PASSWORD ?? 'e2e-pass'
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch()
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const log = (...a) => console.log('•', ...a)
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
const fail = (msg) => {
  throw new Error(msg)
}

async function newPage(opts) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
  return page
}
const click = (page, text, exact = false) => page.getByRole('button', { name: text, exact }).first().click()
const waitText = (page, text, timeout = 15000) => page.getByText(text, { exact: false }).first().waitFor({ timeout })

// ── Room + players ───────────────────────────────────────────────────────────
const host = await newPage({ viewport: { width: 1100, height: 900 } })
await host.goto(`${BASE}/tools/meme-party`)
await host.getByLabel('Tên Host').fill('Chị Host')
await click(host, 'Tạo phòng mới')
await host.waitForURL(/host\?code=\d{6}/)
const code = new URL(host.url()).searchParams.get('code')
log('room', code)

// The Host's browser can also open the player link: it must get the join form, not the Host session.
const sameBrowser = await host.context().newPage()
await sameBrowser.goto(`${BASE}/tools/meme-party/play?code=${code}`)
await waitText(sameBrowser, `Vào phòng ${code}`)
await sameBrowser.close()
await host.reload()
await waitText(host, 'Mã phòng')

const screen = await newPage({ viewport: { width: 1920, height: 1080 } })
await screen.goto(`${BASE}/tools/meme-party/screen?code=${code}`)

const names = ['Mai', 'Bình', 'Cường', 'Dung', 'Em']
const players = []
for (const name of names) {
  const p = await newPage(mobile)
  await p.goto(`${BASE}/tools/meme-party/play?code=${code}`)
  await p.getByLabel('Tên hiển thị').fill(name)
  await click(p, 'Vào chơi')
  await waitText(p, 'Đang chờ Host bắt đầu')
  players.push(p)
}
await waitText(host, 'Người chơi (5/12)')
await waitText(screen, '5/12 người chơi')
await shot(host, '01-host-lobby')
await shot(players[0], '02-player-lobby')
await shot(screen, '03-screen-lobby')

// ── Round 1 through the UI (screenshots) ─────────────────────────────────────
await click(host, 'Bắt đầu ván')
await waitText(players[0], 'Đọc đề nhé')
await shot(players[0], '04-player-briefing')
await shot(screen, '05-screen-briefing')

await click(host, 'Mở nhận bài')
for (const p of players) await waitText(p, 'Gửi bài')
await shot(players[0], '06-player-hand')
for (const p of players) {
  await p.locator('button[aria-pressed]').first().click()
  await click(p, 'Gửi bài')
  await waitText(p, 'Đã gửi')
}
await shot(players[0], '07-player-submitted')
await waitText(host, '5/5')
await shot(screen, '08-screen-submission')

await click(host, 'Đóng nhận bài')
await waitText(host, 'Duyệt ẩn danh')
await click(host, 'Loại')
await shot(host, '09-host-review')
await click(host, 'Duyệt', true)
await click(host, 'Duyệt nốt')
await click(host, 'Mở Meme Showcase')
await waitText(screen, '1 / 5')
await shot(screen, '10-screen-showcase')
await click(host, 'Sau')
await waitText(screen, '2 / 5')
await waitText(players[1], 'Trình chiếu 2 / 5')
await shot(host, '11-host-showcase')
await shot(players[1], '12-player-showcase')

await click(host, 'Kết thúc → Bình chọn')
for (const p of players) await waitText(p, 'Chọn bài hài nhất')
for (const p of players) {
  await p.locator('button[aria-pressed]:not([disabled])').first().click()
  if (p === players[0]) await shot(p, '13-player-voting-confirm')
  await click(p, 'Chốt bình chọn')
  await waitText(p, 'Đã chốt bình chọn')
}
await shot(players[0], '14-player-voted')
await shot(screen, '15-screen-voting')
await waitText(host, '5/5')
await shot(host, '16-host-voting')
await click(host, 'Đóng bình chọn')
await click(host, 'Công bố kết quả')
await waitText(screen, 'điểm')
await shot(screen, '17-screen-results')
await shot(players[2], '18-player-results')
await shot(host, '19-host-results')
await click(host, 'Kết thúc vòng')
await waitText(players[0], 'Bảng điểm')
await shot(screen, '20-screen-round-end')
await shot(players[0], '21-player-round-end')

// ── Rounds 2-10 by sending commands directly from each page's stored session ──
const cmd = (page, command) =>
  page.evaluate(async ({ code, command }) => {
    const s = JSON.parse(localStorage.getItem(`wv-meme-party-host-${code}`) ?? localStorage.getItem(`wv-meme-party-${code}`))
    const r = await fetch(`/api/meme-party/rooms/${code}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mp-token': s.token },
      body: JSON.stringify({ cmdId: crypto.randomUUID(), command }),
    })
    return r.json()
  }, { code, command })
const view = (page) =>
  page.evaluate(async (code) => {
    const s = JSON.parse(localStorage.getItem(`wv-meme-party-host-${code}`) ?? localStorage.getItem(`wv-meme-party-${code}`))
    const r = await fetch(`/api/meme-party/rooms/${code}/state`, { headers: { 'x-mp-token': s.token } })
    return (await r.json()).result.view
  }, code)

const modesSeen = new Set()
let v = await view(host)
await click(host, 'Sang vòng 2')
for (let round = 2; round <= 10; round++) {
  await cmd(host, { type: 'OPEN_SUBMISSION' })
  v = await view(players[0])
  modesSeen.add(v.round.mode)
  for (const p of players) {
    const mine = await view(p)
    await cmd(p, { type: 'SUBMIT', optionId: mine.myHand[0].id })
  }
  if (round === 2 || (v.round.mode === 'caption' && !modesSeen.has('shot-caption'))) {
    await players[0].waitForTimeout(1800)
    await shot(players[0], `22-player-hand-${v.round.mode}`)
    if (v.round.mode === 'caption') modesSeen.add('shot-caption')
  }
  await cmd(host, { type: 'CLOSE_SUBMISSION' })
  await cmd(host, { type: 'APPROVE_ALL_PENDING' })
  await cmd(host, { type: 'SKIP_SHOWCASE' })
  for (const p of players) {
    const mine = await view(p)
    const target = mine.round.submissions.find((s) => !s.mine)
    await cmd(p, { type: 'VOTE', submissionId: target.id })
  }
  if (v.round.special === 'chaos') {
    await screen.waitForTimeout(1800)
    await shot(screen, '23-screen-chaos-voting')
  }
  await cmd(host, { type: 'CLOSE_VOTING' })
  await cmd(host, { type: 'PUBLISH_RESULTS' })
  const pub = await view(host)
  if (pub.round.special === 'award') {
    const first = pub.round.result.tallies[0]
    await cmd(host, { type: 'SET_AWARD', submissionId: first.submissionId, title: 'Meme đồng cảm nhất' })
  }
  await cmd(host, { type: 'FINISH_ROUND' })
  await cmd(host, { type: 'NEXT_ROUND' })
}
await waitText(screen, 'Kết quả chung cuộc')
await screen.waitForTimeout(1800)
await shot(screen, '24-screen-final')
await shot(players[0], '25-player-final')
const finalView = await view(host)
if (finalView.phase !== 'GAME_FINISHED') fail('expected GAME_FINISHED, got ' + finalView.phase)
log('modes seen over match:', [...modesSeen].filter((m) => !m.startsWith('shot')).join(', '))
log('final scoreboard:', finalView.scoreboard.map((r) => `${r.name}:${r.points}`).join(' '))

// ── Library management ───────────────────────────────────────────────────────
const admin = await newPage({ viewport: { width: 1280, height: 900 } })
await admin.goto(`${BASE}/tools/meme-party/library`)
await admin.getByLabel('Mật khẩu quản trị').fill(PASSWORD)
await click(admin, 'Đăng nhập')
await waitText(admin, '＋ Thêm mới')
await shot(admin, '26-library-empty')
await click(admin, '＋ Thêm mới')
const form = admin.getByRole('form', { name: 'Biểu mẫu bản ghi' })
await form.locator('select').first().selectOption('captionOption')
await form.locator('textarea').first().fill('Tôi ổn. (Không ổn)')
await form.getByRole('button', { name: 'Tạo', exact: true }).click()
await waitText(admin, 'Tôi ổn. (Không ổn)')
await shot(admin, '27-library-list')

await click(admin, '📥 Import CSV / JSON')
const csv = 'contentType,gameMode,prompt,caption,category,tags\r\ngamePrompt,meme,"Khi sếp bảo ""họp nhanh"", ừ 2 tiếng",,office,work|meeting\r\ncaptionOption,,,Tôi ổn. (Không ổn),general,mood\r\ncaptionOption,,,,general,\r\ngamePrompt,nope,Thiếu chế độ,,office,\r\n'
writeFileSync(`${SHOTS}/sample.csv`, csv)
await admin.locator('input[type=file][accept*=csv]').setInputFiles(`${SHOTS}/sample.csv`)
await click(admin, 'Xem trước')
await waitText(admin, 'Xem trước & xác nhận')
await shot(admin, '28-import-preview')
await click(admin, 'Xác nhận nhập')
await waitText(admin, 'Hoàn tất')
await shot(admin, '29-import-result')

await click(admin, '🗂️ Lịch sử import')
await waitText(admin, 'sample.csv')
await shot(admin, '30-import-history')
log('done')
await browser.close()
