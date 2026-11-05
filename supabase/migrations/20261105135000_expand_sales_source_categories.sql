-- Expand Sales Source category metadata for all BizCTRL business portals.
-- Compatibility-only schema change: existing category keys, source rows, RLS,
-- financial transactions and historical analytics remain unchanged.
-- A single atomic ALTER TABLE avoids any window without a category guard.
ALTER TABLE public.sales_sources
  DROP CONSTRAINT IF EXISTS sales_sources_category_check,
  ADD CONSTRAINT sales_sources_category_check
    CHECK (category IN ('delivery', 'wholesale', 'counter', 'online', 'corporate', 'credit', 'bank_transfer', 'dine_in', 'takeaway', 'catering', 'marketplace', 'social_media', 'field_sales', 'subscriptions', 'appointments', 'reseller', 'events', 'other'));

COMMENT ON CONSTRAINT sales_sources_category_check ON public.sales_sources
  IS 'Permitted operational sales channels; includes all eight legacy category keys and ten new SaaS categories.';
