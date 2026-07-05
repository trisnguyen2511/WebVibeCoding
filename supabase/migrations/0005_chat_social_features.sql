-- Reactions (one reaction per device per message; re-reacting with the same
-- emoji toggles it off client-side by calling the react endpoint again).
create table if not exists chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id) on delete cascade,
  room_id uuid not null references chat_rooms(id) on delete cascade,
  device_id text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, device_id)
);
alter table chat_message_reactions enable row level security;

-- Reply/quote — snapshot the quoted text so rendering never needs to resolve
-- a message that has since scrolled out of the loaded pagination window.
alter table chat_messages add column if not exists reply_to_id uuid references chat_messages(id) on delete set null;
alter table chat_messages add column if not exists reply_to_nickname text;
alter table chat_messages add column if not exists reply_to_content text;

-- Seen status
alter table chat_devices add column if not exists last_read_at timestamptz;

-- Pin message (one per room)
alter table chat_rooms add column if not exists pinned_message_id uuid references chat_messages(id) on delete set null;

-- Anniversary counter, set by the admin per room
alter table chat_rooms add column if not exists anniversary_date date;

-- Time capsule — content is hidden by the API until reveal_at has passed
alter table chat_messages add column if not exists reveal_at timestamptz;

-- Mood ring — last-known mood, shown alongside live presence
alter table chat_devices add column if not exists mood text;
