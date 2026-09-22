import http from 'http'
import https from 'https'
import { URL } from 'url'
import { IncomingMessage } from 'http'

export interface ProxyConfig {
  target: string
  token: string
  port: number
}

// Headers that reveal browser identity — stripped when token mode is active
const BROWSER_HEADERS = new Set([
  'origin', 'referer',
  'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user',
  'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
  'user-agent', 'connection',
])

let server: http.Server | null = null
let activeConfig: ProxyConfig | null = null
let activePort = 0

export function isRunning(): boolean {
  return server !== null && server.listening
}

export function getConfig(): ProxyConfig | null {
  if (!activeConfig) return null
  return { ...activeConfig, port: activePort }
}

// Returns the actual port bound (may differ from config.port if auto-incremented)
export function startServer(config: ProxyConfig): Promise<number> {
  return new Promise((resolve, reject) => {
    const doStart = (port: number, attempts: number) => {
      let target: URL
      try {
        target = new URL(config.target.replace(/\/$/, ''))
      } catch {
        return reject(new Error('URL Jira không hợp lệ'))
      }

      const srv = http.createServer((req, res) => {
        // Reflect exact Origin for Chrome 130+ Private Network Access (PNA) compliance
        const origin = req.headers['origin'] ?? '*'
        const corsHeaders: Record<string, string> = {
          'Access-Control-Allow-Origin': String(origin),
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Atlassian-Token',
          'Access-Control-Allow-Private-Network': 'true',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        }

        if (req.method === 'OPTIONS') {
          res.writeHead(204, corsHeaders)
          res.end()
          return
        }

        if (req.url === '/health') {
          res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'ok', port, target: config.target }))
          return
        }

        const fwdHeaders: Record<string, string | string[]> = {}

        if (config.token) {
          // Token mode: strip browser fingerprint headers, inject Bearer
          for (const [k, v] of Object.entries(req.headers)) {
            if (!BROWSER_HEADERS.has(k.toLowerCase()) && k !== 'host' && v !== undefined) {
              fwdHeaders[k] = v as string | string[]
            }
          }
          fwdHeaders['Authorization'] = `Bearer ${config.token}`
          if (!fwdHeaders['Content-Type'] && req.method !== 'GET' && req.method !== 'HEAD') {
            fwdHeaders['Content-Type'] = 'application/json'
          }
        } else {
          // Passthrough mode: copy all headers, fix host only
          for (const [k, v] of Object.entries(req.headers)) {
            if (k !== 'host' && v !== undefined) {
              fwdHeaders[k] = v as string | string[]
            }
          }
        }
        fwdHeaders['Host'] = target.hostname
        // Bypass Jira CSRF check for write operations (required for PUT/POST/DELETE with Bearer/PAT auth)
        fwdHeaders['X-Atlassian-Token'] = 'no-check'

        const options: https.RequestOptions = {
          hostname: target.hostname,
          port: target.port || (target.protocol === 'https:' ? 443 : 80),
          path: req.url,
          method: req.method,
          headers: fwdHeaders,
          rejectUnauthorized: false,
        }

        const proto = target.protocol === 'https:' ? https : http
        const proxy = proto.request(options, (proxyRes: IncomingMessage) => {
          // Keep upstream response headers, replace all CORS headers with ours
          const outHeaders: Record<string, string | string[] | number | undefined> = {}
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (!k.toLowerCase().startsWith('access-control-')) {
              outHeaders[k] = v as string | string[]
            }
          }
          Object.assign(outHeaders, corsHeaders)
          delete outHeaders['transfer-encoding']
          res.writeHead(proxyRes.statusCode ?? 502, outHeaders)
          proxyRes.pipe(res)
        })

        proxy.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })

        req.pipe(proxy)
      })

      srv.listen(port, '127.0.0.1', () => {
        server = srv
        activeConfig = { ...config, port }
        activePort = port
        resolve(port)
      })

      srv.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempts < 5) {
          // Auto-increment port on conflict
          doStart(port + 1, attempts + 1)
        } else {
          reject(err)
        }
      })
    }

    if (server) {
      server.close(() => { server = null; activeConfig = null; activePort = 0; doStart(config.port, 0) })
    } else {
      doStart(config.port, 0)
    }
  })
}

export function stopServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) { resolve(); return }
    server.close((err) => {
      if (err) { reject(err); return }
      server = null
      activeConfig = null
      activePort = 0
      resolve()
    })
  })
}
