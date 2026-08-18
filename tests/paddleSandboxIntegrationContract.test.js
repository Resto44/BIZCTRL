import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const checkoutClientPath = new URL('../src/lib/paddleSandbox.js', import.meta.url);
const checkoutApiPath = new URL('../src/lib/paddleBilling.js', import.meta.url);
const paymentProviderPath = new URL('../src/lib/payment/PaymentProvider.js', import.meta.url);
const pricingPagePath = new URL('../src/pages/PublicPages.jsx', import.meta.url);
const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);
const migrationPath = new URL('../src/supabase/20260818_paddle_sandbox_subscription_runtime.sql', import.meta.url);
const checkoutFunctionPath = new URL('../supabase/functions/paddle-subscription-checkout/index.ts', import.meta.url);
const portalFunctionPath = new URL('../supabase/functions/paddle-customer-portal/index.ts', import.meta.url);
const webhookFunctionPath = new URL('../supabase/functions/paddle-subscription-webhook/index.ts', import.meta.url);
const envTemplatePath = new URL('../docs/paddle-sandbox.env.example', import.meta.url);

describe('Paddle Sandbox integration contract', () => {
  it('initializes official Paddle.js once with only a validated Sandbox client-side token', async () => {
    const client = await readFile(checkoutClientPath, 'utf8');
    expect(client).toContain("import { initializePaddle } from '@paddle/paddle-js';");
    expect(client).toContain("const PADDLE_SANDBOX = 'sandbox';");
    expect(client).toContain('SANDBOX_TOKEN_PATTERN');
    expect(client).toContain('initializePaddle({');
    expect(client).toContain('environment: PADDLE_SANDBOX');
    expect(client).toContain('transactionId: safeTransactionId');
    expect(client).not.toContain('PADDLE_API_KEY');
    expect(client).not.toContain('PADDLE_WEBHOOK_SECRET');
  });

  it('uses server-created Paddle transactions rather than browser-selected items, prices, or tenant IDs', async () => {
    const [clientApi, checkoutFunction, migration] = await Promise.all([
      readFile(checkoutApiPath, 'utf8'),
      readFile(checkoutFunctionPath, 'utf8'),
      readFile(migrationPath, 'utf8'),
    ]);
    expect(clientApi).toContain("supabase.functions.invoke('paddle-subscription-checkout'");
    expect(clientApi).toContain('openPaddleSandboxTransaction(data.transactionId)');
    expect(checkoutFunction).toContain('paddle_create_checkout_context');
    expect(checkoutFunction).toContain('https://sandbox-api.paddle.com');
    expect(checkoutFunction).toContain('items: [{ price_id: context.paddle_price_id, quantity: 1 }]');
    expect(checkoutFunction).toContain('bizctrl_restaurant_id');
    expect(checkoutFunction).toContain('bizctrl_user_id');
    expect(migration).toContain('paddle_link_checkout_transaction');
    expect(migration).toContain("MESSAGE = 'PADDLE_EVENT_TENANT_MISMATCH'");
    expect(migration).toContain("MESSAGE = 'PADDLE_EVENT_PRICE_MISMATCH'");
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
  });

  it('deduplicates by Paddle event ID and resolves out-of-order events by their occurrence timestamp', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('paddle_event_occurred_at timestamptz');
    expect(migration).toContain('subscriptions_paddle_subscription_unique_idx');
    expect(migration).toContain('subscription_payments_paddle_transaction_unique_idx');
    expect(migration).toContain('provider_event_id = p_event_id');
    expect(migration).toContain("'duplicate_event'");
    expect(migration).toContain('v_subscription.paddle_event_occurred_at > v_event_time');
    expect(migration).toContain("'stale_event'");
  });

  it('uses Paddle’s hosted portal for Paddle-backed billing management and preserves existing manual billing as a safe fallback', async () => {
    const [provider, billing, portal] = await Promise.all([
      readFile(paymentProviderPath, 'utf8'),
      readFile(billingPath, 'utf8'),
      readFile(portalFunctionPath, 'utf8'),
    ]);
    expect(provider).toContain('class PaddleSandboxPaymentProvider');
    expect(provider).toContain('isPaddleSandboxClientConfigured()');
    expect(provider).toContain('new ManualIbanPaymentProvider(subscriptionApi)');
    expect(billing).toContain('isPaddleSubscription');
    expect(billing).toContain('openPaddlePortal');
    expect(portal).toContain('/portal-sessions');
    expect(portal).toContain('paddle_customer_portal_context');
  });

  it('connects the public pricing page to the secure checkout action after account authentication', async () => {
    const pricing = await readFile(pricingPagePath, 'utf8');
    expect(pricing).toContain("beginPaddleSandboxCheckout(planId)");
    expect(pricing).toContain('/erp-register?owner=1&plan=');
    expect(pricing).toContain('verified Paddle webhook synchronizes your subscription');
    expect(pricing).toContain('enterpriseContactMode');
  });

  it('documents empty Sandbox configuration slots without placing server secrets into a public environment template', async () => {
    const envTemplate = await readFile(envTemplatePath, 'utf8');
    expect(envTemplate).toContain('VITE_PADDLE_ENVIRONMENT=sandbox');
    expect(envTemplate).toContain('VITE_PADDLE_CLIENT_TOKEN=');
    expect(envTemplate).toContain('# PADDLE_API_KEY=');
    expect(envTemplate).toContain('# PADDLE_WEBHOOK_SECRET=');
    expect(envTemplate).not.toMatch(/PADDLE_API_KEY=[^\n#\s]+/);
    expect(envTemplate).not.toMatch(/PADDLE_WEBHOOK_SECRET=[^\n#\s]+/);
  });
});
