-- Renamed for extensibility: these two theme colors now drive far more than
-- just "my bubble vs their bubble" (icons, outer aurora background, send
-- button, active states...), so "primary/secondary" describes their role
-- more accurately than "mine/other". Behavior is unchanged — primary still
-- colors your own messages/chrome, secondary still colors the other side's.
alter table chat_rooms rename column bubble_mine_color to primary_color;
alter table chat_rooms rename column bubble_other_color to secondary_color;
