-- Per-room customization of the mood-picker options and the quick-reaction
-- emoji set. Null means "use the app's built-in defaults".

alter table chat_rooms add column if not exists mood_options jsonb;
alter table chat_rooms add column if not exists reaction_emojis jsonb;
