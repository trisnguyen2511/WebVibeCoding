-- Generic file/video attachments — uploaded directly from the client to
-- Cloudinary (bypassing the server entirely, since video can exceed the
-- serverless function body-size limit), then registered here by URL.
alter table chat_messages add column if not exists file_url text;
alter table chat_messages add column if not exists file_public_id text;
alter table chat_messages add column if not exists file_bytes bigint;
alter table chat_messages add column if not exists file_name text;
alter table chat_messages add column if not exists file_resource_type text;
