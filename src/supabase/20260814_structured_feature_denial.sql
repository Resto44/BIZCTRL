BEGIN;

CREATE OR REPLACE FUNCTION public.erp_require_subscription_feature(p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_restaurant_id uuid := public.auth_user_restaurant_id();
BEGIN
  IF auth.uid() IS NULL OR v_restaurant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_SCOPE_DENIED';
  END IF;
  IF NOT public.erp_subscription_has_erp_access(v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_ACCESS_REQUIRED',
      DETAIL = 'The organization does not currently have ERP access.';
  END IF;
  IF NOT public.erp_subscription_can_use_feature(p_feature, v_restaurant_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_FEATURE_REQUIRED',
      DETAIL = coalesce(p_feature, 'unknown_feature');
  END IF;
  RETURN jsonb_build_object('allowed', true, 'feature', p_feature, 'restaurant_id', v_restaurant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_require_subscription_feature(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_require_subscription_feature(text) TO authenticated;

COMMIT;
