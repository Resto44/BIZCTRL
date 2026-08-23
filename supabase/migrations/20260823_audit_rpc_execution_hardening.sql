-- Production audit hardening: remove public execution from state-changing
-- SECURITY DEFINER maintenance/financial routines while retaining the one
-- authenticated application workflow that uses supplier-invoice rollback.
-- Both functions retain their existing in-function authorization checks.

ALTER FUNCTION public.backfill_cash_register_data(date, date)
  SET search_path TO public, pg_temp;
REVOKE ALL ON FUNCTION public.backfill_cash_register_data(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_cash_register_data(date, date) FROM anon, authenticated;

ALTER FUNCTION public.delete_supplier_invoice_with_rollback(uuid)
  SET search_path TO public, pg_temp;
REVOKE ALL ON FUNCTION public.delete_supplier_invoice_with_rollback(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_supplier_invoice_with_rollback(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_supplier_invoice_with_rollback(uuid) TO authenticated;
