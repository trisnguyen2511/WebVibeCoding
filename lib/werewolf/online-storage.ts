const GM_DEVICE_KEY = 'wv-werewolf-gm-device-id'
const GM_SESSION_KEY = 'wv-werewolf-gm-online-session'
const PLAYER_DEVICE_KEY = 'wv-werewolf-player-device-id'
const PLAYER_SESSION_KEY = 'wv-werewolf-player-session'

export interface GmOnlineSession {
  roomId: string
  code: string
}

export interface PlayerSession {
  roomId: string
  code: string
  name: string
}

function getOrCreateId(key: string): string {
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export function getGmDeviceId(): string {
  return getOrCreateId(GM_DEVICE_KEY)
}

export function getPlayerDeviceId(): string {
  return getOrCreateId(PLAYER_DEVICE_KEY)
}

export function saveGmOnlineSession(session: GmOnlineSession): void {
  try {
    localStorage.setItem(GM_SESSION_KEY, JSON.stringify(session))
  } catch {
    // ignore
  }
}

export function loadGmOnlineSession(): GmOnlineSession | null {
  try {
    const raw = localStorage.getItem(GM_SESSION_KEY)
    return raw ? (JSON.parse(raw) as GmOnlineSession) : null
  } catch {
    return null
  }
}

export function clearGmOnlineSession(): void {
  try {
    localStorage.removeItem(GM_SESSION_KEY)
  } catch {
    // ignore
  }
}

export function savePlayerSession(session: PlayerSession): void {
  try {
    localStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify(session))
  } catch {
    // ignore
  }
}

export function loadPlayerSession(): PlayerSession | null {
  try {
    const raw = localStorage.getItem(PLAYER_SESSION_KEY)
    return raw ? (JSON.parse(raw) as PlayerSession) : null
  } catch {
    return null
  }
}

export function clearPlayerSession(): void {
  try {
    localStorage.removeItem(PLAYER_SESSION_KEY)
  } catch {
    // ignore
  }
}
