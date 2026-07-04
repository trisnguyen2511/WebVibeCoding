-- Room type: 'group' requires a display name to join (existing behavior),
-- 'solo' lets anyone join without a name (defaults to "my pal" server-side).
alter table chat_rooms
  add column if not exists type text not null default 'group'
  check (type in ('group', 'solo'));
