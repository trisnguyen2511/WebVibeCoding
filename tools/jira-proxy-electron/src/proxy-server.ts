import http from 'http'
import https from 'https'
import { URL } from 'url'
import { IncomingMessage } from 'http'

export interface ProxyConfig {
  target: string
  token: string
  port: number
}

const STRIP_HEADERS = new Set([
  'origin', 'referer',
  'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user',
  'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
  'user-agent', 'connection', 'host',
])

let server: http.Server | null = null
let activeConfig: ProxyConfig | null = null

export function isRunning(): boolean {
  return server !== null && server.listening
}

export function getConfig(): ProxyConfig | null {
  return activeConfig
}

export function startServer(config: ProxyConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const doStart = () => {
      let target: URL
      try {
        target = new URL(config.target.replace(/\/$/, ''))
      } catch {
        return reject(new Error('URL Jira không hợp lệ'))
      }

      const srv = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
        res.setHeader('Access-Control-Allow-Headers', '*')
        res.setHeader('Access-Control-Allow-Private-Network', 'true')

        if (req.method === 'OPTIONS') {
          res.writeHead(204)
          res.end()
          return
        }

        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'ok', port: config.port, target: config.target }))
          return
        }

        const fwdHeaders: Record<string, string | string[]> = {}
        for (const [k, v] of Object.entries(req.headers)) {
          if (!STRIP_HEADERS.has(k.toLowerCase()) && v !== undefined) {
            fwdHeaders[k] = v as string | string[]
          }
        }
        fwdHeaders['Authorization'] = `Bearer ${config.token}`
        fwdHeaders['Host'] = target.hostname
        if (!fwdHeaders['Content-Type'] && req.method !== 'GET' && req.method !== 'HEAD') {
          fwdHeaders['Content-Type'] = 'application/json'
        }

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
          const outHeaders = { ...proxyRes.headers, 'Access-Control-Allow-Origin': '*' }
          delete outHeaders['transfer-encoding']
          res.writeHead(proxyRes.statusCode ?? 502, outHeaders)
          proxyRes.pipe(res)
        })

        proxy.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })

        req.pipe(proxy)
      })

      srv.listen(config.port, '127.0.0.1', () => {
        server = srv
        activeConfig = config
        resolve()
      })

      srv.on('error', (err) => {
        reject(err)
      })
    }

    if (server) {
      server.close(() => { server = null; activeConfig = null; doStart() })
    } else {
      doStart()
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
      resolve()
    })
  })
}
