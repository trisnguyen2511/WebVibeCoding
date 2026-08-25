/**
 * Jira Bridge — local CORS proxy for Jira Server / Data Center
 * Usage: node jira-bridge.js
 */
const http  = require('http')
const https = require('https')
const PORT  = 3456

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
  if (req.method !== 'POST')    { res.writeHead(404); res.end('Not found'); return }

  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    let p; try { p = JSON.parse(body) } catch { res.writeHead(400); res.end('Bad JSON'); return }
    const { host, token, path, method = 'GET', data } = p
    if (!host || !token || !path) { res.writeHead(400); res.end('Missing fields'); return }

    const base = host.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
    let url; try { url = new URL(`${base}/rest/api/2${path}`) } catch { res.writeHead(400); res.end('Bad host'); return }

    const opts = {
      hostname: url.hostname, port: url.port || 443,
      path: url.pathname + url.search, method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      rejectUnauthorized: false,
    }

    const proto = url.protocol === 'https:' ? https : http
    const pr = proto.request(opts, r => { res.writeHead(r.statusCode ?? 200, { 'Content-Type': 'application/json' }); r.pipe(res) })
    pr.on('error', e => { res.writeHead(502); res.end(JSON.stringify({ error: e.message })) })
    if (data) pr.write(JSON.stringify(data))
    pr.end()
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Jira Bridge ready → http://localhost:${PORT}`)
  console.log('Keep this terminal open while using Timeline.')
})
