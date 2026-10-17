-- How the student likes to work (Options → Preferences): one choice per pair,
-- e.g. {"sessions": "long", "start": "easy"}. Missing means no preference.
alter table public.settings add column preferences jsonb not null default '{}';
