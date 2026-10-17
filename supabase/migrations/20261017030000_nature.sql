-- Nature suggestions: one outing a day to a real place, saved as a block
-- (kind 'nature') with the place, its walk and the stay. They never block
-- anything; a reschedule replaces them on the days it changed.
alter table public.blocks drop constraint blocks_kind_check;
alter table public.blocks
  add constraint blocks_kind_check check (kind in ('session', 'break', 'event', 'nature')),
  add column place jsonb,
  add constraint blocks_nature_place check ((kind = 'nature') = (place is not null));
