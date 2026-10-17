-- Where the walks start from: a point, how it was had ('browser' from the
-- browser's position, 'typed' from a place the student typed, 'connection'
-- approximate, from where their connection comes from), and for a typed place
-- its name as found. Set by /api/places with the places it finds.
alter table public.settings add column origin jsonb;
