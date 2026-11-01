-- Defense in depth against legacy plan RPCs with stale $20/$40/$100 rates.
-- Catalog price mutations must be explicit, audited provider-synchronized migrations.
-- Safe normal edits: name, resource limits, product features, activation flags.
CREATE OR REPLACE FUNCTION public.erp_protect_linked_paddle_plan_prices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $guard$
BEGIN
  IF (OLD.paddle_price_id IS NOT NULL OR OLD.paddle_annual_price_id IS NOT NULL)
    AND (NEW.monthly_price_cents IS DISTINCT FROM OLD.monthly_price_cents
      OR NEW.yearly_price_cents IS DISTINCT FROM OLD.yearly_price_cents
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.billing_period_months IS DISTINCT FROM OLD.billing_period_months)
  THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='PADDLE_LINKED_PLAN_PRICE_LOCKED';
  END IF;
  RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION public.erp_protect_linked_paddle_plan_prices() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS erp_paddle_linked_plan_price_guard ON public.subscription_plans;
CREATE TRIGGER erp_paddle_linked_plan_price_guard
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.erp_protect_linked_paddle_plan_prices();
