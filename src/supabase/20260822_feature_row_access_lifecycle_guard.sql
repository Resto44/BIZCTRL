-- Protected feature rows must require both tenant scope and the same canonical
-- lifecycle access state used by the route/RPC entitlement boundary.
BEGIN;

CREATE OR REPLACE FUNCTION public.erp_subscription_feature_row_allowed(p_feature text, p_restaurant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.erp_can_access_scope_text(p_restaurant_id, NULL)
     AND EXISTS (
       SELECT 1
       FROM public.subscriptions s
       WHERE s.restaurant_id::text = nullif(p_restaurant_id, '')
         AND public.erp_subscription_has_erp_access(s.restaurant_id)
         AND public.erp_subscription_can_use_feature(p_feature, s.restaurant_id)
     );
$$;

COMMIT;
