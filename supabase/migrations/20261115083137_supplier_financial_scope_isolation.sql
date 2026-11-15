-- Suppliers read only their linked ledger through an explicit policy, not general ERP scope.
CREATE OR REPLACE FUNCTION public.erp_can_access_scope_text(
  p_restaurant_id text, p_branch_id text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id = auth.uid()
      AND m.status = 'approved'
      AND m.role NOT IN ('driver', 'supplier')
      AND m.restaurant_id::text = nullif(p_restaurant_id, '')
      AND (
        m.role = 'owner'
        OR (nullif(p_branch_id, '') IS NOT NULL AND m.branch_id::text = nullif(p_branch_id, ''))
      )
  ) AND EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.restaurant_id::text = nullif(p_restaurant_id, '')
      AND public.erp_subscription_has_erp_access(s.restaurant_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.erp_can_read_own_supplier_ledger(
  p_restaurant_id uuid, p_branch_id uuid, p_supplier_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id = auth.uid() AND m.role = 'supplier' AND m.status = 'approved'
      AND m.restaurant_id = p_restaurant_id AND m.branch_id = p_branch_id
      AND m.linked_entity_id = p_supplier_id
      AND public.erp_subscription_has_erp_access(m.restaurant_id)
  );
$function$;
REVOKE ALL ON FUNCTION public.erp_can_read_own_supplier_ledger(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_can_read_own_supplier_ledger(uuid,uuid,uuid) TO authenticated;

ALTER POLICY erp_scope_select ON public.supplier_invoices
USING (
  (public.erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND (public.erp_has_permission('viewPurchases')
      OR (public.erp_has_permission('viewInvoices') AND supplier_id = public.erp_current_linked_entity_id())))
  OR (public.erp_can_read_own_supplier_ledger(restaurant_id, branch_id, supplier_id)
    AND public.erp_has_permission('viewInvoices'))
);
ALTER POLICY erp_scope_select ON public.supplier_payments
USING (
  (public.erp_can_access_scope_text(coalesce(restaurant_id::text,''),coalesce(branch_id::text,''))
    AND (coalesce(public.erp_current_role(),'') <> 'supplier' OR supplier_id = public.erp_current_linked_entity_id()))
  OR (public.erp_can_read_own_supplier_ledger(restaurant_id, branch_id, supplier_id)
    AND public.erp_has_permission('viewPayments'))
);
