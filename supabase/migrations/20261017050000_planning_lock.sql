-- One automatic plan at a time per student: an import's plan takes this
-- (when it's empty or stale) and clears it when done; another waits its turn,
-- so it plans around what the first one placed.
alter table public.settings add column planning_since timestamptz;
