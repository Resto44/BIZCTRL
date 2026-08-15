BEGIN;

CREATE OR REPLACE FUNCTION public.erp_get_authenticated_portal_identity(
  p_restaurant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  restaurant_id uuid,
  business_mode text,
  portal_name text,
  owner_user_id uuid,
  owner_name text,
  owner_email text,
  viewer_role text,
  viewer_branch_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_membership public.erp_memberships;
  v_owner public.erp_memberships;
  v_restaurant public.restaurants;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  SELECT * INTO v_membership
  FROM public.erp_memberships m
  WHERE m.user_id = v_user_id
    AND m.status = 'approved'
    AND (p_restaurant_id IS NULL OR m.restaurant_id = p_restaurant_id)
  ORDER BY m.updated_at DESC
  LIMIT 1;

  IF v_membership.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_SCOPE_DENIED';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants r
  WHERE r.id = v_membership.restaurant_id
  LIMIT 1;

  IF v_restaurant.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_SCOPE_DENIED';
  END IF;

  SELECT * INTO v_owner
  FROM public.erp_memberships m
  WHERE m.restaurant_id = v_restaurant.id
    AND m.status = 'approved'
    AND lower(m.role) = 'owner'
  ORDER BY m.updated_at ASC
  LIMIT 1;

  RETURN QUERY SELECT
    v_restaurant.id,
    coalesce(v_restaurant.business_mode::text, 'other'),
    coalesce(v_restaurant.business_mode::text, 'other'),
    v_owner.user_id,
    coalesce(nullif(v_owner.full_name, ''), nullif(v_owner.email, ''), nullif(v_restaurant.created_by, '')),
    v_owner.email,
    lower(coalesce(v_membership.role, 'member')),
    v_membership.branch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_get_authenticated_portal_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_get_authenticated_portal_identity(uuid) TO authenticated;

COMMIT;
