#!/usr/bin/env node
'use strict'

const http = require('http')
const https = require('https')
const { URL } = require('url')

const TARGET = process.argv[2]
const PORT = parseInt(process.argv[3] || '8765', 10)

if (!TARGET) {
  console.log('='.repeat(50))
  console.log('  Jira CORS Proxy')
  console.log('='.repeat(50))
  console.log('')
  console.log('Usage:')
  console.log('  jira-proxy.exe <jira-url> [port]')
  console.log('')
  console.log('Examples:')
  console.log('  jira-proxy.exe https://jira.company.com')
  console.log('  jira-proxy.exe https://jira.company.com:8443 8765')
  console.log('')
  console.log('Then in Timeline app, set Host to:')
  console.log('  http://localhost:8765')
  console.log('')
  process.exit(1)
}

let targetUrl
try {
  targetUrl = new URL(TARGET)
} catch {
  console.error('Invalid URL:', TARGET)
  process.exit(1)
}

const isHttps = targetUrl.protocol === 'https:'
const lib = isHttps ? https : http

const server = http.createServer((req, res) => {
  // CORS headers for every response
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Atlassian-Token')
  res.setHeader('Access-Control-Max-Age', '86400')

  // Preflight
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
    headers: {
      ...req.headers,
      host: targetUrl.host,
    },
    rejectUnauthorized: false, // allow self-signed certs on internal servers
  }

  const proxyReq = lib.request(options, (proxyRes) => {
    const headers = {}
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      const lower = k.toLowerCase()
      if (!lower.startsWith('access-control-')) headers[k] = v
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

server.listen(PORT, '127.0.0.1', () => {
  console.log('='.repeat(50))
  console.log('  Jira CORS Proxy — READY')
  console.log('='.repeat(50))
  console.log('')
  console.log('  Proxy URL : http://localhost:' + PORT)
  console.log('  Target    : ' + TARGET)
  console.log('')
  console.log('  → Trong Timeline app, set Host to:')
  console.log('    http://localhost:' + PORT)
  console.log('')
  console.log('  Ctrl+C to stop')
  console.log('')
})
