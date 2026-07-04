-- Per-message text styling: color, font family, bold/italic.
alter table chat_messages add column if not exists text_color text;
alter table chat_messages add column if not exists font_family text;
alter table chat_messages add column if not exists bold boolean not null default false;
alter table chat_messages add column if not exists italic boolean not null default false;
