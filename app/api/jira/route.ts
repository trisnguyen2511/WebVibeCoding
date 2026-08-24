import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    host: string
    email: string
    token: string
    path: string
    method?: string
    data?: unknown
    serverMode?: boolean
  }

  const { host, email, token, path, method = 'GET', data, serverMode = false } = body

  if (!host || !token || !path) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const normalizedHost = host.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
  const apiVersion = serverMode ? '2' : '3'
  const url = `${normalizedHost}/rest/api/${apiVersion}${path}`
  const authHeader = serverMode
    ? `Bearer ${token}`
    : `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    const json: unknown = await res.json()
    return NextResponse.json(json, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
