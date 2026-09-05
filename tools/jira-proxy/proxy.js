#!/usr/bin/env node
'use strict'

const http = require('http')
const https = require('https')
const readline = require('readline')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')

// Config file sits next to the exe (or next to proxy.js when run via node)
// process.pkg is set by pkg bundler; use execPath to find files next to the exe
const EXE_DIR = process.pkg
  ? path.dirname(process.execPath)
  : path.dirname(process.argv[1])
const CONFIG_PATH = path.join(EXE_DIR, 'config.json')

// Self-signed cert for https://127.0.0.1 — allows fetch from HTTPS pages without PNA/mixed-content blocks
// Generated: openssl req -x509 -newkey rsa:2048 -days 3650 -nodes -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"
const CERT = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUbyhf2DHqWaOXpRnGUlZ19+EohlIwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDkwNTAyMDYwNVoXDTM2MDkw
MjAyMDYwNVowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEA1749G0P7j+By6FRBbmmOLpIaETswgHUGaQCM2rcVFwvY
JWvuoGqN0VJpPkYjbS72GK9u2BRfsKiSixsRMdBnkiom70uO7s7sI8+uEaOMpz0c
d+nEOuWMmbldg4NR/iIjHMmv/t/M0Ky+z03uRA0QXXy4vqWpggsFoX4HxUCzE24T
ZxpcGv4DhcqlRHpMn1ffd+Y4SsCGsG7OC619deDvq7BqdHB09BoUeCdyIJuHy1IA
4+FHNklqqNQ0Er9sVPpfSINupRQM/AI8EOxesnJ2FOFargaXfaOC1whPx/VU2zeM
lQbLCT87PCqNPzvtngxc3Z7CjaLHu6f+6Mjauy4L+wIDAQABo28wbTAdBgNVHQ4E
FgQUOBCzIKuFbxhkt9Ys9aGaGbP3aLYwHwYDVR0jBBgwFoAUOBCzIKuFbxhkt9Ys
9aGaGbP3aLYwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARhwR/AAABgglsb2Nh
bGhvc3QwDQYJKoZIhvcNAQELBQADggEBAGmUx77DsQiJ1v9TclB4FViPNU49VT35
CJLJCovh7C+HtJN12CIjZ2aB71dYc6lUwy36pcfTeTjKzv+T/BR+43ajqAuD1mDH
NrLYCoLXGxBAz8s+WUaXP8kt8OF1kpsdwblcP87klCxydPnCcLz3TtG6ucaXyhWK
tES0ivH8tvviDNIG4sUqJJO2jd6doiA0LFMah9zUGsHHb+n8ULQywLBlouYsKkeA
PkCM/JRUuhvUJd+5krljsgH/5thfmymNa8EvTD5SSN2mkEjhpPTHTjFkPfvp8b+A
XR9Ug7ToYpx3mfFT9Rx0dq3ZtgBtxUVckGs90QLdwhnznFBqGTbyWis=
-----END CERTIFICATE-----`

const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDXvj0bQ/uP4HLo
VEFuaY4ukhoROzCAdQZpAIzatxUXC9gla+6gao3RUmk+RiNtLvYYr27YFF+wqJKL
GxEx0GeSKibvS47uzuwjz64Ro4ynPRx36cQ65YyZuV2Dg1H+IiMcya/+38zQrL7P
Te5EDRBdfLi+pamCCwWhfgfFQLMTbhNnGlwa/gOFyqVEekyfV9935jhKwIawbs4L
rX114O+rsGp0cHT0GhR4J3Igm4fLUgDj4Uc2SWqo1DQSv2xU+l9Ig26lFAz8AjwQ
7F6ycnYU4VquBpd9o4LXCE/H9VTbN4yVBssJPzs8Ko0/O+2eDFzdnsKNose7p/7o
yNq7Lgv7AgMBAAECggEAGIbJlqBvaGdpWM0/VQiN//BfI0dZ17i2HljQKos2zBRu
Ia74BWensLzQNyKtI1v74UmMbec/C6vWYRcWKNYa+CxvmbO6z55ZjSaukNXJhze0
1VMPmmx/Q/ilT26t8xi5aivppK2XsL96v8GJzVW43w/vRsk5kI2lObtEseGNmi8r
VdtFALaZLPl2v7wvvwuBIbHKI+c9zp/nGWAHAZVcbx5WkNXJrslZI6dHp8FrIkTU
pYhAeod35EZGRJ7cZfnO183yDhguCIzK3WjGMhwSyiL2zahm0dlJHX4EWC9FgrwN
wl4BRf0K4W2tKmjsLXe//+xIun8TkgO+RIW6ROT6HQKBgQD8hw4qj3G0frq4ui7Y
AsaFhTku1Ltzqi69CodadQuVSgP+LWLeCKnP90FP2bUK9W2I04RTgI/rh0JyLdoS
t/M25zmQgVadcaEiW6Ye0Pv3yMHzGLgcHtgGpmbq2zAi4GP9XAGWpkOU+6vudx/I
I+X25YRDL95rv6138lo1UwsQNQKBgQDatbH3/hWDLwkPvD1IWQqi8G2UWunsL1Z2
Jq7cFIa8jJARzSpmXcVPuNcKCOC4DHmGq/L8K4NL1x9anHo/uolEvY1+RgX3K0+U
ZrAkzxaQOeLLorv9BQIeci9b0AHD8Prig6z/VbnwsbEpJZnMXjNWBSaNfu5liIST
kEwEruSRbwKBgQCctL6gwKVB6ca7baY2G/rPzq1+lzq/+yLH4um9w5ZtjSHPMKEC
wgOG75vTDnmflE/lscSTANvOwAAG1NdX+FjwgCqjtu9mAqaIqLD8vJkv2aAp1/Qg
Vy+daNPC+EP10KOcDOVbdE/J+ydlcv0A+O3y+djKzMDMwoTGQ1mhb6gU5QKBgQCY
hDhVXiSWVMiW5og92YonUk64NCYIhIJg5lzuMIo9FjCpmU9GD4I3NAkRgFtlPZ3J
okNSQu3Oh3ff8lr18hkjjKQNOLuUP+nA7VNMd/WeIh/cLeG2cjWmEa6g8g8pGvV5
3KVZcei2xtNqhEQaVl6qT/EwnyGUQH1jgi7g3S2blQKBgA9BsWk1qbaj2rYDU4jS
7Xmlf/Ms5wEBUoGwR+XpUKP128giuph+B/anza1HRv72WzoVErXaohoq5+aB07Re
PyXHpG3/GJjTZhNLlIpo4lg+KNuWfwd9KAxYhRU85gC6o9pU0cSHY5U6kB5xvJpP
yltHgFyY+eo87OGDHONJ/ix+
-----END PRIVATE KEY-----`

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

  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Atlassian-Token',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }

  const handler = (req, res) => {
    res.on('finish', () => {
      console.log(`[${req.method}] ${req.url} → ${res.statusCode}`)
    })

    // Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS)
      res.end()
      return
    }

    // Health check
    if (req.url === '/health') {
      const body = JSON.stringify({ status: 'ok', port: port })
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
      res.end(body)
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
      const headers = { ...CORS_HEADERS }
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (!k.toLowerCase().startsWith('access-control-')) headers[k] = v
      }
      res.writeHead(proxyRes.statusCode, headers)
      proxyRes.pipe(res)
    })

    proxyReq.on('error', (err) => {
      console.error('[error]', err.message)
      if (!res.headersSent) {
        res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })

    req.pipe(proxyReq)
  }

  const server = http.createServer(handler)

  server.listen(port, '0.0.0.0', () => {
    console.log('')
    console.log('  ✓ Proxy đang chạy!')
    console.log('  Target : ' + target)
    console.log('  Port   : ' + port)
    console.log('')
    console.log('  → Trong Timeline app, set port = ' + port)
    console.log('  → Kiểm tra: http://127.0.0.1:' + port + '/health')
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
  askAndStart(cfg)
}
