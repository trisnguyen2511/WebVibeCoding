#!/usr/bin/env node
'use strict'

const http = require('http')
const https = require('https')
const readline = require('readline')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')

// Config file sits next to the exe (or next to proxy.js when run via node)
const EXE_DIR = path.dirname(process.execPath !== process.argv[0] ? process.execPath : process.argv[1])
const CONFIG_PATH = path.join(EXE_DIR, 'config.json')

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8')
  } catch {
    // ignore write errors (read-only fs etc)
  }
}

function startProxy(cfg) {
  const { target, port = 8765 } = cfg

  let targetUrl
  try {
    targetUrl = new URL(target)
  } catch {
    console.error('  URL không hợp lệ:', target)
    console.error('  Kiểm tra lại file config.json')
    process.exit(1)
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
      console.error('  Port ' + port + ' đang bị chiếm. Thử port ' + (port + 1) + '...')
      startProxy({ ...cfg, port: port + 1 })
    } else {
      console.error('  Server error:', err.message)
    }
  })
}

function askAndStart(defaults = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log('='.repeat(54))
  console.log('  Jira CORS Proxy')
  console.log('='.repeat(54))
  console.log('')

  const defaultTarget = defaults.target || ''
  const defaultPort = defaults.port || 8765
  const targetPrompt = defaultTarget
    ? `  Jira URL [${defaultTarget}]: `
    : '  Jira URL (vd: https://jira.company.com): '

  rl.question(targetPrompt, (targetInput) => {
    const target = targetInput.trim() || defaultTarget
    if (!target) {
      console.log('  Cần nhập URL.')
      rl.close()
      askAndStart(defaults)
      return
    }

    rl.question(`  Port [${defaultPort}]: `, (portInput) => {
      const port = parseInt(portInput.trim() || String(defaultPort), 10)
      rl.close()

      const cfg = { target, port }
      saveConfig(cfg)
      console.log('')
      console.log('  Đã lưu vào config.json')
      console.log('  Đang khởi động...')
      startProxy(cfg)
    })
  })
}

// Entry point: CLI args > config.json > interactive prompt
const argTarget = process.argv[2]
const argPort = parseInt(process.argv[3] || '0', 10)

if (argTarget) {
  const cfg = loadConfig()
  startProxy({ ...cfg, target: argTarget, ...(argPort ? { port: argPort } : {}) })
} else {
  const cfg = loadConfig()
  if (cfg.target) {
    // Config exists — start directly, no prompt
    console.log('='.repeat(54))
    console.log('  Jira CORS Proxy')
    console.log('='.repeat(54))
    console.log('')
    console.log('  Dùng config.json:')
    console.log('  Target : ' + cfg.target)
    console.log('  Port   : ' + (cfg.port || 8765))
    console.log('')
    startProxy(cfg)
  } else {
    askAndStart()
  }
}
