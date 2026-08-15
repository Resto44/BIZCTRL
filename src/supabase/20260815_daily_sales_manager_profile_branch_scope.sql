BEGIN;

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
  v_assigned_branch_id uuid;
  v_role text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.manager_user_id := OLD.manager_user_id;
    NEW.manager_name := OLD.manager_name;
    NEW.manager_email := OLD.manager_email;
    RETURN NEW;
  END IF;

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

  v_role := lower(coalesce(v_membership.role, v_profile.role, ''));
  v_assigned_branch_id := coalesce(v_membership.branch_id, v_profile.branch_id);
  IF v_role = 'manager' AND v_assigned_branch_id IS NOT NULL THEN
    IF NEW.branch_id IS NULL THEN
      NEW.branch_id := v_assigned_branch_id;
    ELSIF NEW.branch_id <> v_assigned_branch_id THEN
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

COMMIT;
