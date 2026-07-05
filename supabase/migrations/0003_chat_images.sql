-- Image messages (stored on Cloudinary, only the URL/metadata lives here)
-- and a tiny singleton table used to throttle the storage-quota warning.

alter table chat_messages alter column content drop not null;
alter table chat_messages add column if not exists image_url text;
alter table chat_messages add column if not exists image_public_id text;
alter table chat_messages add column if not exists image_bytes bigint;
alter table chat_messages
  add constraint chat_messages_content_or_image
  check (content is not null or image_url is not null);

create table if not exists chat_system_state (
  id boolean primary key default true,
  storage_warned_at timestamptz,
  constraint chat_system_state_singleton check (id)
);
insert into chat_system_state (id) values (true) on conflict do nothing;

alter table chat_system_state enable row level security;
