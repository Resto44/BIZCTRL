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
   'restaurant_id',p.restaurant_id,
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

-- Account category is for presentation/permissions in the personal wallet
-- ONLY. It does not grant ERP supplier/customer records, staff access, POS or
-- bank execution. Any link to the trade ledgers requires a separate review.
ALTER TABLE public.business_partners DROP CONSTRAINT IF EXISTS business_partners_account_role_check;
ALTER TABLE public.business_partners ADD CONSTRAINT business_partners_account_role_check
CHECK (account_role IN ('partner','manager','employee','supplier','customer'));

CREATE OR REPLACE FUNCTION public.erp_configure_person(
 p_id uuid,p_role text,p_branch uuid,p_submit boolean,p_loans boolean,p_custody boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE p public.business_partners;
BEGIN
 SELECT * INTO p FROM public.business_partners WHERE id=p_id FOR UPDATE;
 IF auth.uid() IS NULL OR NOT FOUND OR
  NOT coalesce(public.treasury_account_is_owner(p.restaurant_id),false)
 THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('partner','manager','employee','supplier','customer')
  OR p_submit IS NULL OR p_loans IS NULL OR p_custody IS NULL
 THEN RAISE EXCEPTION 'PERSON_INVALID'; END IF;
 IF p_branch IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.branches
  WHERE id=p_branch AND restaurant_id=p.restaurant_id AND is_active
 ) THEN RAISE EXCEPTION 'PERSON_BRANCH_INVALID'; END IF;
 -- No reclassification of an account with posted financial history.
 IF p.account_role<>p_role AND (
  EXISTS(SELECT 1 FROM public.sponsor_owner_transactions WHERE partner_id=p.id)
  OR EXISTS(SELECT 1 FROM public.people_custody_requests
            WHERE person_id=p.id AND status='approved')
 ) THEN RAISE EXCEPTION 'PERSON_ROLE_HAS_HISTORY'; END IF;
 UPDATE public.business_partners SET account_role=p_role,branch_id=p_branch,
  can_submit=p_submit,allow_loans=p_loans,allow_custody=p_custody WHERE id=p.id;
 INSERT INTO public.audit_logs(restaurant_id,action,entity_type,entity_id,new_values,created_by)
 VALUES(p.restaurant_id,'person_permissions_updated','business_partner',p.id::text,
  jsonb_build_object('role',p_role,'branch',p_branch,'submit',p_submit,'loans',p_loans,'custody',p_custody),
  auth.uid()::text);
END;
$$;
REVOKE ALL ON FUNCTION public.erp_partner_portal_accounts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_partner_portal_accounts() TO authenticated;
