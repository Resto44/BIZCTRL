BEGIN;

-- Daily Sales records retain their financial and legacy driver data, but their
-- operational attribution is the authenticated ERP user who entered the record.
-- Driver-specific information remains available only in Driver Management and
-- Driver Sales workflows; it is not the Daily Sales card attribution.
ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS manager_user_id uuid,
  ADD COLUMN IF NOT EXISTS manager_name text,
  ADD COLUMN IF NOT EXISTS manager_email text;

CREATE INDEX IF NOT EXISTS daily_sales_manager_user_branch_created_idx
  ON public.daily_sales (manager_user_id, branch_id, created_date DESC);

-- Preserve historical rows and monetary values. Where a profile or approved
-- membership can be found for the legacy created_by email, use its actual name;
-- otherwise retain the legacy creator value as a transparent historical label.
-- The existing driver guard is specifically for driver-data mutations. Disable
-- it only around this metadata-only historical backfill so legacy driver rows
-- are not revalidated or changed, then restore it in the same transaction.
ALTER TABLE public.daily_sales DISABLE TRIGGER daily_sales_driver_owner_or_manager;
UPDATE public.daily_sales d
SET
  manager_user_id = COALESCE(
    d.manager_user_id,
    (SELECT p.id FROM public.profiles p
      WHERE lower(coalesce(p.email, '')) = lower(coalesce(d.created_by, ''))
      ORDER BY p.updated_date DESC NULLS LAST LIMIT 1),
    (SELECT m.user_id FROM public.erp_memberships m
      WHERE lower(coalesce(m.email, '')) = lower(coalesce(d.created_by, ''))
        AND m.status = 'approved'
        AND (d.restaurant_id IS NULL OR m.restaurant_id::text = d.restaurant_id)
      ORDER BY m.updated_at DESC NULLS LAST LIMIT 1)
  ),
  manager_name = COALESCE(
    nullif(d.manager_name, ''),
    (SELECT nullif(p.full_name, '') FROM public.profiles p
      WHERE lower(coalesce(p.email, '')) = lower(coalesce(d.created_by, ''))
      ORDER BY p.updated_date DESC NULLS LAST LIMIT 1),
    (SELECT nullif(m.full_name, '') FROM public.erp_memberships m
      WHERE lower(coalesce(m.email, '')) = lower(coalesce(d.created_by, ''))
        AND m.status = 'approved'
        AND (d.restaurant_id IS NULL OR m.restaurant_id::text = d.restaurant_id)
      ORDER BY m.updated_at DESC NULLS LAST LIMIT 1),
    nullif(d.created_by, ''),
    'Historical sales entry'
  ),
  manager_email = COALESCE(
    nullif(d.manager_email, ''),
    (SELECT p.email FROM public.profiles p
      WHERE lower(coalesce(p.email, '')) = lower(coalesce(d.created_by, ''))
      ORDER BY p.updated_date DESC NULLS LAST LIMIT 1),
    (SELECT m.email FROM public.erp_memberships m
      WHERE lower(coalesce(m.email, '')) = lower(coalesce(d.created_by, ''))
        AND m.status = 'approved'
        AND (d.restaurant_id IS NULL OR m.restaurant_id::text = d.restaurant_id)
      ORDER BY m.updated_at DESC NULLS LAST LIMIT 1),
    nullif(d.created_by, '')
  );
ALTER TABLE public.daily_sales ENABLE TRIGGER daily_sales_driver_owner_or_manager;

CREATE OR REPLACE FUNCTION public.erp_daily_sales_assign_manager_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_membership public.erp_memberships;
  v_profile public.profiles;
BEGIN
  -- The record keeps the manager who created it. Editing sales never rewrites
  -- attribution and therefore cannot create duplicate or spoofed manager links.
  IF TG_OP = 'UPDATE' THEN
    NEW.manager_user_id := OLD.manager_user_id;
    NEW.manager_name := OLD.manager_name;
    NEW.manager_email := OLD.manager_email;
    RETURN NEW;
  END IF;

  -- Service-side historical imports may have no end-user JWT. They retain the
  -- supplied/backfilled attribution but cannot manufacture a manager identity.
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_membership
  FROM public.erp_memberships m
  WHERE m.user_id = v_user_id
    AND m.status = 'approved'
    AND (NEW.restaurant_id IS NULL OR m.restaurant_id::text = NEW.restaurant_id)
  ORDER BY CASE WHEN m.branch_id = NEW.branch_id THEN 0 ELSE 1 END, m.updated_at DESC
  LIMIT 1;

  SELECT * INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_user_id
  LIMIT 1;

  IF v_membership.id IS NOT NULL
    AND lower(v_membership.role) = 'manager'
    AND v_membership.branch_id IS NOT NULL THEN
    IF NEW.branch_id IS NULL THEN
      NEW.branch_id := v_membership.branch_id;
    ELSIF NEW.branch_id <> v_membership.branch_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DAILY_SALES_BRANCH_SCOPE_DENIED';
    END IF;
  END IF;

  NEW.manager_user_id := v_user_id;
  NEW.manager_name := COALESCE(
    nullif(v_membership.full_name, ''),
    nullif(v_profile.full_name, ''),
    nullif(v_membership.email, ''),
    nullif(v_profile.email, ''),
    nullif(NEW.created_by, ''),
    'Authenticated manager'
  );
  NEW.manager_email := COALESCE(
    nullif(v_membership.email, ''),
    nullif(v_profile.email, ''),
    nullif(NEW.created_by, '')
  );
  NEW.created_by := COALESCE(nullif(NEW.created_by, ''), NEW.manager_email, NEW.manager_name);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_sales_manager_attribution ON public.daily_sales;
CREATE TRIGGER daily_sales_manager_attribution
BEFORE INSERT OR UPDATE ON public.daily_sales
FOR EACH ROW EXECUTE FUNCTION public.erp_daily_sales_assign_manager_attribution();

COMMIT;
