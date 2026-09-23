import http from 'http'
import https from 'https'
import { URL } from 'url'
import { IncomingMessage } from 'http'
import { gunzip } from 'zlib'

export interface ProxyConfig {
  target: string
  token: string
  port: number
}

export interface ProxyLogEntry {
  time: string
  method: string
  path: string
  status: number
  mode: 'T' | 'P'   // T=token(proxy injects Bearer), P=passthrough
  auth: string       // first 30 chars of Authorization sent to Jira, or 'none'
  xat: boolean       // X-Atlassian-Token: no-check was sent
  body?: string      // decoded response body preview for 4xx/5xx
}

let logCallback: ((entry: ProxyLogEntry) => void) | null = null

export function setLogCallback(cb: (entry: ProxyLogEntry) => void): void {
  logCallback = cb
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
          // Bypass Jira CSRF check — required for PUT/POST/DELETE with Bearer/PAT auth
          fwdHeaders['X-Atlassian-Token'] = 'no-check'
        } else {
          // Passthrough mode: copy all headers, stripping browser fingerprint headers
          // (Origin/Referer/Sec-* from a cross-origin page can trigger Jira CSRF checks
          // even when X-Atlassian-Token: no-check is present in Jira 9.x+)
          for (const [k, v] of Object.entries(req.headers)) {
            if (!BROWSER_HEADERS.has(k.toLowerCase()) && k !== 'host' && v !== undefined) {
              fwdHeaders[k] = v as string | string[]
            }
          }
          // Ensure CSRF bypass header is always set for write operations
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            fwdHeaders['x-atlassian-token'] = 'no-check'
          }
        }
        // Use target.host (includes port if non-standard) so Jira's virtual-host routing works
        fwdHeaders['host'] = target.host

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

          const statusCode = proxyRes.statusCode ?? 502
          res.writeHead(statusCode, outHeaders)

          // Build log metadata now (fwdHeaders in scope)
          const now = new Date()
          const hh = String(now.getHours()).padStart(2, '0')
          const mm = String(now.getMinutes()).padStart(2, '0')
          const ss = String(now.getSeconds()).padStart(2, '0')
          const authVal = ((fwdHeaders['Authorization'] ?? fwdHeaders['authorization']) as string | undefined) ?? ''
          const auth = authVal ? authVal.substring(0, 30) + '…' : 'none'
          const xat = 'X-Atlassian-Token' in fwdHeaders || 'x-atlassian-token' in fwdHeaders
          const logMeta = {
            time: `${hh}:${mm}:${ss}`,
            method: req.method ?? 'GET',
            path: req.url ?? '/',
            status: statusCode,
            mode: config.token ? 'T' as const : 'P' as const,
            auth,
            xat,
          }

          const cb = logCallback
          if (cb && statusCode >= 400) {
            // For error responses: manually forward + capture body for log
            const isGzip = String(proxyRes.headers['content-encoding'] ?? '').includes('gzip')
            const rawChunks: Buffer[] = []
            proxyRes.on('data', (chunk: Buffer) => {
              rawChunks.push(chunk)
              res.write(chunk)
            })
            proxyRes.on('end', () => {
              res.end()
              const raw = Buffer.concat(rawChunks)
              const emit = (text: string) => cb({ ...logMeta, body: text.substring(0, 400) })
              if (isGzip && raw.length > 0) {
                gunzip(raw, (err, buf) => emit(err ? `[gzip err] ${err.message}` : buf.toString('utf8')))
              } else {
                emit(raw.toString('utf8'))
              }
            })
            proxyRes.on('error', () => { res.end(); cb({ ...logMeta, body: '[stream error]' }) })
          } else {
            proxyRes.pipe(res)
            logCallback?.(logMeta)
          }
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
