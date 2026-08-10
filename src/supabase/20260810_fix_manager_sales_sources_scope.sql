-- Fix manager access to branch-scoped sales sources.
-- sales_sources.branch_id stores the branch key, while ERP memberships store
-- the branch UUID. Preserve the existing scope helper for global/UUID-scoped
-- records and add the key-to-UUID lookup only for assigned managers.

DROP POLICY IF EXISTS sales_sources_scope_select ON public.sales_sources;

CREATE POLICY sales_sources_scope_select
ON public.sales_sources
FOR SELECT
USING (
  public.erp_can_access_scope_text(restaurant_id, branch_id)
  OR EXISTS (
    SELECT 1
    FROM public.erp_memberships AS membership
    JOIN public.branches AS branch
      ON branch.id = membership.branch_id
    WHERE membership.user_id = auth.uid()
      AND membership.status = 'approved'
      AND membership.role = 'manager'
      AND membership.restaurant_id::text = NULLIF(sales_sources.restaurant_id, '')
      AND branch.branch_key = sales_sources.branch_id
  )
);
