-- Restore the Driver role in the existing member contract trigger.
-- The role is already allowed by erp_memberships_role_check and ERP session
-- context; this trigger was left on the older four-role allowlist.
-- This migration never changes users, invitations, drivers, or sales.
CREATE OR REPLACE FUNCTION public.erp_enforce_membership_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
BEGIN
  NEW.role := lower(coalesce(NEW.role, ''));
  IF NEW.role NOT IN ('owner', 'manager', 'employee', 'supplier', 'driver') THEN
    RAISE EXCEPTION 'Unsupported ERP portal role';
  END IF;

  IF NEW.role = 'owner' THEN
    NEW.data_scope := 'all_branches';
    NEW.selected_branch_ids := coalesce(NEW.selected_branch_ids, '{}'::uuid[]);
    NEW.permissions := '{}'::jsonb;
  ELSE
    IF NEW.status = 'approved' AND (NEW.restaurant_id IS NULL OR NEW.branch_id IS NULL) THEN
      RAISE EXCEPTION 'Store and branch are required for an approved ERP portal';
    END IF;
    NEW.data_scope := 'assigned_branch';
    NEW.selected_branch_ids := '{}'::uuid[];
    NEW.permissions := public.erp_sanitize_permissions(NEW.role, NEW.permissions);
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
