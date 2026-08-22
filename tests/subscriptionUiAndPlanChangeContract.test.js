import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);
const landingPath = new URL('../src/pages/LandingPage.jsx', import.meta.url);
const guardPath = new URL('../src/components/subscription/FeatureRouteGuard.jsx', import.meta.url);
const planChangePath = new URL('../src/supabase/20260814_plan_change_classification.sql', import.meta.url);
const contextPath = new URL('../src/lib/SubscriptionContext.jsx', import.meta.url);
const subscriptionBoundaryPath = new URL('../src/components/subscription/SubscriptionErrorBoundary.jsx', import.meta.url);
const reactivationMigrationPath = new URL('../src/supabase/20260816_normal_subscription_reactivation_hardening.sql', import.meta.url);
const paymentIntentIdempotencyMigrationPath = new URL('../src/supabase/20260817_manual_iban_payment_intent_idempotency.sql', import.meta.url);

describe('subscription UI and plan-change contract', () => {
  it('uses the owner-only manual IBAN intent and payment-proof workflow rather than an obsolete permanent Free or mock-payment UI path', async () => {
    const [billing, context] = await Promise.all([
      readFile(billingPath, 'utf8'),
      readFile(contextPath, 'utf8'),
    ]);
    expect(billing).toContain('!canManageBilling ? <Button className="w-full" disabled>{copy.ownerOnly}</Button>');
    expect(billing).toContain('beginManualPayment(item.id)');
    expect(billing).toContain('submitManualPaymentProof(manualPayment?.payment_id || pendingPaymentId, paymentReference, paymentProof)');
    expect(billing).not.toContain('selectFreePlan');
    expect(context).toContain("create_manual_iban_payment_intent");
    expect(context).toContain("submit_manual_iban_payment_proof");
  });

  it('renders landing pricing only from canonical public plan data through the shared pricing component', async () => {
    const landing = await readFile(landingPath, 'utf8');
    expect(landing).toContain("from('subscription_plans')");
    expect(landing).toContain(".eq('is_public', true)");
    expect(landing).toContain('PUBLIC_PLAN_FIELDS');
    expect(landing).toContain('<PublicPricingCards');
  });

  it('uses the canonical monthly price as the final discounted amount on Billing while retaining the original amount and badge', async () => {
    const [billing, context] = await Promise.all([
      readFile(billingPath, 'utf8'),
      readFile(contextPath, 'utf8'),
    ]);
    expect(context).toContain('monthly_price_cents, original_price_cents, discount_percent, discount_active, discount_label');
    expect(billing).toContain('const discount = Boolean(item.discount_active) && Number(item.original_price_cents) > Number(item.monthly_price_cents);');
    expect(billing).toContain('item.discount_label || `-${item.discount_percent}%`');
    expect(billing).toContain('{copy.original}: {money(item.original_price_cents)}');
    expect(billing).toContain('{copy.final}: {money(item.monthly_price_cents)}');
  });

  it('classifies higher and lower paid plan selections without activating either before confirmation', async () => {
    const sql = await readFile(planChangePath, 'utf8');
    expect(sql).toContain("THEN 'plan_downgrade_selected'");
    expect(sql).toContain("THEN 'plan_upgrade_selected'");
    expect(sql).toContain("subscription_status = 'PENDING_PAYMENT'");
    expect(sql).toContain("'change_type', v_change_type");
  });

  it('waits for tenant readiness before loading subscription data and exposes retryable errors', async () => {
    const [billing, context, app] = await Promise.all([
      readFile(billingPath, 'utf8'),
      readFile(contextPath, 'utf8'),
      readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    ]);
    expect(context).toContain('const { activeRestaurant, loadingRestaurants, loadingPortalIdentity } = useTenant();');
    expect(context).toContain('if (isLoadingAuth || loadingRestaurants || loadingPortalIdentity) return null;');
    expect(context).toContain('const tenantReady = !isLoadingAuth && !loadingRestaurants');
    expect(app).toContain('<TenantProvider>');
    expect(app).toContain('<SubscriptionProvider>');
    expect(billing).toContain('role="alert"');
    expect(billing).toContain('onClick={refresh}');
    expect(billing).toContain('Loading subscription');
    expect(context).toContain('tenantReady, user?.id]);');
    expect(context).toContain('summaryRef.current?.found ? summaryRef.current : EMPTY_SUMMARY');
    expect(context).toContain("window.addEventListener('focus', refreshWhenVisible)");
    expect(billing).toContain('paymentIntentInFlight.current');
  });

  it('keeps the canonical snapshot visible if secondary billing data fails instead of forcing a paywall flash', async () => {
    const context = await readFile(contextPath, 'utf8');
    expect(context).toContain('if (planResult.error) setError(normalizeError(planResult.error));');
    expect(context).toContain('if (!summaryRef.current?.found) setLoading(true);');
    expect(context).toContain('setSummary((previous) => previous?.found ? previous : EMPTY_SUMMARY);');
  });

  it('uses a locked, server-side idempotent Manual IBAN payment intent for repeat requests', async () => {
    const migration = await readFile(paymentIntentIdempotencyMigrationPath, 'utf8');
    expect(migration).toContain('WHERE restaurant_id = v_restaurant_id\n  FOR UPDATE;');
    expect(migration).toContain("AND status = 'pending'");
    expect(migration).toContain('IF v_existing_payment.plan_id = v_plan.id THEN');
    expect(migration).toContain("'reused', true");
    expect(migration).toContain("MESSAGE = 'PENDING_PAYMENT_REVIEW_REQUIRED'");
  });

  it('routes inactive paid subscriptions through the server-authoritative payment-required reactivation flow', async () => {
    const [billing, migration] = await Promise.all([
      readFile(billingPath, 'utf8'),
      readFile(reactivationMigrationPath, 'utf8'),
    ]);
    expect(billing).toContain("['CANCELED', 'EXPIRED', 'PAST_DUE'].includes(status)");
    expect(billing).toContain('const intent = await renewSubscription();');
    expect(billing).toContain('getManualPaymentInstructions()');
    expect(billing).toContain('reactivationRequiresPayment');
    expect(billing).toContain('Reactivate with payment');
    expect(migration).toContain("v_subscription.subscription_status NOT IN ('CANCELED', 'EXPIRED', 'PAST_DUE')");
    expect(migration).toContain("'REACTIVATION_PLAN_SELECTION_REQUIRED'");
    expect(migration).toContain("'PENDING_PAYMENT'");
    expect(migration).toContain("'reactivation_payment_requested'");
    expect(migration).toContain("'manual_payment'");
  });

  it('clears cancellation markers on payment-request reactivation and approved payment without granting Active status early', async () => {
    const migration = await readFile(reactivationMigrationPath, 'utf8');
    expect(migration).toContain('cancel_at_period_end = false');
    expect(migration).toContain('canceled_at = NULL');
    expect(migration).toContain("'Manual IBAN reactivation pending review'");
    expect(migration).toContain("'subscription_status', 'PENDING_PAYMENT'");
    expect(migration).toContain('subscription_status = v_status');
    expect(migration).toContain("v_status := CASE WHEN p_approve THEN 'ACTIVE' ELSE 'PAST_DUE' END;");
    expect(migration).toContain("status = 'superseded'");
  });

  it('isolates Billing render failures with a retryable subscription boundary in every access state', async () => {
    const [app, boundary] = await Promise.all([
      readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
      readFile(subscriptionBoundaryPath, 'utf8'),
    ]);
    expect(app).toContain("import SubscriptionErrorBoundary from '@/components/subscription/SubscriptionErrorBoundary';");
    expect(app).toContain('<SubscriptionErrorBoundary><Billing /></SubscriptionErrorBoundary>');
    expect(boundary).toContain('Subscription error');
    expect(boundary).toContain('Retry');
    expect(boundary).toContain('Back to ERP');
  });

  it('keeps a canonical pending Paddle checkout resumable while preserving the Manual IBAN pending lock', async () => {
    const billing = await readFile(billingPath, 'utf8');
    expect(billing).toContain("disabled={Boolean(acting) || (selectedPending && !isPaddleProvider)}");
    expect(billing).toContain("selectedPending ? (isPaddleProvider ? copy.resumeCheckout : copy.pending) : paidAction");
    expect(billing).toContain("resumeCheckout: 'Resume checkout'");
    expect(billing).toContain("resumeCheckout: 'استئناف الدفع'");
    expect(billing).toContain("resumeCheckout: 'ادامه پرداخت'");
  });

  it('localizes the subscription entitlement guard for English, Arabic, and Persian', async () => {
    const guard = await readFile(guardPath, 'utf8');
    expect(guard).toContain('Plan feature required');
    expect(guard).toContain('ميزة الخطة مطلوبة');
    expect(guard).toContain('این قابلیت به طرح بالاتری نیاز دارد');
    expect(guard).toContain("dir={isRTL ? 'rtl' : 'ltr'}");
  });
});
