-- Comprehensive Fix: "new row violates row-level security policy"
-- 1. Update erp_can_write_scope_text to include 'employee' role and 'uploadSales' permission.
--    This allows cashiers to write to sales-related tables.
-- 2. Update SELECT policies for sales_invoices and daily_sales to include 'uploadSales' permission.
--    This prevents errors when the app tries to .select() the row after insertion.
-- 3. Refine sales_invoices INSERT policy to handle phone-based authentication.

-- Update Write-Scope Helper
CREATE OR REPLACE FUNCTION public.erp_can_write_scope_text(p_restaurant_id text, p_branch_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.erp_memberships m
    WHERE m.user_id        = auth.uid()
      AND m.status         = 'approved'
      AND m.restaurant_id::text = nullif(p_restaurant_id, '')
      AND (
        m.role IN ('owner', 'manager', 'general_manager', 'employee')
        OR coalesce((m.permissions ->> 'uploadSales')::boolean, false)
      )
      AND (
        m.role = 'owner'
        OR nullif(p_branch_id, '') IS NULL
        OR m.branch_id::text = p_branch_id
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
$function$;

-- Update sales_invoices SELECT Policy
DROP POLICY IF EXISTS erp_permission_select ON public.sales_invoices;
CREATE POLICY erp_permission_select ON public.sales_invoices
  FOR SELECT
  TO authenticated
  USING (
    erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND (
      erp_has_any_permission(ARRAY['viewInvoices', 'viewSales', 'uploadSales'])
    )
    AND (
      (erp_current_role() <> 'supplier')
      OR (supplier_id = erp_current_linked_entity_id())
    )
  );

-- Update daily_sales SELECT Policy
DROP POLICY IF EXISTS erp_permission_select ON public.daily_sales;
CREATE POLICY erp_permission_select ON public.daily_sales
  FOR SELECT
  TO authenticated
  USING (
    erp_can_access_scope_text(restaurant_id, branch_id::text)
    AND (
      erp_has_any_permission(ARRAY['viewSales', 'viewReports', 'uploadSales'])
    )
  );

-- Refine sales_invoices INSERT Policy
DROP POLICY IF EXISTS erp_scope_insert ON public.sales_invoices;
CREATE POLICY erp_scope_insert ON public.sales_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (restaurant_id IS NOT NULL)
    AND (branch_id IS NOT NULL)
    AND (NULLIF(created_by, '') IS NOT NULL)
    AND (
      erp_can_write_scope_text(restaurant_id::text, branch_id::text)
      OR (
        erp_current_role() = 'general_manager'
        AND erp_can_access_scope_text(restaurant_id::text, branch_id::text)
        AND erp_has_permission('uploadSales')
      )
    )
    AND (
      NULLIF(created_by, '') = COALESCE(auth.jwt() ->> 'email', '')
      OR NULLIF(created_by, '') = COALESCE(auth.jwt() ->> 'phone', '')
      OR NULLIF(created_by, '') = COALESCE((SELECT email FROM public.profiles WHERE id = auth.uid() LIMIT 1), '')
      OR NULLIF(created_by, '') = COALESCE((SELECT phone FROM public.profiles WHERE id = auth.uid() LIMIT 1), '')
    )
  );
