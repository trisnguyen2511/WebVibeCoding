-- The unified upload flow now sets file_url (not image_url) for images and
-- videos sent without a caption, but the old check constraint only allowed
-- content OR image_url to be null-free — file-only messages violated it and
-- silently failed the insert. Widen the constraint to also accept file_url.

alter table chat_messages drop constraint if exists chat_messages_content_or_image;
alter table chat_messages
  add constraint chat_messages_content_or_attachment
  check (content is not null or image_url is not null or file_url is not null);
