-- Ensure all approved Owner identities (membership- or profile-backed) can manage
-- canonical Treasury accounts; Managers retain read-only visibility through the
-- existing scope policy and cannot create, edit, activate, deactivate, or delete.
CREATE OR REPLACE FUNCTION public.treasury_account_is_owner(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.erp_memberships m
    WHERE m.user_id = auth.uid()
      AND m.status = 'approved'
      AND m.restaurant_id = p_restaurant_id
      AND lower(COALESCE(m.role, '')) = 'owner'
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.organization_id, p.restaurant_id) = p_restaurant_id
      AND COALESCE(p.approval_status, 'approved') = 'approved'
      AND lower(COALESCE(p.role, '')) IN ('owner', 'admin', 'restaurant_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.treasury_account_is_owner(uuid) TO authenticated;
