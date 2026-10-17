-- The student's classes, read from the schedule they upload in Options: each a
-- weekly meeting (days 0 = Sunday … 6 = Saturday, a start time in their time
-- zone, minutes), with its room and, when the schedule shows them, the term's
-- first and last days. Weekly rules, not copies: every week shows them, and
-- the planner, the walks and hand-set times keep clear of them.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  days smallint[] not null check (cardinality(days) between 1 and 7),
  start text not null check (start ~ '^\d{2}:\d{2}$'),
  minutes int not null check (minutes between 10 and 360),
  place text check (char_length(place) <= 60),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

alter table public.classes enable row level security;
revoke all on public.classes from anon;
grant select, insert, update, delete on public.classes to authenticated;

create policy "owner" on public.classes for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
