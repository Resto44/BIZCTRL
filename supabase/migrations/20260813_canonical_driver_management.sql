-- Canonical Driver Management
-- Consolidates driver records into public.drivers, links daily sales to drivers,
-- removes driver-portal-only access policies, and keeps all access RLS-scoped.

BEGIN;

-- A stable link is required for all new manager-created sales and for historical backfill.
ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS driver_id UUID;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS legacy_employee_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_sales_driver_id_fkey'
      AND conrelid = 'public.daily_sales'::regclass
  ) THEN
    ALTER TABLE public.daily_sales
      ADD CONSTRAINT daily_sales_driver_id_fkey
      FOREIGN KEY (driver_id)
      REFERENCES public.drivers(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_drivers_legacy_employee_id
  ON public.drivers (legacy_employee_id)
  WHERE legacy_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_daily_sales_driver_period
  ON public.daily_sales (driver_id, date DESC)
  WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_restaurant_branch_active
  ON public.drivers (restaurant_id, branch_id, is_active, full_name);

-- Attach a legacy employee identity to pre-existing matching driver records before
-- creating any missing canonical driver rows. This prevents duplicate driver data.
UPDATE public.drivers AS d
SET
  legacy_employee_id = e.id,
  branch_id = COALESCE(
    d.branch_id,
    e.branch_id,
    (
      SELECT b.id
      FROM public.branches AS b
      WHERE b.restaurant_id = e.restaurant_id
        AND b.branch_key = e.branch
      LIMIT 1
    )
  ),
  updated_date = NOW()
FROM public.employees AS e
WHERE d.legacy_employee_id IS NULL
  AND (e.is_driver = TRUE OR LOWER(COALESCE(e.position, '')) LIKE '%driver%')
  AND d.restaurant_id = e.restaurant_id
  AND LOWER(TRIM(d.full_name)) = LOWER(TRIM(e.full_name))
  AND (
    NULLIF(TRIM(d.phone), '') IS NULL
    OR NULLIF(TRIM(e.phone), '') IS NULL
    OR TRIM(d.phone) = TRIM(e.phone)
  );

-- Migrate every legacy employee driver once into the canonical driver table.
INSERT INTO public.drivers (
  restaurant_id,
  branch_id,
  full_name,
  driver_id,
  phone,
  email,
  notes,
  status,
  is_active,
  created_by,
  created_date,
  updated_date,
  tenant_id,
  legacy_employee_id
)
SELECT
  e.restaurant_id,
  COALESCE(
    e.branch_id,
    (
      SELECT b.id
      FROM public.branches AS b
      WHERE b.restaurant_id = e.restaurant_id
        AND b.branch_key = e.branch
      LIMIT 1
    )
  ),
  e.full_name,
  NULLIF(e.employee_id, ''),
  e.phone,
  e.email,
  e.notes,
  CASE
    WHEN e.is_active = FALSE THEN 'inactive'
    WHEN LOWER(COALESCE(e.status, 'active')) IN ('active', 'off_duty', 'suspended', 'inactive') THEN LOWER(e.status)
    ELSE 'active'
  END,
  COALESCE(e.is_active, TRUE),
  e.created_by,
  COALESCE(e.created_date, NOW()),
  NOW(),
  e.tenant_id,
  e.id
FROM public.employees AS e
WHERE (e.is_driver = TRUE OR LOWER(COALESCE(e.position, '')) LIKE '%driver%')
  AND NOT EXISTS (
    SELECT 1
    FROM public.drivers AS d
    WHERE d.legacy_employee_id = e.id
  );

-- Backfill historical sales from the migrated employee reference or an unambiguous
-- legacy name. New code always persists daily_sales.driver_id directly.
UPDATE public.daily_sales AS ds
SET
  driver_id = d.id,
  driver_name = COALESCE(NULLIF(ds.driver_name, ''), d.full_name),
  updated_date = NOW()
FROM public.drivers AS d
WHERE ds.driver_id IS NULL
  AND (
    ds.driver_employee_id = d.legacy_employee_id::text
    OR (
      NULLIF(TRIM(ds.driver_name), '') IS NOT NULL
      AND LOWER(TRIM(ds.driver_name)) = LOWER(TRIM(d.full_name))
      AND COALESCE(ds.restaurant_id, '') = d.restaurant_id::text
    )
  );

-- Delivery orders previously accepted employee IDs in driver_id. Remap those
-- assignments so dispatch, wallets, and history all reference canonical drivers.
UPDATE public.delivery_orders AS o
SET
  driver_id = d.id,
  driver_name = COALESCE(NULLIF(o.driver_name, ''), d.full_name),
  updated_date = NOW()
FROM public.drivers AS d
WHERE d.legacy_employee_id IS NOT NULL
  AND o.driver_id = d.legacy_employee_id;

-- Legacy employee rows are retained for audit history only; drivers are now read
-- and managed exclusively from public.drivers.
UPDATE public.employees
SET
  is_driver = FALSE,
  updated_date = NOW()
WHERE is_driver = TRUE
   OR LOWER(COALESCE(position, '')) LIKE '%driver%';

-- Driver login and self-service portal access are retired. Managers and owners
-- retain RLS-protected directory access through the canonical drivers table.
DROP POLICY IF EXISTS driver_directory_self_or_scope_select ON public.drivers;
DROP POLICY IF EXISTS erp_driver_directory_select ON public.drivers;
CREATE POLICY erp_driver_directory_select ON public.drivers
  FOR SELECT TO authenticated
  USING (
    erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND erp_current_role() <> 'driver'
    AND erp_has_any_permission(ARRAY['viewEmployees', 'viewSales', 'viewDelivery', 'viewReports'])
  );

-- Driver portal-specific delivery mutation policies are no longer valid.
DROP POLICY IF EXISTS driver_delivery_insert ON public.delivery_orders;
DROP POLICY IF EXISTS driver_delivery_update ON public.delivery_orders;
DROP FUNCTION IF EXISTS public.record_order_status_change(UUID, TEXT, TEXT);

-- The owner and manager dashboards subscribe to canonical driver and sales changes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'drivers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'daily_sales'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_sales;
  END IF;
END
$$;

COMMIT;
