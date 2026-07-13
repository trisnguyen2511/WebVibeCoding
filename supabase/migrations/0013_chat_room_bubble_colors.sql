-- Per-room bubble color override — lets a room's chat visually match a
-- wallpaper/theme (e.g. the mosaic-tile theme) instead of always using the
-- app's fixed accent purple for "my" bubbles.
alter table chat_rooms add column if not exists bubble_mine_color text;
alter table chat_rooms add column if not exists bubble_other_color text;
