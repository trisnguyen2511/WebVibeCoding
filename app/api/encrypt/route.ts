import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

const ALGORITHM = 'aes-256-cbc'
const SALT = 'webvibe-static-salt'

function deriveKey(password: string): Buffer {
  return scryptSync(password, SALT, 32)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, text, password } = body

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ result: null, error: 'text is required' }, { status: 400 })
  }
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ result: null, error: 'password is required' }, { status: 400 })
  }

  const key = deriveKey(password)

  if (action === 'encrypt') {
    const iv = randomBytes(16)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    const result = `${iv.toString('hex')}:${encrypted.toString('hex')}`
    return NextResponse.json({ result, error: null })
  }

  if (action === 'decrypt') {
    try {
      const [ivHex, encHex] = text.split(':')
      if (!ivHex || !encHex) throw new Error('invalid format')
      const iv = Buffer.from(ivHex, 'hex')
      const encrypted = Buffer.from(encHex, 'hex')
      const decipher = createDecipheriv(ALGORITHM, key, iv)
      const result = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
      return NextResponse.json({ result, error: null })
    } catch {
      return NextResponse.json({ result: null, error: 'decryption failed — wrong password or corrupted data' })
    }
  }

  return NextResponse.json({ result: null, error: 'action must be encrypt or decrypt' }, { status: 400 })
}
