-- Restore only the intended authenticated execution rights for the secure recovery
-- state transitions. The functions remain SECURITY DEFINER and independently
-- enforce Platform Owner identity, AAL, AMR, session binding, expiry, and
-- single-use state. Anonymous callers retain no access.

REVOKE ALL ON FUNCTION public.platform_owner_prepare_mfa_recovery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_prepare_mfa_recovery() FROM anon;
REVOKE ALL ON FUNCTION public.platform_owner_begin_mfa_recovery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_begin_mfa_recovery() FROM anon;

GRANT EXECUTE ON FUNCTION public.platform_owner_prepare_mfa_recovery() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_begin_mfa_recovery() TO authenticated;
