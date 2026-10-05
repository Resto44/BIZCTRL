-- Managers may create categories only inside their approved assigned branch.
-- Existing owner policies and other write permissions remain unchanged.
DO $migration$
DECLARE category_table text;
BEGIN
  FOREACH category_table IN ARRAY ARRAY['product_categories','expense_categories','sales_categories','online_order_categories']
  LOOP
    EXECUTE format(
      'CREATE POLICY manager_category_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (
        public.erp_can_access_scope_text(restaurant_id::text, branch_id::text)
        AND EXISTS (
          SELECT 1 FROM public.erp_memberships m
          WHERE m.user_id = (SELECT auth.uid())
            AND m.status = ''approved'' AND m.role = ''manager''
            AND m.restaurant_id = %I.restaurant_id
            AND m.branch_id = %I.branch_id
        )
      )', category_table, category_table, category_table
    );
  END LOOP;
END;
$migration$;
