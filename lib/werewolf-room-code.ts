import type { SupabaseClient } from '@supabase/supabase-js'

/** 6-digit numeric room code — short enough to type by hand, retried on collision. */
export async function generateUniqueRoomCode(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const { data } = await supabase.from('werewolf_rooms').select('id').eq('code', code).maybeSingle()
    if (!data) return code
  }
  throw new Error('failed to generate unique room code')
}
