#!/usr/bin/env node
// jira-proxy.js — Local CORS proxy for Jira (Mac / Linux / Windows)
//
// Usage:
//   node jira-proxy.js --target https://jira.company.com --token YOUR_PAT
//   node jira-proxy.js --target https://jira.company.com --token YOUR_PAT --port 8765
//
// Or via env vars:
//   PROXY_TARGET=https://jira.company.com PROXY_TOKEN=xxx node jira-proxy.js

'use strict'
const http  = require('http')
const https = require('https')
const { URL } = require('url')

function getArg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const PORT   = parseInt(getArg('--port') || process.env.PROXY_PORT  || '8765', 10)
const TOKEN  = getArg('--token')  || process.env.PROXY_TOKEN  || ''
const TARGET = (getArg('--target') || process.env.PROXY_TARGET || '').replace(/\/$/, '')

if (!TOKEN)  { console.error('Error: --token is required (Personal Access Token)'); process.exit(1) }
if (!TARGET) { console.error('Error: --target is required (Jira base URL, e.g. https://jira.company.com)'); process.exit(1) }

let target
try { target = new URL(TARGET) } catch { console.error('Error: invalid --target URL'); process.exit(1) }

const STRIP = new Set([
  'origin', 'referer',
  'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user',
  'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
  'user-agent', 'connection', 'host',
])

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

  const proto  = target.protocol === 'https:' ? https : http
  const proxy  = proto.request(options, proxyRes => {
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
  console.log(`✓ jira-proxy listening on http://127.0.0.1:${PORT}`)
  console.log(`  → forwarding to ${TARGET}`)
  console.log('  Press Ctrl+C to stop.\n')
})
