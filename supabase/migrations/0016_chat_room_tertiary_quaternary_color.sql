-- Two more theme color roles, matching a standard primary/secondary/accent
-- palette: tertiary highlights informational elements (pinned message, link
-- previews, chosen reactions), quaternary is a quieter accent used for the
-- outer aurora background's third blob and small decorative touches.
alter table chat_rooms add column if not exists tertiary_color text;
alter table chat_rooms add column if not exists quaternary_color text;
