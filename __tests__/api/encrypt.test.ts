/**
 * @jest-environment node
 */
import { POST } from '@/app/api/encrypt/route'

const makeReq = (body: object) => new Request('http://localhost/api/encrypt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('POST /api/encrypt', () => {
  it('encrypts and decrypts round-trip', async () => {
    const encRes = await POST(makeReq({ action: 'encrypt', text: 'hello world', password: 'secret123' }) as any)
    const encData = await encRes.json()
    expect(encData.error).toBeNull()
    expect(typeof encData.result).toBe('string')

    const decRes = await POST(makeReq({ action: 'decrypt', text: encData.result, password: 'secret123' }) as any)
    const decData = await decRes.json()
    expect(decData.error).toBeNull()
    expect(decData.result).toBe('hello world')
  })

  it('returns error for wrong password on decrypt', async () => {
    const encRes = await POST(makeReq({ action: 'encrypt', text: 'secret', password: 'correct' }) as any)
    const { result } = await encRes.json()

    const decRes = await POST(makeReq({ action: 'decrypt', text: result, password: 'wrong' }) as any)
    const data = await decRes.json()
    expect(data.result).toBeNull()
    expect(data.error).toBe('decryption failed — wrong password or corrupted data')
  })

  it('returns 400 for missing text', async () => {
    const res = await POST(makeReq({ action: 'encrypt', password: 'x' }) as any)
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing password', async () => {
    const res = await POST(makeReq({ action: 'encrypt', text: 'x' }) as any)
    expect(res.status).toBe(400)
  })
})
