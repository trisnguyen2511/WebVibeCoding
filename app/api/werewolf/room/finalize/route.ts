import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadOwnedRoom } from '@/lib/werewolf-room-auth'
import { roomChannelName } from '@/lib/werewolf/online-types'
import type { AssignMode, RoleDef } from '@/lib/werewolf/types'

interface FinalizePlayer {
  id: string
  seat: number
  roleIds: string[]
}

// Called once when the MC hits "Bắt đầu ván" — persists the seat order,
// role catalog and each player's role, flips the room to in_game, and
// broadcasts the whole thing so every connected phone renders its own card.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { roomId, gmDeviceId, roles, roleCounts, assignMode, players } = body as {
    roomId?: string
    gmDeviceId?: string
    roles?: RoleDef[]
    roleCounts?: Record<string, number>
    assignMode?: AssignMode
    players?: FinalizePlayer[]
  }
  if (!roomId || !gmDeviceId || !Array.isArray(roles) || !roleCounts || !assignMode || !Array.isArray(players)) {
    return NextResponse.json({ error: 'missing or invalid fields' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const result = await loadOwnedRoom(supabase, roomId, gmDeviceId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  if (result.room.status !== 'locked') return NextResponse.json({ error: 'Phòng chưa được khoá' }, { status: 409 })

  const nowIso = new Date().toISOString()
  const { error: roomError } = await supabase
    .from('werewolf_rooms')
    .update({
      status: 'in_game',
      roles,
      role_counts: roleCounts,
      assign_mode: assignMode,
      game_started_at: nowIso,
      game_ended_at: null,
      updated_at: nowIso,
    })
    .eq('id', roomId)
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })

  for (const player of players) {
    const { error } = await supabase
      .from('werewolf_room_players')
      .update({ seat: player.seat, role_ids: player.roleIds })
      .eq('id', player.id)
      .eq('room_id', roomId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.channel(roomChannelName(roomId)).send({
    type: 'broadcast',
    event: 'game_started',
    payload: { roles, assignMode, players: players.map((p) => ({ playerId: p.id, seat: p.seat, roleIds: p.roleIds })) },
  })

  return NextResponse.json({ ok: true })
}
