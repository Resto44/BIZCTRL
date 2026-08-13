-- Retire the Kitchen portal and workflow.
-- Daily sales and canonical driver attribution remain unchanged.

BEGIN;

-- Existing Kitchen and Driver users no longer receive dedicated portals. Move
-- them to the least-privileged operational role before removing portal UI and RLS paths.
UPDATE public.profiles
SET role = 'employee'
WHERE role IN ('kitchen', 'driver');

DO $$
BEGIN
  IF to_regclass('public.erp_memberships') IS NOT NULL THEN
    UPDATE public.erp_memberships
    SET role = 'employee'
    WHERE role IN ('kitchen', 'driver');
  END IF;
END
$$;

-- Retire Kitchen-specific approval functions and RLS policies.
DROP FUNCTION IF EXISTS public.approve_kitchen_order(UUID, TEXT);
DROP FUNCTION IF EXISTS public.reject_kitchen_order(UUID, TEXT);
DROP POLICY IF EXISTS kitchen_delivery_status_update ON public.delivery_orders;
DROP INDEX IF EXISTS public.idx_delivery_orders_kitchen_status;

-- Remove Kitchen-only workflow data. No daily_sales or driver_id column is
-- changed, ensuring driver-attributed manager sales stay in the existing ledger.
DROP TABLE IF EXISTS public.kitchen_queues CASCADE;
DROP TABLE IF EXISTS public.kitchen_demand_forecast CASCADE;
DROP TABLE IF EXISTS public.kitchen_workload CASCADE;

ALTER TABLE public.delivery_orders
  DROP COLUMN IF EXISTS kitchen_status,
  DROP COLUMN IF EXISTS kitchen_approved_at,
  DROP COLUMN IF EXISTS kitchen_approved_by,
  DROP COLUMN IF EXISTS kitchen_rejected_at,
  DROP COLUMN IF EXISTS kitchen_rejected_by,
  DROP COLUMN IF EXISTS kitchen_reject_reason;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS kitchen_status;

-- Driver-attributed daily sales are a manager-only operational record. Owners
-- retain their existing SELECT policy but cannot create, update, delete, or
-- remove driver attribution from a Driver Sale.
CREATE OR REPLACE FUNCTION public.enforce_driver_sale_manager_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id text;
  v_branch_id text;
  v_has_driver boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_restaurant_id := COALESCE(OLD.restaurant_id::text, '');
    v_branch_id := COALESCE(OLD.branch_id::text, '');
    v_has_driver := OLD.driver_id IS NOT NULL;
  ELSE
    v_restaurant_id := COALESCE(NEW.restaurant_id::text, '');
    v_branch_id := COALESCE(NEW.branch_id::text, '');
    v_has_driver := NEW.driver_id IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.driver_id IS NOT NULL);
  END IF;

  IF v_has_driver AND NOT EXISTS (
    SELECT 1
    FROM public.erp_memberships membership
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'approved'
      AND membership.role = 'manager'
      AND membership.restaurant_id::text = v_restaurant_id
      AND membership.branch_id::text = v_branch_id
  ) THEN
    RAISE EXCEPTION 'Driver Sales can only be changed by the assigned Branch Manager';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS daily_sales_driver_manager_only ON public.daily_sales;
CREATE TRIGGER daily_sales_driver_manager_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.daily_sales
  FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_sale_manager_only();

COMMIT;
