#!/usr/bin/env node
'use strict'

const http = require('http')
const https = require('https')
const readline = require('readline')
const { URL } = require('url')

function startProxy(target, port) {
  let targetUrl
  try {
    targetUrl = new URL(target)
  } catch {
    console.error('URL không hợp lệ:', target)
    askAndStart()
    return
  }

  const isHttps = targetUrl.protocol === 'https:'
  const lib = isHttps ? https : http

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Atlassian-Token')
    res.setHeader('Access-Control-Max-Age', '86400')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: targetUrl.host },
      rejectUnauthorized: false,
    }

    const proxyReq = lib.request(options, (proxyRes) => {
      const headers = {}
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (!k.toLowerCase().startsWith('access-control-')) headers[k] = v
      }
      res.writeHead(proxyRes.statusCode, headers)
      proxyRes.pipe(res)
    })

    proxyReq.on('error', (err) => {
      console.error('[error]', err.message)
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })

    req.pipe(proxyReq)
  })

  server.listen(port, '127.0.0.1', () => {
    console.log('')
    console.log('  ✓ Proxy đang chạy!')
    console.log('  Target : ' + target)
    console.log('  Port   : ' + port)
    console.log('')
    console.log('  → Trong Timeline app, set Host to:')
    console.log('    http://localhost:' + port)
    console.log('')
    console.log('  Nhấn Ctrl+C để dừng.')
    console.log('')
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('  Port ' + port + ' đang bị chiếm. Thử port khác...')
      startProxy(target, port + 1)
    } else {
      console.error('  Server error:', err.message)
    }
  })
}

function askAndStart() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log('='.repeat(52))
  console.log('  Jira CORS Proxy')
  console.log('='.repeat(52))
  console.log('')

  const savedTargets = []

  rl.question('  Jira URL (vd: https://jira.company.com): ', (target) => {
    const t = target.trim()
    if (!t) { console.log('  Cần nhập URL.'); rl.close(); askAndStart(); return }

    rl.question('  Port [8765]: ', (portStr) => {
      const port = parseInt(portStr.trim() || '8765', 10)
      rl.close()
      console.log('')
      console.log('  Đang khởi động...')
      startProxy(t, port)
    })
  })
}

// Entry point
const argTarget = process.argv[2]
const argPort = parseInt(process.argv[3] || '8765', 10)

if (argTarget) {
  startProxy(argTarget, argPort)
} else {
  askAndStart()
}
