-- Keep the legacy profile fields used by the React tenant resolver aligned with
-- the approved membership, which is the authoritative branch assignment.
UPDATE public.profiles p
SET
  restaurant_id   = m.restaurant_id,
  organization_id = m.restaurant_id,
  branch_id       = m.branch_id,
  branch          = b.branch_key,
  tenant_id       = m.restaurant_id::text,
  updated_date    = now()
FROM public.erp_memberships m
JOIN public.branches b
  ON b.id = m.branch_id
 AND b.restaurant_id = m.restaurant_id
WHERE p.id = m.user_id
  AND m.status = 'approved'
  AND m.role IN ('manager', 'general_manager')
  AND (
    p.restaurant_id IS DISTINCT FROM m.restaurant_id
    OR p.organization_id IS DISTINCT FROM m.restaurant_id
    OR p.branch_id IS DISTINCT FROM m.branch_id
    OR p.branch IS DISTINCT FROM b.branch_key
  );

-- Owners retain restaurant-wide access. Every other approved role must provide
-- the exact assigned branch UUID; an empty branch scope can no longer broaden
-- manager access across branches.
CREATE OR REPLACE FUNCTION public.erp_can_write_scope_text(
  p_restaurant_id text,
  p_branch_id     text DEFAULT NULL::text
)
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
      AND m.restaurant_id::text = nullif(p_restaurant_id, '')
      AND (
        m.role IN ('owner', 'manager', 'general_manager', 'employee')
        OR coalesce((m.permissions ->> 'uploadSales')::boolean, false)
      )
      AND (
        m.role = 'owner'
        OR (
          nullif(p_branch_id, '') IS NOT NULL
          AND m.branch_id::text = nullif(p_branch_id, '')
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND pr.role = 'owner'
      AND COALESCE(pr.approval_status, 'approved') = 'approved'
      AND COALESCE(pr.organization_id, pr.restaurant_id)::text = nullif(p_restaurant_id, '')
  );
$$;
