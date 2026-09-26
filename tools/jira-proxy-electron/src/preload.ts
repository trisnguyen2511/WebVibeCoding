import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  startProxy: (config: { target: string; token: string; port: number }) =>
    ipcRenderer.invoke('start-proxy', config),

  stopProxy: () =>
    ipcRenderer.invoke('stop-proxy'),

  getStatus: () =>
    ipcRenderer.invoke('get-status'),

  openHealth: (port: number) =>
    ipcRenderer.invoke('open-health', port),

  saveConfig: (config: { target: string; port: string }) =>
    ipcRenderer.invoke('save-config', config),

  loadConfig: () =>
    ipcRenderer.invoke('load-config'),

  checkUpdate: () =>
    ipcRenderer.invoke('check-update'),

  downloadUpdate: () =>
    ipcRenderer.invoke('download-update'),

  installUpdate: () =>
    ipcRenderer.invoke('install-update'),

  getVersion: () =>
    ipcRenderer.invoke('get-version'),

  openUrl: (url: string) =>
    ipcRenderer.invoke('open-url', url),

  getAutoStart: () =>
    ipcRenderer.invoke('get-auto-start'),

  setAutoStart: (enable: boolean) =>
    ipcRenderer.invoke('set-auto-start', enable),

  onCheckingForUpdate: (cb: () => void) => {
    ipcRenderer.on('checking-for-update', () => cb())
  },

  onUpdateAvailable: (cb: (info: { version: string }) => void) => {
    ipcRenderer.on('update-available', (_, info) => cb(info))
  },

  onDownloadProgress: (cb: (progress: { percent: number }) => void) => {
    ipcRenderer.on('download-progress', (_, progress) => cb(progress))
  },

  onUpdateDownloaded: (cb: () => void) => {
    ipcRenderer.on('update-downloaded', () => cb())
  },

  onUpdateNotAvailable: (cb: () => void) => {
    ipcRenderer.on('update-not-available', () => cb())
  },

  onUpdateError: (cb: (err: { message: string }) => void) => {
    ipcRenderer.on('update-error', (_, err) => cb(err))
  },

  onProxyLog: (cb: (entry: { time: string; method: string; path: string; status: number; mode: string; auth: string; xat: boolean; body?: string }) => void) => {
    ipcRenderer.on('proxy-log', (_, entry) => cb(entry))
  },
})
