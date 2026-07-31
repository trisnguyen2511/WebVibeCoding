-- Werewolf GM: online rooms — MC creates a room, players join by PIN/QR from
-- their own phone, MC locks the room, arranges seats/roles as usual, then
-- role cards are pushed to each connected player over Supabase Realtime.
-- All access goes through API routes using the service-role key, so RLS is
-- enabled with no policies (default deny) to block direct anon-key access.
-- The client only ever touches Supabase directly to *listen* on the
-- `werewolf-room-<id>` broadcast channel, which requires no table grants.

create table if not exists werewolf_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  gm_device_id text not null,
  -- lobby: open for join | locked: MC is setting up seats/roles | in_game: roles handed out
  status text not null default 'lobby' check (status in ('lobby', 'locked', 'in_game')),
  roles jsonb not null default '[]'::jsonb,
  role_counts jsonb not null default '{}'::jsonb,
  assign_mode text not null default 'preset' check (assign_mode in ('preset', 'live')),
  realtime_enabled boolean not null default true,
  game_started_at timestamptz,
  game_ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists werewolf_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references werewolf_rooms(id) on delete cascade,
  device_id text not null,
  name text not null,
  -- Seat order from the MC's "sắp xếp vị trí" step; null until first finalize.
  -- Kept across "play again" rounds so a returning player lands back in the
  -- same seat, while a brand-new joiner (seat still null) sorts to the end.
  seat int,
  role_ids jsonb not null default '[]'::jsonb,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (room_id, device_id)
);

create index if not exists werewolf_rooms_code_idx on werewolf_rooms (code);
create index if not exists werewolf_room_players_room_id_idx on werewolf_room_players (room_id);

alter table werewolf_rooms enable row level security;
alter table werewolf_room_players enable row level security;
