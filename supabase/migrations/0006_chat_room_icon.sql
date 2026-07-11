-- Custom room icon shown in the chat header and as the push notification
-- icon. Falls back to the app's default icon when null.
alter table chat_rooms add column if not exists icon_url text;
alter table chat_rooms add column if not exists icon_public_id text;
