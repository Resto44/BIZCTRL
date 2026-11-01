-- Legacy Plan Editor save must never reset expanded quotas if a field is omitted.
-- Owner authorization, plan-price validation and audit remain unchanged.
CREATE OR REPLACE FUNCTION public.platform_owner_upsert_plan(p_plan_id text, p_display_name text, p_description text, p_monthly_price_cents integer, p_yearly_price_cents integer, p_currency text, p_billing_period_months smallint, p_trial_days smallint, p_original_price_cents integer, p_feature_flags jsonb, p_limits jsonb, p_is_active boolean, p_is_public boolean, p_sort_order integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_id text := lower(btrim(coalesce(p_plan_id, ''))); v_plan public.subscription_plans;
  v_price integer := coalesce(p_monthly_price_cents, 0); v_original integer := coalesce(p_original_price_cents, v_price);
  v_yearly integer := coalesce(p_yearly_price_cents, 0); v_currency text := upper(btrim(coalesce(p_currency, 'USD')));
  v_discount integer;
  v_existing public.subscription_plans;
BEGIN
  PERFORM public.platform_owner_assert();
  SELECT * INTO v_existing FROM public.subscription_plans WHERE id=v_id;
  IF v_id !~ '^[a-z0-9][a-z0-9_-]{1,62}$' OR nullif(btrim(coalesce(p_display_name, '')), '') IS NULL OR v_price < 0 OR v_original < v_price OR v_yearly < 0 OR v_currency !~ '^[A-Z]{3}$' OR coalesce(p_billing_period_months, 1) NOT BETWEEN 1 AND 12 OR coalesce(p_trial_days, 0) NOT BETWEEN 0 AND 90 OR jsonb_typeof(coalesce(p_feature_flags, '[]'::jsonb)) <> 'array' OR jsonb_typeof(coalesce(p_limits, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_PLAN_INPUT_INVALID';
  END IF;
  v_discount := CASE WHEN v_original > v_price AND v_original > 0 THEN round(((v_original - v_price)::numeric / v_original::numeric) * 100)::integer ELSE 0 END;
  INSERT INTO public.subscription_plans(id, display_name, description, monthly_price_cents, yearly_price_cents, original_price_cents, currency, billing_period_months, trial_days, discount_active, discount_percent, discount_label, feature_flags, entitlement_limits, max_restaurants, max_branches, max_employees, max_users, max_storage_mb, max_pdf_exports, max_ocr_scans, is_active, is_public, sort_order)
  VALUES (v_id, btrim(p_display_name), nullif(btrim(p_description), ''), v_price, v_yearly, v_original, v_currency, coalesce(p_billing_period_months, 1), coalesce(p_trial_days, 0), v_discount > 0, v_discount, CASE WHEN v_discount > 0 THEN v_discount::text || '% OFF' ELSE NULL END, coalesce(p_feature_flags, '[]'::jsonb), coalesce(p_limits, '{}'::jsonb), greatest(1, coalesce((p_limits ->> 'max_restaurants')::integer, v_existing.max_restaurants, 1)), coalesce((p_limits ->> 'branches')::integer, (p_limits ->> 'max_branches')::integer, v_existing.max_branches, 1), coalesce((p_limits ->> 'employees')::integer, (p_limits ->> 'max_employees')::integer, v_existing.max_employees, 1), coalesce((p_limits ->> 'users')::integer, (p_limits ->> 'max_users')::integer, v_existing.max_users, 1), coalesce((p_limits ->> 'storage_mb')::integer, (p_limits ->> 'max_storage_mb')::integer, v_existing.max_storage_mb, 0), coalesce((p_limits ->> 'pdf_exports')::integer, (p_limits ->> 'max_pdf_exports')::integer, v_existing.max_pdf_exports, 0), coalesce((p_limits ->> 'ocr_scans')::integer, (p_limits ->> 'max_ocr_scans')::integer, v_existing.max_ocr_scans, 0), coalesce(p_is_active, true), coalesce(p_is_public, true), coalesce(p_sort_order, 0))
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, monthly_price_cents = EXCLUDED.monthly_price_cents, yearly_price_cents = EXCLUDED.yearly_price_cents, original_price_cents = EXCLUDED.original_price_cents, currency = EXCLUDED.currency, billing_period_months = EXCLUDED.billing_period_months, trial_days = EXCLUDED.trial_days, discount_active = EXCLUDED.discount_active, discount_percent = EXCLUDED.discount_percent, discount_label = EXCLUDED.discount_label, feature_flags = EXCLUDED.feature_flags, entitlement_limits = EXCLUDED.entitlement_limits, max_restaurants = EXCLUDED.max_restaurants, max_branches = EXCLUDED.max_branches, max_employees = EXCLUDED.max_employees, max_users = EXCLUDED.max_users, max_storage_mb = EXCLUDED.max_storage_mb, max_pdf_exports = EXCLUDED.max_pdf_exports, max_ocr_scans = EXCLUDED.max_ocr_scans, is_active = EXCLUDED.is_active, is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order, updated_at = now()
  RETURNING * INTO v_plan;
  PERFORM public.platform_owner_log('plan_upserted', 'plan', v_id, NULL, jsonb_build_object('price_cents', v_price, 'active', v_plan.is_active, 'public', v_plan.is_public));
  RETURN to_jsonb(v_plan);
END;
$function$
;