-- Preserve owner rights; allow purchase-authorized staff to pay an invoice
-- only within their assigned tenant/branch and matching supplier scope.
DROP POLICY IF EXISTS erp_scope_insert ON public.supplier_payments;
CREATE POLICY erp_scope_insert ON public.supplier_payments
FOR INSERT TO authenticated
WITH CHECK (
  public.erp_can_write_scope_text(restaurant_id::text, branch_id::text)
  OR (
    public.erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND public.erp_has_permission('createPurchases')
    AND amount > 0
    AND EXISTS (
      SELECT 1 FROM public.supplier_invoices i
      WHERE i.id = supplier_payments.invoice_id
        AND i.restaurant_id = supplier_payments.restaurant_id
        AND i.branch_id = supplier_payments.branch_id
        AND i.branch IS NOT DISTINCT FROM supplier_payments.branch
        AND i.supplier_id IS NOT DISTINCT FROM supplier_payments.supplier_id
        AND i.status NOT IN ('draft', 'cancelled')
        AND supplier_payments.amount <= greatest(i.total_amount - coalesce(i.paid_amount, 0), 0)
    )
  )
);
