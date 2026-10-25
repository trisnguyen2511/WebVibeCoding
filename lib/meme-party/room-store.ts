import { getMemePartyDb } from './supabase-client'
import type { RoomState } from './types'

/** A persisted room plus the compare-and-swap revision used for atomic writes. */
export interface StoredRoom {
  state: RoomState
  rev: number
}

export interface RoomStore {
  create(state: RoomState): Promise<boolean>
  getById(id: string): Promise<StoredRoom | null>
  getByCode(code: string): Promise<StoredRoom | null>
  /** Writes only if the stored rev still equals `expectedRev`; returns false on conflict. */
  compareAndSet(id: string, expectedRev: number, next: RoomState): Promise<boolean>
  codeExists(code: string): Promise<boolean>
}

// ── In-memory store: tests and local development without Supabase ──────────

export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, StoredRoom>()

  async create(state: RoomState) {
    if (this.rooms.has(state.id)) return false
    this.rooms.set(state.id, { state: JSON.parse(JSON.stringify(state)) as RoomState, rev: 1 })
    return true
  }
  async getById(id: string) {
    const row = this.rooms.get(id)
    return row ? { state: JSON.parse(JSON.stringify(row.state)) as RoomState, rev: row.rev } : null
  }
  async getByCode(code: string) {
    for (const row of Array.from(this.rooms.values())) if (row.state.code === code) return this.getById(row.state.id)
    return null
  }
  async compareAndSet(id: string, expectedRev: number, next: RoomState) {
    const row = this.rooms.get(id)
    if (!row || row.rev !== expectedRev) return false
    this.rooms.set(id, { state: JSON.parse(JSON.stringify(next)) as RoomState, rev: expectedRev + 1 })
    return true
  }
  async codeExists(code: string) {
    return (await this.getByCode(code)) !== null
  }
}

// ── Supabase store: one JSONB row per room, guarded by a rev column ─────────

interface RoomRow {
  id: string
  code: string
  state: RoomState
  rev: number
}

export class SupabaseRoomStore implements RoomStore {
  private db = getMemePartyDb()

  async create(state: RoomState) {
    const { error } = await this.db.from('meme_party_rooms').insert({ id: state.id, code: state.code, state, rev: 1 })
    return !error
  }
  private async fetch(column: 'id' | 'code', value: string): Promise<StoredRoom | null> {
    const { data, error } = await this.db.from('meme_party_rooms').select('id, code, state, rev').eq(column, value).maybeSingle()
    if (error) throw new Error(error.message)
    const row = data as RoomRow | null
    return row ? { state: row.state, rev: row.rev } : null
  }
  getById(id: string) {
    return this.fetch('id', id)
  }
  getByCode(code: string) {
    return this.fetch('code', code)
  }
  async compareAndSet(id: string, expectedRev: number, next: RoomState) {
    const { data, error } = await this.db
      .from('meme_party_rooms')
      .update({ state: next, rev: expectedRev + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('rev', expectedRev)
      .select('id')
    if (error) throw new Error(error.message)
    return (data?.length ?? 0) === 1
  }
  async codeExists(code: string) {
    return (await this.getByCode(code)) !== null
  }
}

// ── Selection ───────────────────────────────────────────────────────────────

const globalStores = globalThis as unknown as { __memePartyMemoryRoomStore?: MemoryRoomStore }

export function hasSupabaseConfig(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
}

/** Supabase when configured; in-memory only outside production (or when forced). */
export function getRoomStore(): RoomStore {
  if (process.env.MEME_PARTY_STORE === 'memory' || (!hasSupabaseConfig() && process.env.NODE_ENV !== 'production')) {
    globalStores.__memePartyMemoryRoomStore ??= new MemoryRoomStore()
    return globalStores.__memePartyMemoryRoomStore
  }
  return new SupabaseRoomStore()
}
