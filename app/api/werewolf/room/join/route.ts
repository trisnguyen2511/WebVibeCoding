import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { roomChannelName } from '@/lib/werewolf/online-types'
import type { RoleDef } from '@/lib/werewolf/types'

// Doubles as the "rejoin" endpoint: a device that already has a row in this
// room just gets its current state back (lobby wait / in-game role card),
// regardless of room status — only a brand-new device is blocked from
// joining a locked or in-progress room.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }
  const { code, deviceId, name } = body as { code?: string; deviceId?: string; name?: string }
  if (!code || typeof code !== 'string') return NextResponse.json({ error: 'code is required' }, { status: 400 })
  if (!deviceId || typeof deviceId !== 'string') return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: room, error: roomError } = await supabase
    .from('werewolf_rooms')
    .select('id, code, status, roles, realtime_enabled, game_ended_at')
    .eq('code', code.trim())
    .maybeSingle()
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Không tìm thấy phòng với mã này' }, { status: 404 })

  const { data: existing, error: existingError } = await supabase
    .from('werewolf_room_players')
    .select('id, name, seat, role_ids')
    .eq('room_id', room.id)
    .eq('device_id', deviceId)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  let player = existing
  const nowIso = new Date().toISOString()

  if (!player) {
    if (room.status !== 'lobby') {
      return NextResponse.json(
        { error: room.status === 'locked' ? 'Phòng đã khoá, không thể vào thêm' : 'Ván đang diễn ra, vui lòng đợi khi kết thúc' },
        { status: 409 }
      )
    }
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const { data: inserted, error: insertError } = await supabase
      .from('werewolf_room_players')
      .insert({ room_id: room.id, device_id: deviceId, name: trimmedName })
      .select('id, name, seat, role_ids')
      .single()
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    player = inserted

    await supabase.channel(roomChannelName(room.id)).send({
      type: 'broadcast',
      event: 'player_joined',
      payload: { id: player.id, name: player.name, seat: player.seat, roleIds: player.role_ids },
    })
  } else {
    const current = player
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    const update: { last_seen: string; name?: string } = { last_seen: nowIso }
    // Only allow fixing a typo'd name while still in the open lobby.
    if (trimmedName && trimmedName !== current.name && room.status === 'lobby') update.name = trimmedName
    await supabase.from('werewolf_room_players').update(update).eq('id', current.id)
    if (update.name) player = { ...current, name: update.name }
  }

  return NextResponse.json({
    roomId: room.id,
    code: room.code,
    status: room.status,
    playerId: player.id,
    name: player.name,
    seat: player.seat,
    roleIds: player.role_ids as string[],
    roles: room.status === 'in_game' ? (room.roles as RoleDef[]) : [],
    realtimeEnabled: room.realtime_enabled,
    gameEndedAt: room.game_ended_at,
  })
}
