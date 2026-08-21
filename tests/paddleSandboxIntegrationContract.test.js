import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const checkoutClientPath = new URL('../src/lib/paddle.js', import.meta.url);
const checkoutApiPath = new URL('../src/lib/paddleBilling.js', import.meta.url);
const paymentProviderPath = new URL('../src/lib/payment/PaymentProvider.js', import.meta.url);
const pricingPagePath = new URL('../src/pages/PublicPages.jsx', import.meta.url);
const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);
const migrationPath = new URL('../src/supabase/20260821_paddle_live_runtime.sql', import.meta.url);
const checkoutFunctionPath = new URL('../supabase/functions/paddle-subscription-checkout/index.ts', import.meta.url);
const portalFunctionPath = new URL('../supabase/functions/paddle-customer-portal/index.ts', import.meta.url);
const webhookFunctionPath = new URL('../supabase/functions/paddle-subscription-webhook/index.ts', import.meta.url);
const envTemplatePath = new URL('../.env.example', import.meta.url);

describe('Paddle live integration contract', () => {
  it('initializes official Paddle.js once with only a validated live client-side token and Retain customer ID', async () => {
    const client = await readFile(checkoutClientPath, 'utf8');
    expect(client).toContain("import { initializePaddle } from '@paddle/paddle-js';");
    expect(client).toContain("const PADDLE_LIVE = 'production';");
    expect(client).toContain('LIVE_TOKEN_PATTERN');
    expect(client).toContain('initializePaddle({');
    expect(client).toContain('pwCustomer: safeCustomerId ? { id: safeCustomerId } : {}');
    expect(client).toContain('paddle.Update({ pwCustomer: { id: safeCustomerId } })');
    expect(client).toContain('transactionId: safeTransactionId');
    expect(client).not.toContain('environment:');
    expect(client).not.toContain('PADDLE_API_KEY');
    expect(client).not.toContain('PADDLE_WEBHOOK_SECRET');
  });

  it('uses server-created live Paddle transactions rather than browser-selected items, prices, or tenant IDs', async () => {
    const [clientApi, checkoutFunction, migration] = await Promise.all([
      readFile(checkoutApiPath, 'utf8'),
      readFile(checkoutFunctionPath, 'utf8'),
      readFile(migrationPath, 'utf8'),
    ]);
    expect(clientApi).toContain("supabase.functions.invoke('paddle-subscription-checkout'");
    expect(clientApi).toContain('openPaddleTransaction(data.transactionId, paddleCustomerId)');
    expect(checkoutFunction).toContain('paddle_create_checkout_context');
    expect(checkoutFunction).toContain('https://api.paddle.com');
    expect(checkoutFunction).not.toContain('sandbox-api.paddle.com');
    expect(checkoutFunction).toContain('items: [{ price_id: context.paddle_price_id, quantity: 1 }]');
    expect(checkoutFunction).toContain('bizctrl_restaurant_id');
    expect(checkoutFunction).toContain('bizctrl_user_id');
    expect(checkoutFunction).toContain('bizctrl_environment: "production"');
    expect(migration).toContain("MESSAGE = 'PADDLE_LIVE_PRICE_NOT_CONFIGURED'");
    expect(migration).toContain("'paddle_environment', 'production'");
    expect(migration).toContain("'Paddle checkout pending'");
    expect(migration).toContain("v_plan.monthly_price_cents, 'USD', false, 'Paddle checkout pending'");
  });

  it('keeps payment activation out of browser callbacks and delegates state changes to verified webhooks', async () => {
    const [provider, billing, webhook] = await Promise.all([
      readFile(paymentProviderPath, 'utf8'),
      readFile(billingPath, 'utf8'),
      readFile(webhookFunctionPath, 'utf8'),
    ]);
    expect(provider).toContain('Paddle webhooks, not browser callbacks, are authoritative for activation.');
    expect(billing).toContain('after Paddle sends a verified subscription event');
    expect(webhook).toContain('const rawBody = await req.text();');
    expect(webhook).toContain('verifyPaddleSignature(rawBody, signature, webhookSecret)');
    expect(webhook).toContain('`${timestamp}:${rawBody}`');
    expect(webhook).toContain('safeEqual');
    expect(webhook).toContain('paddle_apply_webhook_event');
    expect(webhook).toContain('subscription.trialing');
    expect(webhook).toContain('transaction.payment_failed');
    expect(webhook).toContain('PADDLE_LIVE_ONLY');
    expect(webhook).toContain('const PADDLE_IPS_URL = "https://api.paddle.com/ips";');
    expect(webhook).toContain('getPaddleIpv4Allowlist');
    expect(webhook).toContain('x-forwarded-for');
    expect(webhook).toContain('PADDLE_SOURCE_NOT_ALLOWED');
    expect(webhook).toContain('PADDLE_IP_ALLOWLIST_UNAVAILABLE');
    expect(webhook).not.toContain('34.237.3.244');
    expect(webhook).not.toContain('34.195.105.136');
    expect(webhook).not.toContain('34.232.58.13');
  });

  it('loads the Paddle source allowlist dynamically and rejects requests with no current approved source address', async () => {
    const webhook = await readFile(webhookFunctionPath, 'utf8');
    expect(webhook).toContain('fetch(PADDLE_IPS_URL');
    expect(webhook).toContain('entry.endsWith("/32")');
    expect(webhook).toContain('if (!allowedOrigin) return json(403, { error: "PADDLE_SOURCE_NOT_ALLOWED" });');
    expect(webhook).toContain('if (ips.length === 0) throw new Error("PADDLE_IP_ALLOWLIST_UNAVAILABLE");');
    expect(webhook).toContain('return json(503, { error: "PADDLE_IP_ALLOWLIST_UNAVAILABLE" });');
  });

  it('continues to use the hosted portal and manual billing fallback while selecting a configured live Paddle provider', async () => {
    const [provider, billing, portal] = await Promise.all([
      readFile(paymentProviderPath, 'utf8'),
      readFile(billingPath, 'utf8'),
      readFile(portalFunctionPath, 'utf8'),
    ]);
    expect(provider).toContain('class PaddlePaymentProvider');
    expect(provider).toContain('isPaddleClientConfigured()');
    expect(provider).toContain('new ManualIbanPaymentProvider(subscriptionApi)');
    expect(provider).toContain("this.id = 'paddle'");
    expect(billing).toContain('isPaddleProvider');
    expect(billing).toContain('openPaddlePortal');
    expect(portal).toContain('/portal-sessions');
    expect(portal).toContain('paddle_customer_portal_context');
    expect(portal).toContain('https://api.paddle.com');
  });

  it('connects the public pricing page to the secure shared checkout action after authentication', async () => {
    const pricing = await readFile(pricingPagePath, 'utf8');
    expect(pricing).toContain("usePublicPlanCheckout");
    expect(pricing).toContain('beginPlanCheckout');
    expect(pricing).toContain("searchParams.get('checkout_plan')");
    expect(pricing).toContain('void beginPlanCheckout(selectedPlan);');
    expect(pricing).toContain('enterpriseContactMode');
    expect(pricing).not.toContain('Paddle Sandbox');
  });

  it('exposes a Paddle customer ID only to the authorized billing owner and documents live-only public configuration', async () => {
    const [migration, envTemplate] = await Promise.all([
      readFile(migrationPath, 'utf8'),
      readFile(envTemplatePath, 'utf8'),
    ]);
    expect(migration).toContain("'paddle_customer_id', CASE WHEN v_can_manage_billing AND v_subscription.payment_provider = 'paddle'");
    expect(envTemplate).toContain('VITE_PADDLE_ENVIRONMENT=production');
    expect(envTemplate).toContain('VITE_PADDLE_CLIENT_TOKEN=');
    expect(envTemplate).toContain('# PADDLE_API_KEY=');
    expect(envTemplate).toContain('# PADDLE_WEBHOOK_SECRET=');
    expect(envTemplate).not.toMatch(/PADDLE_API_KEY=[^\n#\s]+/);
    expect(envTemplate).not.toMatch(/PADDLE_WEBHOOK_SECRET=[^\n#\s]+/);
  });
});
