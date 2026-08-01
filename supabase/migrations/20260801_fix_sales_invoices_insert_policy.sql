-- Fix: "permission denied for table users"
-- The erp_scope_insert policy on sales_invoices was querying auth.users directly,
-- which is not accessible to regular authenticated users (anon/authenticated roles).
-- Solution: Replace the auth.users subquery with public.profiles which has proper RLS.

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
      -- Use JWT email (fast, no extra query) OR profiles table (fallback for phone-auth users)
      -- Previously used: SELECT email FROM auth.users WHERE id = auth.uid()
      -- which caused "permission denied for table users" for non-service-role clients.
      NULLIF(created_by, '') = COALESCE(auth.jwt() ->> 'email', '')
      OR NULLIF(created_by, '') = COALESCE((SELECT email FROM public.profiles WHERE id = auth.uid() LIMIT 1), '')
    )
  );
