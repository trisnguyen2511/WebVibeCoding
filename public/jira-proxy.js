#!/usr/bin/env node
// jira-proxy.js — Local CORS proxy for Jira (Mac / Linux)
// Đọc cấu hình từ config.json cùng thư mục, hoặc CLI args.
//
// Cách chạy:
//   1. Sửa config.json → chạy:  ./start.sh   (hoặc  bash start.sh)
//   2. Hoặc truyền thẳng args:
//        node jira-proxy.js --target https://jira.company.com --token YOUR_PAT

'use strict'
const http  = require('http')
const https = require('https')
const fs    = require('fs')
const path  = require('path')
const { URL } = require('url')

// ── Đọc config.json ────────────────────────────────────────────
let fileConfig = {}
try {
  const cfgPath = path.join(__dirname, 'config.json')
  fileConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
} catch { /* không có file hoặc parse lỗi → bỏ qua */ }

// ── CLI args ───────────────────────────────────────────────────
function getArg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

// Ưu tiên: CLI arg > config.json > env var > default
const PORT   = parseInt(getArg('--port')   || fileConfig.port   || process.env.PROXY_PORT  || '8765', 10)
const TOKEN  =          getArg('--token')  || fileConfig.token  || process.env.PROXY_TOKEN  || ''
const TARGET =         (getArg('--target') || fileConfig.target || process.env.PROXY_TARGET || '').replace(/\/$/, '')

// ── Validate ───────────────────────────────────────────────────
if (!TOKEN) {
  console.error('❌  Lỗi: thiếu token (PAT).')
  console.error('    → Điền "token" vào config.json, hoặc thêm --token YOUR_PAT')
  process.exit(1)
}
if (!TARGET) {
  console.error('❌  Lỗi: thiếu target URL Jira.')
  console.error('    → Điền "target" vào config.json, hoặc thêm --target https://jira.company.com')
  process.exit(1)
}

let target
try { target = new URL(TARGET) } catch {
  console.error('❌  Lỗi: target URL không hợp lệ:', TARGET)
  process.exit(1)
}

// ── Headers cần strip trước khi forward ───────────────────────
const STRIP = new Set([
  'origin', 'referer',
  'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user',
  'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
  'user-agent', 'connection', 'host',
])

// ── HTTP Server ────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', port: PORT, target: TARGET }))
    return
  }

  const fwdHeaders = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (!STRIP.has(k.toLowerCase())) fwdHeaders[k] = v
  }
  fwdHeaders['Authorization'] = `Bearer ${TOKEN}`
  fwdHeaders['Host']          = target.hostname
  if (!fwdHeaders['Content-Type'] && req.method !== 'GET' && req.method !== 'HEAD') {
    fwdHeaders['Content-Type'] = 'application/json'
  }

  const options = {
    hostname: target.hostname,
    port:     target.port || (target.protocol === 'https:' ? 443 : 80),
    path:     req.url,
    method:   req.method,
    headers:  fwdHeaders,
    rejectUnauthorized: false,
  }

  const proto = target.protocol === 'https:' ? https : http
  const proxy = proto.request(options, proxyRes => {
    const outHeaders = { ...proxyRes.headers, 'Access-Control-Allow-Origin': '*' }
    delete outHeaders['transfer-encoding']
    res.writeHead(proxyRes.statusCode || 502, outHeaders)
    proxyRes.pipe(res)
  })

  proxy.on('error', err => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
  })

  req.pipe(proxy)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('====================================================')
  console.log('  Jira CORS Proxy — Đang chạy!')
  console.log('====================================================')
  console.log(`  Target : ${TARGET}`)
  console.log(`  Port   : ${PORT}`)
  console.log(`  Health : http://127.0.0.1:${PORT}/health`)
  console.log('----------------------------------------------------')
  console.log('  Nhấn Ctrl+C để dừng.')
  console.log('====================================================\n')
})
