-- One student per anonymous sign-in. Every row belongs to its owner, and RLS
-- keeps it that way. Foreign keys bypass RLS, so writes that point at a task
-- also check the task is yours.

create table public.settings (
  owner_id uuid primary key default auth.uid() references auth.users on delete cascade,
  time_zone text not null default 'UTC',
  -- The extension's active hours: 24 shares (0–100), midnight first.
  active_hours smallint[] check (active_hours is null or cardinality(active_hours) = 24),
  -- Parks and trails near the student, from OpenStreetMap.
  places jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- One Canvas per school, named by its address ("deanza.instructure.com").
-- A feed link can be imported again; an uploaded .ics updates the same school.
create table public.feeds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 200),
  url text check (url is null or length(url) <= 500),
  imported_at timestamptz,
  unique (owner_id, name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  feed_id uuid not null references public.feeds on delete cascade,
  -- Canvas ids are unique within one school, so the key includes the feed.
  uid text not null,
  title text not null,
  course text,
  due timestamptz not null,
  url text,
  fingerprint text not null,
  -- The interpretation; `read` is false until the model's answer holds.
  read boolean not null default false,
  deliverable text,
  requirements text[] not null default '{}',
  minutes int check (minutes between 5 and 2400),
  work text check (work in ('deep', 'light')),
  done boolean not null default false,
  unique (owner_id, feed_id, uid)
);

-- Anything on the calendar: a session on a task, a break, or the student's own event.
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('session', 'break', 'event')),
  start timestamptz not null,
  minutes int not null check (minutes between 1 and 1440),
  task_id uuid references public.tasks on delete cascade,
  rest text check (rest in ('nap', 'walk', 'eat', 'move')),
  title text check (title is null or length(title) between 1 and 120),
  details text check (details is null or length(details) <= 2000),
  done boolean not null default false,
  check ((kind = 'session') = (task_id is not null)),
  check ((kind = 'break') = (rest is not null)),
  check (kind <> 'event' or title is not null)
);
create index blocks_owner_start on public.blocks (owner_id, start);

create table public.dismissals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  text text not null check (length(text) between 1 and 200),
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.settings enable row level security;
alter table public.feeds enable row level security;
alter table public.tasks enable row level security;
alter table public.blocks enable row level security;
alter table public.dismissals enable row level security;
alter table public.reminders enable row level security;

revoke all on public.settings, public.feeds, public.tasks, public.blocks, public.dismissals, public.reminders from anon;
grant select, insert, update, delete
  on public.settings, public.feeds, public.tasks, public.blocks, public.dismissals, public.reminders
  to authenticated;

create policy "owner" on public.settings for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner" on public.feeds for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner" on public.tasks for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.feeds f where f.id = feed_id and f.owner_id = (select auth.uid()))
  );

create policy "owner" on public.blocks for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (task_id is null or exists (
      select 1 from public.tasks t where t.id = task_id and t.owner_id = (select auth.uid())
    ))
  );

create policy "owner" on public.dismissals for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = (select auth.uid()))
  );

create policy "owner" on public.reminders for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
