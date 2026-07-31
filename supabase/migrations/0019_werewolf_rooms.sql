create table if not exists werewolf_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  gm_device_id text not null,
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
