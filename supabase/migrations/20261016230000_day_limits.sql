-- A lighter day the student asked for through Reschedule ("I feel sick today"):
-- at most `minutes` of work that day, and no deep work unless `deep`.
create table public.day_limits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  minutes int not null check (minutes between 0 and 720),
  deep boolean not null default false,
  unique (owner_id, day)
);

alter table public.day_limits enable row level security;
revoke all on public.day_limits from anon;
grant select, insert, update, delete on public.day_limits to authenticated;

create policy "owner" on public.day_limits for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
