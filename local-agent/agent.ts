import { WebSocketServer, WebSocket } from 'ws'
import robot from 'robotjs'

const PORT = 9999

// Map DOM key names → robotjs key names
const KEY_MAP: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Escape: 'escape',
  Backspace: 'backspace',
  Tab: 'tab',
  ' ': 'space',
  Space: 'space',
  Shift: 'shift',
  Control: 'control',
  Alt: 'alt',
  Meta: 'command',
  F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4',
  F5: 'f5', F6: 'f6', F7: 'f7', F8: 'f8',
  F9: 'f9', F10: 'f10', F11: 'f11', F12: 'f12',
}

function mapKey(key: string): string {
  return KEY_MAP[key] ?? key.toLowerCase()
}

type InputMessage = {
  type: string
  key: string
  state: 'pressed' | 'released'
  peerId: string
}

const wss = new WebSocketServer({ port: PORT })
console.log(`[WebVibe Agent] Listening on ws://localhost:${PORT}`)
console.log('[WebVibe Agent] Open Game Controller in browser and switch to Local Agent mode')

wss.on('connection', (ws: WebSocket, req) => {
  const origin = req.headers.origin ?? 'unknown'
  console.log(`[WebVibe Agent] Browser connected from ${origin}`)

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as InputMessage
      if (msg.type !== 'button') return
      const key = mapKey(msg.key)
      robot.keyToggle(key, msg.state === 'pressed' ? 'down' : 'up')
      process.stdout.write(`  ${msg.state === 'pressed' ? '▼' : '▲'} ${key} (P:${msg.peerId.slice(0, 4)})\n`)
    } catch (err) {
      console.error('[WebVibe Agent] parse error:', err)
    }
  })

  ws.on('close', () => console.log('[WebVibe Agent] Browser disconnected'))
  ws.on('error', (err) => console.error('[WebVibe Agent] ws error:', err.message))
})

process.on('SIGINT', () => {
  console.log('\n[WebVibe Agent] Shutting down')
  wss.close()
  process.exit(0)
})
