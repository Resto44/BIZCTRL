import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);
const landingPath = new URL('../src/pages/LandingPage.jsx', import.meta.url);
const guardPath = new URL('../src/components/subscription/FeatureRouteGuard.jsx', import.meta.url);
const planChangePath = new URL('../src/supabase/20260814_plan_change_classification.sql', import.meta.url);
const contextPath = new URL('../src/lib/SubscriptionContext.jsx', import.meta.url);

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

  it('renders landing discounts only from canonical public plan data with badge, original price, and final price', async () => {
    const landing = await readFile(landingPath, 'utf8');
    expect(landing).toContain("from('subscription_plans')");
    expect(landing).toContain(".eq('is_public', true)");
    expect(landing).toContain('catalog.discount_label || `-${catalog.discount_percent}%`');
    expect(landing).toContain('pricing.original');
    expect(landing).toContain('pricing.final');
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
  });

  it('localizes the subscription entitlement guard for English, Arabic, and Persian', async () => {
    const guard = await readFile(guardPath, 'utf8');
    expect(guard).toContain('Plan feature required');
    expect(guard).toContain('ميزة الخطة مطلوبة');
    expect(guard).toContain('این قابلیت به طرح بالاتری نیاز دارد');
    expect(guard).toContain("dir={isRTL ? 'rtl' : 'ltr'}");
  });
});
