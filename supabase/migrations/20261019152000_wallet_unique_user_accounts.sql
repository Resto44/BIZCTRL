-- Accounts & Wallet: one verified login may own at most one person account
-- per business. No historical row is deleted, moved, or merged.
-- Existing (restaurant_id,email) constraint continues to enforce email uniqueness.
-- This guard addresses an independent duplicate risk when a verified login is
-- invited at one email and later attempts to join under a different email.
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.business_partners
   WHERE user_id IS NOT NULL
   GROUP BY restaurant_id,user_id
   HAVING count(*)>1
 ) THEN
   RAISE EXCEPTION 'WALLET_DUPLICATE_VERIFIED_ACCOUNT_REVIEW_REQUIRED'
     USING ERRCODE='23505';
 END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS business_partners_one_account_per_verified_user
  ON public.business_partners(restaurant_id,user_id)
  WHERE user_id IS NOT NULL;

-- Read-only, auth.uid()-scoped account directory. Internal IDs are NOT
-- IBANs, bank account numbers, or permission tokens.
CREATE OR REPLACE FUNCTION public.erp_partner_portal_accounts()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,
   'account_reference','WLT-'||upper(replace(p.id::text,'-','')),
   'name',p.name,
   'login_email',u.email,
   'business',r.name,
   'account_role',p.account_role,
   'can_submit',p.can_submit,
   'allow_loans',p.allow_loans,
   'allow_custody',p.allow_custody,
   'branch',b.name
 ) ORDER BY r.name,p.name,p.id),'[]'::jsonb)
 FROM public.business_partners p
 JOIN public.restaurants r ON r.id=p.restaurant_id
 JOIN auth.users u ON u.id=p.user_id
 LEFT JOIN public.branches b ON b.id=p.branch_id
 WHERE auth.uid() IS NOT NULL
  AND p.user_id=auth.uid() AND p.is_active
  AND coalesce(r.is_active,true)
  AND u.email_confirmed_at IS NOT NULL;
$$;

COMMENT ON FUNCTION public.erp_partner_portal_accounts() IS
'Verified-login-scoped approved personal wallet accounts with immutable internal account reference. Does not grant staff ERP access, access to any other wallet, or real bank account credentials.';
