/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/hash/route'
import { makeReq } from '../helpers/make-api-request'

describe('POST /api/hash', () => {
  it('returns sha256 of "hello"', async () => {
    const res = await POST(makeReq('/api/hash', { text: 'hello', algorithm: 'sha256' }) as unknown as NextRequest)
    const data = await res.json()
    expect(data.error).toBeNull()
    expect(data.result).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('returns sha1 of "hello"', async () => {
    const res = await POST(makeReq('/api/hash', { text: 'hello', algorithm: 'sha1' }) as unknown as NextRequest)
    const data = await res.json()
    expect(data.result).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
  })

  it('returns 400 for missing text', async () => {
    const res = await POST(makeReq('/api/hash', { algorithm: 'sha256' }) as unknown as NextRequest)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('text is required')
    expect(data.result).toBeNull()
  })

  it('returns 400 for invalid algorithm', async () => {
    const res = await POST(makeReq('/api/hash', { text: 'hello', algorithm: 'md2' }) as unknown as NextRequest)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('invalid algorithm')
  })
})
