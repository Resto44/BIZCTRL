-- Driver is a personal Wallet account CATEGORY, not an ERP staff grant.
-- This extends only accepted category labels, preserving all financial data,
-- existing Owner-only approval, matching-branch checks and history safeguards.
ALTER TABLE public.business_partners
  DROP CONSTRAINT IF EXISTS business_partners_account_role_check;
ALTER TABLE public.business_partners
  ADD CONSTRAINT business_partners_account_role_check
  CHECK (account_role IN ('partner','manager','employee','supplier','customer','driver'));

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
 IF p_role IS NULL OR p_role NOT IN ('partner','manager','employee','supplier','customer','driver')
  OR p_submit IS NULL OR p_loans IS NULL OR p_custody IS NULL
 THEN RAISE EXCEPTION 'PERSON_INVALID'; END IF;
 IF p_branch IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.branches
  WHERE id=p_branch AND restaurant_id=p.restaurant_id AND is_active
 ) THEN RAISE EXCEPTION 'PERSON_BRANCH_INVALID'; END IF;
 -- No reclassification of a Wallet account with posted financial history.
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

COMMENT ON CONSTRAINT business_partners_account_role_check ON public.business_partners
 IS 'Wallet-only account categories; driver does not confer ERP Driver portal permissions.';
