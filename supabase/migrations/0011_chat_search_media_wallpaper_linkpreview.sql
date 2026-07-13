-- Per-room wallpaper (color/gradient preset id, or a custom uploaded image)
-- and cached link-preview metadata on messages (computed once at send time,
-- not re-fetched on every render).

alter table chat_rooms add column if not exists wallpaper_preset text;
alter table chat_rooms add column if not exists wallpaper_url text;
alter table chat_rooms add column if not exists wallpaper_public_id text;

alter table chat_messages add column if not exists link_preview jsonb;

-- Message search uses a plain ilike — personal 2-person rooms won't have
-- enough history for this to need a specialized index.
create index if not exists chat_messages_room_created_idx on chat_messages (room_id, created_at);
