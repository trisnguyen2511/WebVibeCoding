-- Per-room customization of which text-style fonts show in the chat's font
-- picker (and their display label). Null means "show the full built-in
-- catalog". The set of available font *ids* is fixed in code (fonts must be
-- pre-loaded at build time) — this only controls which ones are shown and
-- what they're labeled, not arbitrary font names.

alter table chat_rooms add column if not exists font_options jsonb;
