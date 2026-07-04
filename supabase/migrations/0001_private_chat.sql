-- Private Chat feature: PIN-based chat rooms with push notifications.
-- All access is mediated by API routes using the service-role key, so RLS is
-- enabled with no policies (default deny) to block direct anon-key access.

create extension if not exists "pgcrypto";

create table if not exists chat_rooms (
  id uuid primary key default gen_random_uuid(),
  pin text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists chat_devices (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  device_id text not null,
  nickname text not null,
  push_subscription jsonb,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (room_id, device_id)
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references chat_rooms(id) on delete cascade,
  device_id text not null,
  nickname text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_room_id_created_at_idx
  on chat_messages (room_id, created_at);

alter table chat_rooms enable row level security;
alter table chat_devices enable row level security;
alter table chat_messages enable row level security;
