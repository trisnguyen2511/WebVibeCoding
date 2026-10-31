import { clearSession, loadSession, saveSession } from '@/lib/meme-party/client'

const session = (token: string) => ({ code: '123456', token, memberId: 'm', name: 'n' })

describe('client sessions', () => {
  beforeEach(() => localStorage.clear())

  it('keeps Host and player sessions of the same room separate', () => {
    saveSession(session('host-token'), 'host')
    expect(loadSession('123456', 'player')).toBeNull()
    saveSession(session('player-token'), 'player')
    expect(loadSession('123456', 'host')?.token).toBe('host-token')
    expect(loadSession('123456', 'player')?.token).toBe('player-token')
    clearSession('123456', 'player')
    expect(loadSession('123456', 'player')).toBeNull()
    expect(loadSession('123456', 'host')?.token).toBe('host-token')
  })

  it('returns null without a code or with corrupt storage', () => {
    expect(loadSession(null)).toBeNull()
    localStorage.setItem('wv-meme-party-123456', '{oops')
    expect(loadSession('123456')).toBeNull()
  })
})
