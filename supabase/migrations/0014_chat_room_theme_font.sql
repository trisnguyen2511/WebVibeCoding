-- The chat screen's own chrome text (room name, labels, empty states —
-- never the message content itself, which stays the sender's own
-- per-message font choice) can use a room-level theme font.
alter table chat_rooms add column if not exists theme_font text;
