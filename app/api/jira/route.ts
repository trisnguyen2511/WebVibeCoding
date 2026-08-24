import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    host: string
    email: string
    token: string
    path: string
    method?: string
    data?: unknown
  }

  const { host, email, token, path, method = 'GET', data } = body

  if (!host || !email || !token || !path) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const url = `${host.replace(/\/$/, '')}/rest/api/3${path}`
  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`

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
