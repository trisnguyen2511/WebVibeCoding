import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
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

// ── Config persistence ─────────────────────────────────────────────────────────

interface SavedConfig {
  target: string
  port: string
}

function loadSavedConfig(): SavedConfig | null {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8')
    return JSON.parse(raw) as SavedConfig
  } catch {
    return null
  }
}

function writeSavedConfig(cfg: SavedConfig): void {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8')
  } catch { /* noop */ }
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
    // Fallback: tiny purple square generated from data URL
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
    width: 440,
    height: 520,
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

  // Hide to tray on close
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win?.hide()
    }
  })
}

// ── App lifecycle ───────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Hide from macOS dock — tray-only app
  if (process.platform === 'darwin') app.dock?.hide()

  createWindow()
  createTray()

  // Show window on first launch
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
    await startServer(config)
    refreshTray()
    return { ok: true }
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
