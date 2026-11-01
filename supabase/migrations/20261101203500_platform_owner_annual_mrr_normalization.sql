-- True normalized MRR: $420 annual is $35/month, not $50/month.
-- Cash collected remains actual paid invoices (monthly cash data unchanged).
CREATE OR REPLACE FUNCTION public.platform_owner_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE v_total_orgs integer; v_active_orgs integer; v_total_users integer; v_active_users integer;
BEGIN
  PERFORM public.platform_owner_assert();
  SELECT count(*)::integer, count(*) FILTER (WHERE is_active)::integer INTO v_total_orgs, v_active_orgs FROM public.restaurants;
  SELECT count(*)::integer, count(*) FILTER (WHERE coalesce(is_active, true) AND coalesce(approval_status, 'approved') = 'approved')::integer INTO v_total_users, v_active_users FROM public.profiles;
  RETURN jsonb_build_object(
    'total_users', v_total_users, 'active_users', v_active_users,
    'new_users', (SELECT count(*) FROM public.profiles WHERE created_date >= current_date),
    'total_organizations', v_total_orgs, 'active_organizations', v_active_orgs,
    'trial_users', (SELECT count(*) FROM public.subscriptions WHERE subscription_status = 'TRIAL'),
    'active_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE subscription_status = 'ACTIVE'),
    'expired_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE subscription_status = 'EXPIRED'),
    'cancelled_subscriptions', (SELECT count(*) FROM public.subscriptions WHERE subscription_status = 'CANCELED'),
    'pending_payments', (SELECT count(*) FROM public.subscription_payments WHERE status = 'pending'),
    'approved_payments', (SELECT count(*) FROM public.subscription_payments WHERE status = 'paid'),
    'rejected_payments', (SELECT count(*) FROM public.subscription_payments WHERE status = 'rejected'),
    'monthly_recurring_revenue_cents', (SELECT coalesce(sum(CASE WHEN subscription.billing_interval='year'
       THEN round(coalesce(plan.yearly_price_cents,plan.monthly_price_cents*12)::numeric/12)
       ELSE plan.monthly_price_cents END), 0)
       FROM public.subscriptions subscription
       JOIN public.subscription_plans plan ON plan.id=subscription.plan
       WHERE subscription.subscription_status='ACTIVE'),
    'monthly_revenue_cents', (SELECT coalesce(sum(amount_cents), 0) FROM public.subscription_payments WHERE status = 'paid' AND paid_at >= date_trunc('month', now())),
    'total_revenue_cents', (SELECT coalesce(sum(amount_cents), 0) FROM public.subscription_payments WHERE status = 'paid'),
    'active_promotions', (SELECT count(*) FROM public.platform_promotions WHERE is_active AND starts_at <= now() AND ends_at >= now()),
    'trial_conversion_rate', (SELECT CASE WHEN count(*) FILTER (WHERE subscription_status IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELED', 'PAST_DUE')) = 0 THEN 0 ELSE round(100.0 * count(*) FILTER (WHERE subscription_status = 'ACTIVE') / count(*) FILTER (WHERE subscription_status IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELED', 'PAST_DUE')), 2) END FROM public.subscriptions)
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.platform_owner_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
      coalesce(sum(CASE WHEN s.billing_interval='year'
             THEN round(coalesce(p.yearly_price_cents,p.monthly_price_cents*12)::numeric/12)
             ELSE p.monthly_price_cents END), 0) AS monthly_plan_value_cents
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
$function$
;
