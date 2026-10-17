-- When a school's new or changed work was last planned on its own after an
-- import. While an import is newer, the page keeps checking back.
alter table public.feeds add column planned_at timestamptz;
