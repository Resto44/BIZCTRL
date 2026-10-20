-- Production fix 2026-10-20: approval commits were failing with SQLSTATE 42501.
-- The deferred COMMIT-time balance trigger runs as the invoker, not in the
-- SECURITY DEFINER context of erp_bank_wallet_review. The authenticated role
-- deliberately has NO SELECT on wallet postings, so the trigger SELECT fails.
--
-- Execute the deferred invariant as its trusted Postgres function owner instead
-- of granting direct SELECT access to protected tenant wallet tables.
-- Existing balances, pending requests and posted history remain unchanged.
ALTER FUNCTION public.erp_bank_wallet_verify_balanced() SECURITY DEFINER;
ALTER FUNCTION public.erp_bank_wallet_verify_balanced()
 SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.erp_bank_wallet_verify_balanced()
 FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.erp_bank_wallet_verify_balanced() IS
 'Private deferred transaction-commit double-entry invariant, SECURITY DEFINER because authenticated clients have no direct SELECT to immutable wallet postings. Only invoked by the wallet posting constraint trigger.';
