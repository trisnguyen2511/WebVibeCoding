/**
 * Jira Bridge — local CORS proxy for Jira Server / Data Center
 * Run: node jira-bridge.js
 * Then configure the Timeline tool to use http://localhost:3456
 */
const http  = require('http')
const https = require('https')

const PORT = 3456

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
  if (req.method !== 'POST')    { res.writeHead(404); res.end('Not found'); return }

  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    let parsed
    try { parsed = JSON.parse(body) } catch { res.writeHead(400); res.end('Bad JSON'); return }

    const { host, token, path, method = 'GET', data } = parsed
    if (!host || !token || !path) { res.writeHead(400); res.end('Missing fields'); return }

    const base = host.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
    let url
    try { url = new URL(`${base}/rest/api/2${path}`) } catch { res.writeHead(400); res.end('Bad host'); return }

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      rejectUnauthorized: false,
    }

    const payload = data ? JSON.stringify(data) : null
    const proto = url.protocol === 'https:' ? https : http

    const proxyReq = proto.request(options, proxyRes => {
      res.writeHead(proxyRes.statusCode ?? 200, { 'Content-Type': 'application/json' })
      proxyRes.pipe(res)
    })

    proxyReq.on('error', err => {
      res.writeHead(502)
      res.end(JSON.stringify({ error: err.message }))
    })

    if (payload) proxyReq.write(payload)
    proxyReq.end()
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✓ Jira Bridge running on http://localhost:${PORT}`)
  console.log('  Keep this window open while using the Timeline tool.')
  console.log('  Press Ctrl+C to stop.')
})
