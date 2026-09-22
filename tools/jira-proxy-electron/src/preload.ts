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

  getVersion: () =>
    ipcRenderer.invoke('get-version'),

  openUrl: (url: string) =>
    ipcRenderer.invoke('open-url', url),
})
