-- Additive owner-only reporting endpoint. Existing dashboard contract stays available.
CREATE OR REPLACE FUNCTION public.platform_owner_dashboard_metrics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_base jsonb;
  v_finance jsonb;
  v_counts jsonb;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  PERFORM public.platform_owner_assert();
  v_base := public.platform_owner_dashboard();

  SELECT coalesce(jsonb_object_agg(status, amount), '{}'::jsonb) INTO v_counts
  FROM (SELECT coalesce(subscription_status, 'UNKNOWN') AS status, count(*) AS amount
        FROM public.subscriptions GROUP BY coalesce(subscription_status, 'UNKNOWN')) s;

  WITH payment_totals AS (
    SELECT coalesce(nullif(upper(trim(currency)), ''), 'UNKNOWN') AS currency,
      coalesce(sum(amount_cents) FILTER (WHERE status = 'paid' AND paid_at >= v_month_start AND paid_at <= now()), 0) AS monthly_collected_cents,
      coalesce(sum(amount_cents) FILTER (WHERE status = 'paid'), 0) AS total_collected_cents,
      coalesce(sum(amount_cents) FILTER (WHERE status = 'pending'), 0) AS pending_cents
    FROM public.subscription_payments GROUP BY 1
  ), plan_totals AS (
    SELECT coalesce(nullif(upper(trim(p.currency)), ''), 'UNKNOWN') AS currency,
      coalesce(sum(p.monthly_price_cents), 0) AS monthly_plan_value_cents
    FROM public.subscriptions s JOIN public.subscription_plans p ON p.id = s.plan
    WHERE s.subscription_status = 'ACTIVE' GROUP BY 1
  ), totals AS (
    SELECT coalesce(p.currency, s.currency) AS currency,
      coalesce(p.monthly_collected_cents, 0) AS monthly_collected_cents,
      coalesce(p.total_collected_cents, 0) AS total_collected_cents,
      coalesce(p.pending_cents, 0) AS pending_cents,
      coalesce(s.monthly_plan_value_cents, 0) AS monthly_plan_value_cents
    FROM payment_totals p FULL JOIN plan_totals s USING(currency)
  ) SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.currency), '[]'::jsonb) INTO v_finance FROM totals t;

  RETURN v_base || jsonb_build_object(
    'generated_at', now(), 'month_start', v_month_start,
    'total_subscriptions', (SELECT count(*) FROM public.subscriptions),
    'subscription_counts', v_counts,
    'financial_by_currency', v_finance,
    'reviewable_payments', (SELECT count(*) FROM public.subscription_payments WHERE status = 'pending' AND nullif(payment_proof_key, '') IS NOT NULL),
    'trials_ending_7_days', (SELECT count(*) FROM public.subscriptions WHERE subscription_status = 'TRIAL' AND trial_end >= (now() AT TIME ZONE 'UTC')::date AND trial_end < (now() AT TIME ZONE 'UTC')::date + 7)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.platform_owner_dashboard_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_owner_dashboard_metrics() TO authenticated;
