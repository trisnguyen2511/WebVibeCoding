import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadOwnedRoom } from '@/lib/werewolf-room-auth'
import { roomChannelName } from '@/lib/werewolf/online-types'

// Live-assign mode: the MC calls each seat during night 1 and hands out a
// role right at that moment (see NightLiveAssign) — this pushes just that
// one player's card instead of waiting for a single big finalize.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, gmDeviceId, playerId, roleIds } = body as {
    roomId?: string
    gmDeviceId?: string
    playerId?: string
    roleIds?: string[]
  }
  if (!roomId || !gmDeviceId || !playerId || !Array.isArray(roleIds)) {
    return NextResponse.json({ error: 'missing or invalid fields' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const result = await loadOwnedRoom(supabase, roomId, gmDeviceId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  if (result.room.status !== 'in_game') return NextResponse.json({ error: 'Ván chưa bắt đầu' }, { status: 409 })

  const { data: existing, error: fetchError } = await supabase
    .from('werewolf_room_players')
    .select('role_ids')
    .eq('id', playerId)
    .eq('room_id', roomId)
    .maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'player not found' }, { status: 404 })

  const nextRoleIds = [...(existing.role_ids as string[]), ...roleIds]
  const { error } = await supabase.from('werewolf_room_players').update({ role_ids: nextRoleIds }).eq('id', playerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.channel(roomChannelName(roomId)).send({
    type: 'broadcast',
    event: 'role_assigned',
    payload: { playerId, roleIds: nextRoleIds },
  })

  return NextResponse.json({ ok: true })
}
