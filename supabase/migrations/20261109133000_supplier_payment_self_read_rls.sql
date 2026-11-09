-- Supplier must read only their OWN payment rows within their assigned tenant
-- and branch. Prior SELECT rule authorized by branch alone, allowing a supplier
-- to query unrelated suppliers' payments from the same branch. Keep existing
-- Owner/Manager behavior, while restricting role=supplier by server membership.
-- No INSERT/UPDATE/DELETE policy or financial records are modified.
ALTER POLICY erp_scope_select ON public.supplier_payments
USING (
  public.erp_can_access_scope_text(
    COALESCE(restaurant_id::text,''), COALESCE(branch_id::text,'')
  )
  AND (
    COALESCE(public.erp_current_role(),'') <> 'supplier'
    OR supplier_id = public.erp_current_linked_entity_id()
  )
);
