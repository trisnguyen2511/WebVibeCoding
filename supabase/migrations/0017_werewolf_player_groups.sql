-- Werewolf GM: reusable named player-group presets ("nhóm người chơi mặc
-- định") so the MC can quickly fill the player list from a saved group
-- instead of retyping names every game. Managed via the admin page; all
-- access goes through API routes using the service-role key, so RLS is
-- enabled with no policies (default deny) to block direct anon-key access.

create table if not exists werewolf_player_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  player_names jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table werewolf_player_groups enable row level security;
