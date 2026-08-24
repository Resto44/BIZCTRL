-- Make the existing brand_settings table compatible with the Brand Settings UI.
-- The table is restaurant-scoped by existing RLS policies; do not change those policies.
BEGIN;

ALTER TABLE public.brand_settings
  ADD COLUMN IF NOT EXISTS brand_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh';

-- Existing RLS policies scope every operation through restaurant_id. The table has
-- no existing rows, so enforcing that required tenant key is safe and prevents
-- unscoped settings records from being created in the future.
ALTER TABLE public.brand_settings
  ALTER COLUMN restaurant_id SET NOT NULL;

-- One brand settings record is permitted for each restaurant. This allows the
-- client to reliably update the existing row and prevents concurrent first saves
-- from creating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS brand_settings_one_per_restaurant_idx
  ON public.brand_settings (restaurant_id);

NOTIFY pgrst, 'reload schema';
COMMIT;
