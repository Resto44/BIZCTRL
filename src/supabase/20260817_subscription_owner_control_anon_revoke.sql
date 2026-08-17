BEGIN;

-- SECURITY DEFINER functions are intentionally available only to authenticated
-- callers. Each function still performs its own server-side owner/MFA check.
REVOKE EXECUTE ON FUNCTION public.platform_owner_manual_payment_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.platform_owner_save_manual_payment_settings(text, text, text, text, text, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.platform_owner_save_plan(text, text, integer, integer, smallint, jsonb, jsonb, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.platform_owner_archive_user(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.platform_owner_anonymize_user(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.platform_manual_payment_instructions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_manual_iban_payment_intent(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_manual_iban_payment_proof(uuid, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.platform_owner_review_manual_payment(uuid, boolean, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.platform_owner_manual_payment_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_save_manual_payment_settings(text, text, text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_save_plan(text, text, integer, integer, smallint, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_archive_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_anonymize_user(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_manual_payment_instructions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_iban_payment_intent(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_manual_iban_payment_proof(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_review_manual_payment(uuid, boolean, text) TO authenticated;

COMMIT;
