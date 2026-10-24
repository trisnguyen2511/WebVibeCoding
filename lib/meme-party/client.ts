// Browser-side helpers for the Meme Party API: session storage, commands with retry.
import type { Command } from './types'

export interface StoredSession {
  code: string
  token: string
  memberId: string
  name: string
  roomId?: string
}

const key = (code: string) => `wv-meme-party-${code}`
const LAST = 'wv-meme-party-last'

export function loadSession(code: string | null): StoredSession | null {
  try {
    const raw = localStorage.getItem(key(code ?? localStorage.getItem(LAST) ?? ''))
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

export function saveSession(session: StoredSession) {
  try {
    localStorage.setItem(key(session.code), JSON.stringify(session))
    localStorage.setItem(LAST, session.code)
  } catch {
    // storage unavailable (private mode) — the session just won't survive a reload
  }
}

export function clearSession(code: string) {
  try {
    localStorage.removeItem(key(code))
  } catch {
    // ignore
  }
}

export interface ApiOk<T> {
  ok: true
  result: T
}
export interface ApiFail {
  ok: false
  error: string
  code: string
  status: number
}

export async function api<T>(path: string, init?: RequestInit & { token?: string | null }): Promise<ApiOk<T> | ApiFail> {
  try {
    const headers = new Headers(init?.headers)
    if (init?.token) headers.set('x-mp-token', init.token)
    if (init?.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json')
    const res = await fetch(path, { ...init, headers, cache: 'no-store' })
    const data = (await res.json().catch(() => null)) as { result: T | null; error: string | null; code?: string } | null
    if (!res.ok || !data || data.error) {
      return { ok: false, error: data?.error ?? `Lỗi ${res.status}`, code: data?.code ?? 'error', status: res.status }
    }
    return { ok: true, result: data.result as T }
  } catch {
    return { ok: false, error: 'Mất kết nối mạng', code: 'network', status: 0 }
  }
}

/** Sends a command with a fixed id; retries only on network failure so a repeat can never double-apply. */
export async function sendCommand(code: string, token: string, command: Command): Promise<ApiOk<{ stateVersion: number; duplicate: boolean }> | ApiFail> {
  const cmdId = crypto.randomUUID()
  let last: ApiFail = { ok: false, error: 'Mất kết nối mạng', code: 'network', status: 0 }
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await api<{ stateVersion: number; duplicate: boolean }>(`/api/meme-party/rooms/${code}/command`, {
      method: 'POST',
      token,
      body: JSON.stringify({ cmdId, command }),
    })
    if (res.ok || res.code !== 'network') return res
    last = res
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
  }
  return last
}
