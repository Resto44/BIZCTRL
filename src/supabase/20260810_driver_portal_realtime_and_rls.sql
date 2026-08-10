-- Driver portal and owner analytics hardening
--
-- Scope:
--   1. Drivers can read only their own driver-related rows.
--   2. Owners and authorized staff retain restaurant/branch access through the
--      existing ERP scope helpers.
--   3. Driver record changes are published through Supabase Realtime so the
--      Owner Dashboard receives updates immediately.

-- The prior branch-only policy allowed a driver to read every delivery order
-- assigned to their branch. The dedicated policy below already scopes a driver
-- to their linked entity, so remove the permissive overlap.
DROP POLICY IF EXISTS delivery_orders_branch_isolation ON public.delivery_orders;

-- Driver directory: self for drivers; organization scope for owners/staff.
DROP POLICY IF EXISTS erp_scope_select ON public.drivers;
CREATE POLICY driver_directory_self_or_scope_select
  ON public.drivers
  FOR SELECT
  TO authenticated
  USING (
    erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND (
      erp_current_role() <> 'driver'
      OR id = erp_current_linked_entity_id()
    )
  );

-- These tables previously had branch-only SELECT access. Preserve normal
-- organization access, but restrict the driver role to its linked driver_id.
DROP POLICY IF EXISTS erp_scope_select ON public.driver_debts;
CREATE POLICY driver_debts_self_or_scope_select
  ON public.driver_debts
  FOR SELECT
  TO authenticated
  USING (
    erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND (
      erp_current_role() <> 'driver'
      OR driver_id = erp_current_linked_entity_id()
    )
  );

DROP POLICY IF EXISTS erp_scope_select ON public.driver_sales_entries;
CREATE POLICY driver_sales_entries_self_or_scope_select
  ON public.driver_sales_entries
  FOR SELECT
  TO authenticated
  USING (
    erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND (
      erp_current_role() <> 'driver'
      OR driver_id = erp_current_linked_entity_id()
    )
  );

-- Realtime publication is deliberately limited to tables with restaurant_id;
-- this matches the Owner Dashboard's restaurant-filtered subscription.
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'drivers',
    'delivery_orders',
    'driver_shifts',
    'driver_settlements',
    'driver_debts',
    'driver_sales_entries',
    'driver_locations'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
    END IF;
  END LOOP;
END
$$;
