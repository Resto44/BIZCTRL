BEGIN;

-- The plan catalog is now authoritative. Remove the former trigger that copied
-- catalog limits onto individual subscriptions, then retire those duplicated fields.
DROP TRIGGER IF EXISTS subscriptions_sync_plan_cache ON public.subscriptions;
DROP FUNCTION IF EXISTS public.sync_subscription_plan_cache();

ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS monthly_price,
  DROP COLUMN IF EXISTS max_restaurants,
  DROP COLUMN IF EXISTS max_branches,
  DROP COLUMN IF EXISTS max_employees,
  DROP COLUMN IF EXISTS max_ocr_scans,
  DROP COLUMN IF EXISTS max_pdf_exports,
  DROP COLUMN IF EXISTS used_ocr_scans,
  DROP COLUMN IF EXISTS used_pdf_exports;

-- These legacy tables contain no production records and overlap the canonical
-- subscription, usage, and plan entitlement model.
DROP TABLE IF EXISTS public.tenant_profiles;
DROP TABLE IF EXISTS public.usage_logs;

COMMIT;
