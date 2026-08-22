import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const checkoutClientPath = new URL('../src/lib/paddle.js', import.meta.url);
const checkoutApiPath = new URL('../src/lib/paddleBilling.js', import.meta.url);
const paymentProviderPath = new URL('../src/lib/payment/PaymentProvider.js', import.meta.url);
const landingPagePath = new URL('../src/pages/LandingPage.jsx', import.meta.url);
const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);
const migrationPath = new URL('../src/supabase/20260821_paddle_live_runtime.sql', import.meta.url);
const liveWebhookMigrationPath = new URL('../src/supabase/20260821_paddle_live_webhook_label.sql', import.meta.url);
const customerWebhookMigrationPath = new URL('../src/supabase/20260822_paddle_customer_webhook_mirror.sql', import.meta.url);
const webhookGrantMigrationPath = new URL('../src/supabase/20260822_paddle_webhook_server_only_grants.sql', import.meta.url);
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
    expect(clientApi).toContain("const context = result?.error?.context;");
    expect(clientApi).toContain('context.clone().json().catch(() => null)');
    expect(clientApi).toContain("throw await responseError({ data, error }, 'PADDLE_CHECKOUT_UNAVAILABLE');");
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

  it('keeps payment activation out of browser callbacks and delegates state changes to SDK-verified raw-body webhooks', async () => {
    const [provider, billing, webhook] = await Promise.all([
      readFile(paymentProviderPath, 'utf8'),
      readFile(billingPath, 'utf8'),
      readFile(webhookFunctionPath, 'utf8'),
    ]);
    expect(provider).toContain('Paddle webhooks, not browser callbacks, are authoritative for activation.');
    expect(billing).toContain('after Paddle sends a verified subscription event');
    expect(webhook).toContain('import { Paddle } from "npm:@paddle/paddle-node-sdk@3.10.0";');
    expect(webhook).toContain('const rawBody = await req.text();');
    expect(webhook).toContain('paddle.webhooks.unmarshal(rawBody, webhookSecret, signature)');
    expect(webhook).toContain('PADDLE_SIGNATURE_MISSING');
    expect(webhook).toContain('invalid_signature');
    expect(webhook).toContain('paddle_apply_webhook_event');
    expect(webhook).toContain('paddle_apply_customer_webhook_event');
    expect(webhook).toContain('subscription.trialing');
    expect(webhook).toContain('transaction.payment_failed');
    expect(webhook).toContain('customer.created');
    expect(webhook).toContain('customer.updated');
    expect(webhook).toContain('PADDLE_LIVE_ONLY');
    expect(webhook).not.toContain('JSON.parse(rawBody)');
    expect(webhook).not.toContain('PADDLE_SOURCE_NOT_ALLOWED');
  });

  it('records live webhook events with a production label while retaining the canonical event guards', async () => {
    const migration = await readFile(liveWebhookMigrationPath, 'utf8');
    expect(migration).toContain("display_label = 'Paddle Live ' || p_event_type");
    expect(migration).not.toContain("display_label = 'Paddle Sandbox '");
    expect(migration).toContain("MESSAGE = 'PADDLE_SERVER_ONLY'");
    expect(migration).toContain("RETURN jsonb_build_object('processed', false, 'reason', 'duplicate_event')");
    expect(migration).toContain("MESSAGE = 'PADDLE_EVENT_PRICE_MISMATCH'");
    expect(migration).toContain("MESSAGE = 'PADDLE_EVENT_TENANT_MISMATCH'");
  });

  it('mirrors verified Paddle customer events into the existing canonical subscription records without a duplicate entitlement model', async () => {
    const migration = await readFile(customerWebhookMigrationPath, 'utf8');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.paddle_apply_customer_webhook_event');
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("'customer.created', 'customer.updated'");
    expect(migration).toContain('UPDATE public.subscriptions');
    expect(migration).toContain('billing_email = coalesce(v_email, billing_email)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.paddle_apply_customer_webhook_event');
    expect(migration).toContain('TO service_role');
    expect(migration).not.toContain('CREATE TABLE');
  });

  it('restricts canonical Paddle webhook reconciliation routines to the service role', async () => {
    const grants = await readFile(webhookGrantMigrationPath, 'utf8');
    expect(grants).toContain('REVOKE ALL ON FUNCTION public.paddle_apply_webhook_event');
    expect(grants).toContain('REVOKE ALL ON FUNCTION public.paddle_apply_customer_webhook_event');
    expect(grants).toContain('FROM PUBLIC, anon, authenticated');
    expect(grants).toContain('TO service_role');
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

  it('connects the public landing-page pricing surface to the secure shared checkout action after authentication', async () => {
    const landing = await readFile(landingPagePath, 'utf8');
    expect(landing).toContain("usePublicPlanCheckout");
    expect(landing).toContain('beginPlanCheckout');
    expect(landing).toContain("searchParams.get('checkout_plan')");
    expect(landing).toContain('void beginPlanCheckout(selectedPlan);');
    expect(landing).toContain('enterpriseContactMode');
    expect(landing).not.toContain('Paddle Sandbox');
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

  it('returns checkout errors with the canonical CORS headers so the Billing client can display the server result', async () => {
    const checkoutFunction = await readFile(checkoutFunctionPath, 'utf8');
    expect(checkoutFunction).toContain('function fail(code: string, status = 400, headers: HeadersInit = {})');
    expect(checkoutFunction).toContain('headers: { "Content-Type": "application/json", ...headers }');
    expect(checkoutFunction).toContain('return fail("PADDLE_TRANSACTION_CREATE_FAILED", 502, headers);');
    expect(checkoutFunction).toContain('return fail(contextError?.message ?? "PADDLE_CHECKOUT_CONTEXT_FAILED", 400, headers);');
    expect(checkoutFunction).toContain('SAFE_PADDLE_ERROR_FIELD_PATTERN');
    expect(checkoutFunction).toContain('paddle_error_code: safePaddleErrorField(transactionBody?.error?.code)');
    expect(checkoutFunction).toContain('paddle_error_type: safePaddleErrorField(transactionBody?.error?.type)');
    expect(checkoutFunction).toContain('request_endpoint: "/transactions"');
    expect(checkoutFunction).toContain('environment: PADDLE_ENVIRONMENT');
    expect(checkoutFunction).not.toContain('console.error("[paddle-subscription-checkout] transaction creation failed", transactionBody');
  });

  it('routes an already-linked Paddle customer through the hosted portal and blocks duplicate server checkout contexts', async () => {
    const [provider, billing, guardMigration] = await Promise.all([
      readFile(paymentProviderPath, 'utf8'),
      readFile(billingPath, 'utf8'),
      readFile(new URL('../src/supabase/20260821_paddle_duplicate_subscription_guard.sql', import.meta.url), 'utf8'),
    ]);
    expect(provider).toContain("summary.payment_provider === 'paddle' && summary.paddle_customer_id");
    expect(provider).toContain("flow: 'manage_existing_subscription'");
    expect(provider).toContain('await this.openCustomerPortal()');
    expect(billing).toContain("intent?.flow === 'manage_existing_subscription' && intent?.url");
    expect(billing).toContain('window.location.assign(intent.url)');
    expect(guardMigration).toContain("MESSAGE = 'PADDLE_EXISTING_SUBSCRIPTION_MANAGE_REQUIRED'");
    expect(guardMigration).toContain("MESSAGE = 'PADDLE_PENDING_CHECKOUT_EXISTS'");
    expect(guardMigration).toContain("AND status = 'pending'");
  });
});
