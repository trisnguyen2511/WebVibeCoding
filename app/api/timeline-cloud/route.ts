import { NextRequest, NextResponse } from 'next/server'

// Required Supabase setup (run once in SQL editor):
// create table if not exists timeline_snapshots (
//   id text primary key,
//   data jsonb not null,
//   synced_at timestamptz default now()
// );
// alter table timeline_snapshots enable row level security;
// create policy "allow anon rw" on timeline_snapshots for all to anon using (true) with check (true);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(req: NextRequest) {
  const body = await req.json() as { id: string; data: unknown }
  const { id, data } = body
  if (!id || !data) {
    return NextResponse.json({ error: 'Missing id or data' }, { status: 400 })
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/timeline_snapshots`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id, data, synced_at: new Date().toISOString() }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/timeline_snapshots?id=eq.${encodeURIComponent(id)}&select=data,synced_at`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    },
  )

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }
  const rows = await res.json() as { data: unknown; synced_at: string }[]
  if (!rows.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(rows[0])
}
