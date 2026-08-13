-- Allow canonical driver-attributed Daily Sales to be maintained by either the
-- restaurant Owner or the assigned Branch Manager. All payments remain on the
-- one existing public.daily_sales record; this migration changes permission only.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_driver_sale_owner_or_manager()
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

  IF v_has_driver AND NOT (
    EXISTS (
      SELECT 1
      FROM public.erp_memberships membership
      WHERE membership.user_id = auth.uid()
        AND membership.status = 'approved'
        AND membership.role = 'owner'
        AND membership.restaurant_id::text = v_restaurant_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.erp_memberships membership
      WHERE membership.user_id = auth.uid()
        AND membership.status = 'approved'
        AND membership.role = 'manager'
        AND membership.restaurant_id::text = v_restaurant_id
        AND membership.branch_id::text = v_branch_id
    )
  ) THEN
    RAISE EXCEPTION 'Driver Sales can only be changed by the restaurant Owner or assigned Branch Manager';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS daily_sales_driver_manager_only ON public.daily_sales;
DROP TRIGGER IF EXISTS daily_sales_driver_owner_or_manager ON public.daily_sales;
CREATE TRIGGER daily_sales_driver_owner_or_manager
  BEFORE INSERT OR UPDATE OR DELETE ON public.daily_sales
  FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_sale_owner_or_manager();

DROP FUNCTION IF EXISTS public.enforce_driver_sale_manager_only();

COMMIT;
