import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto'
import type { Member, RoomState } from './types'

export const newToken = () => randomBytes(24).toString('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const newMemberId = () => randomUUID()

export function newRoomCode(): string {
  return String(randomInt(100000, 1000000))
}

/** Resolves a secret token to a room member. Kicked members never authenticate. */
export function memberForToken(state: RoomState, token: string | null | undefined): Member | null {
  if (!token || token.length > 128) return null
  const hash = Buffer.from(hashToken(token))
  for (const member of Object.values(state.members)) {
    const stored = Buffer.from(member.tokenHash)
    if (stored.length === hash.length && timingSafeEqual(stored, hash)) return member.kicked ? null : member
  }
  return null
}
