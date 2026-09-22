import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import { startServer, stopServer, isRunning, getConfig } from './proxy-server'

let tray: Tray | null = null
let win: BrowserWindow | null = null
let isQuitting = false

// ── Paths ─────────────────────────────────────────────────────────────────────

function rendererPath(file: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'renderer', file)
    : path.join(__dirname, '..', 'renderer', file)
}

function assetPath(file: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, file)
    : path.join(__dirname, '..', 'assets', file)
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

function defaultConfigPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'default-config.json')
    : path.join(__dirname, '..', 'default-config.json')
}

// ── Config persistence ─────────────────────────────────────────────────────────

interface SavedConfig {
  target: string
  port: string
}

function loadSavedConfig(): SavedConfig | null {
  // 1. User's saved config (userData)
  try {
    const raw = fs.readFileSync(configPath(), 'utf8')
    return JSON.parse(raw) as SavedConfig
  } catch { /* no saved config yet */ }

  // 2. Bundled default config (shipped with app)
  try {
    const raw = fs.readFileSync(defaultConfigPath(), 'utf8')
    return JSON.parse(raw) as SavedConfig
  } catch { /* no default config */ }

  return null
}

function writeSavedConfig(cfg: SavedConfig): void {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8')
  } catch { /* noop */ }
}

// ── Update check ───────────────────────────────────────────────────────────────

interface UpdateInfo {
  hasUpdate: boolean
  version: string
  url: string
}

function checkForUpdate(): Promise<UpdateInfo> {
  return new Promise((resolve) => {
    const noUpdate = { hasUpdate: false, version: '', url: '' }
    const options = {
      hostname: 'api.github.com',
      path: '/repos/trisnguyen2511/WebVibeCoding/releases/latest',
      headers: { 'User-Agent': 'jira-proxy-electron' },
      timeout: 8000,
    }
    const req = https.get(options, (res) => {
      let data = ''
      res.on('data', (c: string) => { data += c })
      res.on('end', () => {
        try {
          const release = JSON.parse(data) as { tag_name: string; html_url: string }
          const tag = release.tag_name ?? ''
          if (!tag.startsWith('jira-proxy-v')) { resolve(noUpdate); return }
          const newVer = tag.replace('jira-proxy-v', '')
          const curVer = app.getVersion()
          const hasUpdate = semverGt(newVer, curVer)
          resolve({ hasUpdate, version: newVer, url: release.html_url })
        } catch {
          resolve(noUpdate)
        }
      })
    })
    req.on('error', () => resolve(noUpdate))
    req.on('timeout', () => { req.destroy(); resolve(noUpdate) })
  })
}

function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}

// ── Tray ────────────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  const running = isRunning()
  const config = getConfig()
  const statusLabel = running
    ? `● Running — :${config?.port ?? 8765}`
    : '○ Stopped'

  return Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => { win?.show(); win?.focus() },
    },
    {
      label: 'Health Check',
      enabled: running,
      click: () => {
        if (config) shell.openExternal(`http://127.0.0.1:${config.port}/health`)
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.exit(0),
    },
  ])
}

function refreshTray() {
  if (!tray) return
  tray.setContextMenu(buildTrayMenu())
  const running = isRunning()
  tray.setToolTip(`Jira Proxy — ${running ? 'Running' : 'Stopped'}`)
}

function createTray() {
  const iconFile = assetPath(process.platform === 'darwin' ? 'icon-tray.png' : 'icon.png')
  let icon: Electron.NativeImage

  if (fs.existsSync(iconFile)) {
    icon = nativeImage.createFromPath(iconFile)
    if (process.platform === 'darwin') icon.setTemplateImage(true)
  } else {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
      'MElEQVQ4T2NkYGD4z8BQDwAEgAF/QEABwAAAABJRU5ErkJggg=='
    ).resize({ width: 16, height: 16 })
  }

  tray = new Tray(icon)
  tray.setToolTip('Jira Proxy — Stopped')
  tray.setContextMenu(buildTrayMenu())

  tray.on('click', () => {
    if (win?.isVisible()) { win.hide() } else { win?.show(); win?.focus() }
  })
  tray.on('double-click', () => { win?.show(); win?.focus() })
}

// ── Main window ────────────────────────────────────────────────────────────────

function createWindow() {
  const iconFile = assetPath('icon.png')

  win = new BrowserWindow({
    width: 460,
    height: 580,
    resizable: false,
    title: 'Jira Proxy',
    ...(fs.existsSync(iconFile) ? { icon: iconFile } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: '#08080E',
  })

  win.loadFile(rendererPath('index.html'))

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win?.hide()
    }
  })
}

// ── App lifecycle ───────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide()

  createWindow()
  createTray()

  win?.show()
})

app.on('window-all-closed', () => {
  // Stay in tray — do not quit
})

app.on('before-quit', async () => {
  isQuitting = true
  if (isRunning()) {
    try { await stopServer() } catch { /* noop */ }
  }
})

// ── IPC Handlers ────────────────────────────────────────────────────────────────

ipcMain.handle('start-proxy', async (_, config: { target: string; token: string; port: number }) => {
  try {
    const actualPort = await startServer(config)
    refreshTray()
    return { ok: true, port: actualPort }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
})

ipcMain.handle('stop-proxy', async () => {
  try {
    await stopServer()
    refreshTray()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
})

ipcMain.handle('get-status', () => {
  const config = getConfig()
  return { running: isRunning(), config }
})

ipcMain.handle('open-health', (_, port: number) => {
  shell.openExternal(`http://127.0.0.1:${port}/health`)
})

ipcMain.handle('save-config', (_, cfg: { target: string; port: string }) => {
  writeSavedConfig(cfg)
})

ipcMain.handle('load-config', () => {
  return loadSavedConfig()
})

ipcMain.handle('check-update', async () => {
  return checkForUpdate()
})

ipcMain.handle('get-version', () => {
  return app.getVersion()
})

ipcMain.handle('open-url', (_, url: string) => {
  shell.openExternal(url)
})
