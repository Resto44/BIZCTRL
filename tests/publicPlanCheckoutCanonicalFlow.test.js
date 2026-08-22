import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const appPath = new URL('../src/App.jsx', import.meta.url);
const landingPath = new URL('../src/pages/LandingPage.jsx', import.meta.url);
const layoutPath = new URL('../src/components/marketing/PublicLayout.jsx', import.meta.url);
const registrationPath = new URL('../src/pages/ERPRegister.jsx', import.meta.url);
const loginPath = new URL('../src/pages/ERPLogin.jsx', import.meta.url);
const checkoutPath = new URL('../src/lib/publicPlanCheckout.js', import.meta.url);
const paddleClientPath = new URL('../src/lib/paddle.js', import.meta.url);
const checkoutFunctionPath = new URL('../supabase/functions/paddle-subscription-checkout/index.ts', import.meta.url);
const liveMigrationPath = new URL('../src/supabase/20260821_paddle_live_runtime.sql', import.meta.url);
const pendingPlanSwitchMigrationPath = new URL('../src/supabase/20260822_paddle_pending_checkout_plan_switch.sql', import.meta.url);

describe('public plan checkout canonical flow', () => {
  it('uses the landing page as the only public plan-selection and checkout-resume surface', async () => {
    const [app, landing, layout, checkout] = await Promise.all([
      readFile(appPath, 'utf8'),
      readFile(landingPath, 'utf8'),
      readFile(layoutPath, 'utf8'),
      readFile(checkoutPath, 'utf8'),
    ]);

    expect(app).not.toContain('<Route path="/pricing"');
    expect(app).not.toContain('PricingPage');
    expect(app).toContain("new URLSearchParams(location.search).get('checkout_plan')");
    expect(landing).toContain("import { usePublicPlanCheckout } from '@/lib/publicPlanCheckout';");
    expect(landing).toContain('id="pricing"');
    expect(landing).toContain('onStartFree={beginPlanCheckout}');
    expect(landing).toContain("searchParams.get('checkout_plan')");
    expect(landing).toContain('void beginPlanCheckout(selectedPlan);');
    expect(layout).toContain("href: '/#pricing'");
    expect(layout).toContain('href="/#pricing"');
    expect(checkout).toContain('return safePlanId ? `/?checkout_plan=${encodeURIComponent(safePlanId)}` : \'/#pricing\';');
    expect(checkout).toContain('ownerRegistrationForPlan(planId)');
    expect(checkout).toContain('publicCheckoutReturnTo');
    expect(checkout).toContain('beginPaddleCheckout(planId)');
  });

  it('retains the selected plan across owner registration and sign-in using an internal-only return path', async () => {
    const [registration, login, checkout] = await Promise.all([
      readFile(registrationPath, 'utf8'),
      readFile(loginPath, 'utf8'),
      readFile(checkoutPath, 'utf8'),
    ]);

    expect(registration).toContain("params.get('plan')?.trim()");
    expect(registration).toContain('postAuthenticationDestination');
    expect(registration).toContain('const signInPath = `/erp-login?returnTo=${encodeURIComponent(postAuthenticationDestination)}`;');
    expect(registration).toContain('emailRedirectTo: `${window.location.origin}${ownerRegistrationPath}`');
    expect(registration).toContain('navigate(signInPath)');
    expect(registration).toContain('navigate(postAuthenticationDestination, { replace: true });');
    expect(login).toContain("safeInternalReturnTo(searchParams.get('returnTo'), '')");
    expect(login).toContain('navigate(postAuthenticationDestination || home, { replace: true });');
    expect(checkout).toContain("if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\\\')) return fallback;");
  });

  it('does not create a server checkout context until an actual configured live browser token is available', async () => {
    const [checkout, paddleClient, checkoutFunction, migration] = await Promise.all([
      readFile(checkoutPath, 'utf8'),
      readFile(paddleClientPath, 'utf8'),
      readFile(checkoutFunctionPath, 'utf8'),
      readFile(liveMigrationPath, 'utf8'),
    ]);

    expect(checkout).toContain('if (!isPaddleClientConfigured())');
    expect(checkout).toContain('Your subscription has not been changed.');
    expect(checkout).toContain("if (!String(plan?.paddle_price_id || '').trim())");
    expect(paddleClient).toContain('LIVE_TOKEN_PATTERN');
    expect(paddleClient).toContain("paddleEnvironment() === PADDLE_LIVE && LIVE_TOKEN_PATTERN.test(paddleClientToken())");
    expect(checkoutFunction).toContain('paddle_create_checkout_context');
    expect(checkoutFunction).toContain('if (!paddleApiKey) return fail("PADDLE_LIVE_NOT_CONFIGURED", 503, headers);');
    expect(migration).toContain("subscription_status = 'PENDING_PAYMENT'");
    expect(migration).toContain("'Paddle checkout pending'");
  });

  it('supersedes only a stale cross-plan pending Paddle checkout while reusing a same-plan checkout', async () => {
    const migration = await readFile(pendingPlanSwitchMigrationPath, 'utf8');

    expect(migration).toContain("v_existing_payment.plan_id = v_plan.id");
    expect(migration).toContain("'transaction_id', v_existing_payment.paddle_transaction_id");
    expect(migration).toContain("SET status = 'superseded', updated_at = now()");
    expect(migration).not.toContain('PADDLE_PENDING_CHECKOUT_EXISTS');
    expect(migration).toContain("status = 'pending'");
    expect(migration).toContain("payment_provider = 'paddle'");
  });

  it('keeps payment activation exclusively with the verified provider event path', async () => {
    const [checkout, checkoutFunction] = await Promise.all([
      readFile(checkoutPath, 'utf8'),
      readFile(checkoutFunctionPath, 'utf8'),
    ]);

    expect(checkout).toContain('verified Paddle webhook synchronizes your subscription');
    expect(checkoutFunction).toContain('custom_data:');
    expect(checkoutFunction).toContain('bizctrl_payment_id: context.payment_id');
    expect(checkoutFunction).not.toContain('subscription_status: "ACTIVE"');
  });
});
