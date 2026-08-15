import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const appPath = new URL('../src/App.jsx', import.meta.url);
const harnessPath = new URL('../src/pages/dev/BillingVisualHarness.jsx', import.meta.url);
const providerPath = new URL('../src/lib/payment/PaymentProvider.js', import.meta.url);
const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);
const mockPaymentMigrationPath = new URL('../src/supabase/20260814_mock_test_payment_provider.sql', import.meta.url);

describe('production safety', () => {
  it('registers the Billing visual fixture only in development builds', async () => {
    const app = await readFile(appPath, 'utf8');
    expect(app).toContain("const BillingVisualHarness = import.meta.env.DEV");
    expect(app).toContain("import.meta.env.DEV && BillingVisualHarness && <Route path=\"/__test/billing\"");
  });

  it('keeps the visual fixture inert and labels it non-production', async () => {
    const harness = await readFile(harnessPath, 'utf8');
    expect(harness).toContain('TEST ONLY — Non-production visual validation');
    expect(harness).toContain('TEST FIXTURE ONLY');
    expect(harness).not.toContain('createCheckout(');
    expect(harness).not.toContain('verifyPayment(');
  });

  it('keeps Mock/Test available only as an explicit adapter while manual IBAN is the active production billing provider', async () => {
    const provider = await readFile(providerPath, 'utf8');
    expect(provider).toContain("this.id = 'mock_test'");
    expect(provider).toContain("this.id = 'manual_iban'");
    expect(provider).toContain('return new ManualIbanPaymentProvider(subscriptionApi)');
    expect(provider).not.toContain('stripe');
  });

  it('keeps TEST MODE disabled by default and removes simulation controls from the production Billing UI', async () => {
    const [billing, sql] = await Promise.all([
      readFile(billingPath, 'utf8'),
      readFile(mockPaymentMigrationPath, 'utf8'),
    ]);
    expect(sql).toContain('enabled boolean NOT NULL DEFAULT false');
    expect(sql.match(/PERFORM public\.erp_assert_billing_owner\(v_restaurant_id\);/g)).toHaveLength(3);
    expect(sql).toContain("MESSAGE = 'TEST_MODE_DISABLED'");
    expect(billing).toContain('submitManualPaymentProof');
    expect(billing).not.toContain('provider.verifyPayment(');
    expect(billing).not.toContain('provider.simulateLifecycle(');
  });
});
