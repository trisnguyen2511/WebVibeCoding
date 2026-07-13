-- Tracks when each device last changed its mood, so a solo room (one
-- person across possibly several devices) can tell which device's mood is
-- actually the most recent instead of arbitrarily preferring "this device's
-- own row" whenever it happens to hold some older value.

alter table chat_devices add column if not exists mood_updated_at timestamptz;
