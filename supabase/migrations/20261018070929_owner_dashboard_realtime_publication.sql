-- Publish dashboard source changes. Existing SELECT RLS remains authoritative;
-- no grants, policies or business records are changed by this migration.
DO $migration$
DECLARE
  table_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'supabase_realtime publication is required';
  END IF;
  FOREACH table_name IN ARRAY ARRAY[
    'daily_sales', 'supplier_invoices', 'expenses', 'expense_categories',
    'products', 'inventory', 'inventory_transactions', 'product_price_history',
    'debt_records', 'wallet_transactions', 'branches'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Expected RLS-protected dashboard table: %', table_name;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables p
      WHERE p.pubname = 'supabase_realtime' AND p.schemaname = 'public' AND p.tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$migration$;
