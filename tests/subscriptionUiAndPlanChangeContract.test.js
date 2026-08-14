import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);
const landingPath = new URL('../src/pages/LandingPage.jsx', import.meta.url);
const guardPath = new URL('../src/components/subscription/FeatureRouteGuard.jsx', import.meta.url);
const planChangePath = new URL('../src/supabase/20260814_plan_change_classification.sql', import.meta.url);
const contextPath = new URL('../src/lib/SubscriptionContext.jsx', import.meta.url);

describe('subscription UI and plan-change contract', () => {
  it('hides Mock/Test simulation controls unless the server-derived viewer is an owner and test mode is enabled', async () => {
    const billing = await readFile(billingPath, 'utf8');
    expect(billing).toContain('canManageBilling && isTestModeEnabled');
    expect(billing).toContain('!canManageBilling ? <Button className="w-full" disabled>{copy.ownerOnly}</Button>');
    expect(billing).toContain("provider.verifyPayment(pendingPaymentId, 'succeeded')");
    expect(billing).toContain("provider.verifyPayment(pendingPaymentId, 'failed')");
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

  it('localizes the subscription entitlement guard for English, Arabic, and Persian', async () => {
    const guard = await readFile(guardPath, 'utf8');
    expect(guard).toContain('Plan feature required');
    expect(guard).toContain('ميزة الخطة مطلوبة');
    expect(guard).toContain('این قابلیت به طرح بالاتری نیاز دارد');
    expect(guard).toContain("dir={isRTL ? 'rtl' : 'ltr'}");
  });
});
