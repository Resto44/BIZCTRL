alter table public.owner_push_devices add column language text check(language in ('en','ar','fa'));
-- No browser table-write grants: only the owner-authenticated push endpoint can update it.
