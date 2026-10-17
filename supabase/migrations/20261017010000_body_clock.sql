-- The body clock: nights learned by the extension (the longest gap in browsing
-- each night, minutes from that morning's midnight), and the student's own
-- "morning person" or "night person", which wins over the learned guess.
alter table public.settings
  add column nights jsonb,
  add column clock text check (clock in ('morning', 'night'));
