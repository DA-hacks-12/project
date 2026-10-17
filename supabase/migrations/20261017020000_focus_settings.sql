-- Focus settings, in Options: Lockdown on or off (it then blocks distracting
-- sites whenever a session is under way or focus mode is running), and the
-- pomodoro's focus and break lengths. Reminders are gone.
alter table public.settings
  add column lockdown boolean not null default false,
  add column focus_minutes smallint not null default 25 check (focus_minutes between 10 and 120),
  add column break_minutes smallint not null default 5 check (break_minutes between 1 and 30);

drop table public.reminders;
