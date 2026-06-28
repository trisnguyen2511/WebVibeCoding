/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/encrypt/route'
import { makeReq } from '../helpers/make-api-request'

describe('POST /api/encrypt', () => {
  it('encrypts and decrypts round-trip', async () => {
    const encRes = await POST(makeReq('/api/encrypt', { action: 'encrypt', text: 'hello world', password: 'secret123' }) as unknown as NextRequest)
    const encData = await encRes.json()
    expect(encData.error).toBeNull()
    expect(typeof encData.result).toBe('string')

    const decRes = await POST(makeReq('/api/encrypt', { action: 'decrypt', text: encData.result, password: 'secret123' }) as unknown as NextRequest)
    const decData = await decRes.json()
    expect(decData.error).toBeNull()
    expect(decData.result).toBe('hello world')
  })

  it('returns error for wrong password on decrypt', async () => {
    const encRes = await POST(makeReq('/api/encrypt', { action: 'encrypt', text: 'secret', password: 'correct' }) as unknown as NextRequest)
    const { result } = await encRes.json()

    const decRes = await POST(makeReq('/api/encrypt', { action: 'decrypt', text: result, password: 'wrong' }) as unknown as NextRequest)
    const data = await decRes.json()
    expect(data.result).toBeNull()
    expect(data.error).toBe('decryption failed — wrong password or corrupted data')
  })

  it('returns 400 for missing text', async () => {
    const res = await POST(makeReq('/api/encrypt', { action: 'encrypt', password: 'x' }) as unknown as NextRequest)
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing password', async () => {
    const res = await POST(makeReq('/api/encrypt', { action: 'encrypt', text: 'x' }) as unknown as NextRequest)
    expect(res.status).toBe(400)
  })
})
