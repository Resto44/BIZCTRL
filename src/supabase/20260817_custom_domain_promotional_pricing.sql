-- Applies the verified custom-domain promotional price schedule.
-- Existing subscriptions and historical payment amounts are preserved; new payment intents
-- read the active public plan catalog values below.

UPDATE public.subscription_plans
SET
  monthly_price_cents = CASE id
    WHEN 'starter_20' THEN 1000
    WHEN 'growth_40' THEN 2000
    WHEN 'enterprise_100' THEN 5000
    ELSE monthly_price_cents
  END,
  original_price_cents = CASE id
    WHEN 'starter_20' THEN 4000
    WHEN 'growth_40' THEN 8000
    WHEN 'enterprise_100' THEN 20000
    ELSE original_price_cents
  END,
  discount_percent = CASE id
    WHEN 'starter_20' THEN 75
    WHEN 'growth_40' THEN 75
    WHEN 'enterprise_100' THEN 75
    ELSE discount_percent
  END,
  discount_active = CASE id
    WHEN 'starter_20' THEN true
    WHEN 'growth_40' THEN true
    WHEN 'enterprise_100' THEN true
    ELSE discount_active
  END,
  discount_label = CASE id
    WHEN 'starter_20' THEN '75% OFF'
    WHEN 'growth_40' THEN '75% OFF'
    WHEN 'enterprise_100' THEN '75% OFF'
    ELSE discount_label
  END,
  trial_days = CASE id
    WHEN 'starter_20' THEN 30
    WHEN 'growth_40' THEN 0
    WHEN 'enterprise_100' THEN 0
    ELSE trial_days
  END,
  billing_period_months = 1,
  updated_at = now()
WHERE id IN ('starter_20', 'growth_40', 'enterprise_100');
