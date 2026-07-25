-- Sales Closing runtime repair
-- The ERP stores organization scope as restaurant_id and ownership as created_by.
-- sales_invoices inherits these fields from daily_sales through fn_daily_sales_sync_invoice.

BEGIN;

DROP POLICY IF EXISTS erp_scope_insert ON public.sales_invoices;

CREATE POLICY erp_scope_insert
ON public.sales_invoices
FOR INSERT
TO authenticated
WITH CHECK (
  restaurant_id IS NOT NULL
  AND branch_id IS NOT NULL
  AND NULLIF(created_by, '') IS NOT NULL
  AND NULLIF(created_by, '') = COALESCE(auth.jwt() ->> 'email', '')
  AND (
    -- Approved owners and branch-scoped managers retain their existing write authority.
    public.erp_can_write_scope_text(restaurant_id::text, branch_id::text)
    OR (
      -- General managers may close sales only when they have their explicit upload-sales permission.
      public.erp_current_role() = 'general_manager'
      AND public.erp_can_access_scope_text(restaurant_id::text, branch_id::text)
      AND public.erp_has_permission('uploadSales')
    )
  )
);

COMMIT;
