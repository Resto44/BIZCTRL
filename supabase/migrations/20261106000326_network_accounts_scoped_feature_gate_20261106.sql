-- FIX: branch managers must be able to read Network Management accounts for
-- their assigned branch. The original restrictive subscription feature policy
-- called erp_can_access_scope_text(restaurant_id, NULL), an OWNER-only check.
-- This blocked every manager despite a canonical branch_id and an active plan.
--
-- This helper retains BOTH authorization gates: approved tenant/branch
-- membership and active subscription + feature entitlement. Other branch
-- records and owner-only write rules remain inaccessible to managers.
CREATE OR REPLACE FUNCTION public.erp_subscription_feature_branch_row_allowed(
  p_feature text,
  p_restaurant_id text,
  p_branch_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT public.erp_can_access_scope_text(p_restaurant_id, p_branch_id)
     AND EXISTS (
       SELECT 1
       FROM public.subscriptions s
       WHERE s.restaurant_id::text = nullif(p_restaurant_id, '')
         AND public.erp_subscription_has_erp_access(s.restaurant_id)
         AND public.erp_subscription_can_use_feature(p_feature, s.restaurant_id)
     );
$$;

-- SECURITY DEFINER is scoped to this tested predicate and authenticated
-- sessions only. The existing permissive RLS policies still enforce writes.
REVOKE ALL ON FUNCTION public.erp_subscription_feature_branch_row_allowed(text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_subscription_feature_branch_row_allowed(text,text,text)
  TO authenticated;

ALTER POLICY subscription_feature_network_accounts
ON public.network_accounts
USING (
  public.erp_subscription_feature_branch_row_allowed(
    'network_management', restaurant_id, branch_id::text
  )
)
WITH CHECK (
  public.erp_subscription_feature_branch_row_allowed(
    'network_management', restaurant_id, branch_id::text
  )
);

-- Expected live read-only regression:
-- Authenticated approved manager (restaurant c9e3506b / branch 63a92c99):
-- own branch 2 rows, foreign tenants 0, missing branch_id 0.
-- No network_accounts balances, transactions or tenant memberships changed.
