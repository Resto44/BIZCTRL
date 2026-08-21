import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const landingPath = new URL('../src/pages/LandingPage.jsx', import.meta.url);
const pricingPath = new URL('../src/pages/PublicPages.jsx', import.meta.url);
const registrationPath = new URL('../src/pages/ERPRegister.jsx', import.meta.url);
const loginPath = new URL('../src/pages/ERPLogin.jsx', import.meta.url);
const checkoutPath = new URL('../src/lib/publicPlanCheckout.js', import.meta.url);
const paddleClientPath = new URL('../src/lib/paddle.js', import.meta.url);
const checkoutFunctionPath = new URL('../supabase/functions/paddle-subscription-checkout/index.ts', import.meta.url);
const liveMigrationPath = new URL('../src/supabase/20260821_paddle_live_runtime.sql', import.meta.url);

describe('public plan checkout canonical flow', () => {
  it('routes selected plans from both public pricing surfaces through one shared authenticated checkout handoff', async () => {
    const [landing, pricing, checkout] = await Promise.all([
      readFile(landingPath, 'utf8'),
      readFile(pricingPath, 'utf8'),
      readFile(checkoutPath, 'utf8'),
    ]);

    expect(landing).toContain("import { usePublicPlanCheckout } from '@/lib/publicPlanCheckout';");
    expect(landing).toContain('onStartFree={beginPlanCheckout}');
    expect(pricing).toContain("import { Link, useNavigate, useSearchParams } from 'react-router-dom';");
    expect(pricing).toContain("import { usePublicPlanCheckout } from '@/lib/publicPlanCheckout';");
    expect(pricing).toContain("searchParams.get('checkout_plan')");
    expect(pricing).toContain('void beginPlanCheckout(selectedPlan);');
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
    expect(checkout).toContain('if (!String(plan?.paddle_price_id || \'\').trim())');
    expect(paddleClient).toContain('LIVE_TOKEN_PATTERN');
    expect(paddleClient).toContain("paddleEnvironment() === PADDLE_LIVE && LIVE_TOKEN_PATTERN.test(paddleClientToken())");
    expect(checkoutFunction).toContain('paddle_create_checkout_context');
    expect(checkoutFunction).toContain('if (!paddleApiKey) return fail("PADDLE_LIVE_NOT_CONFIGURED", 503);');
    expect(migration).toContain("subscription_status = 'PENDING_PAYMENT'");
    expect(migration).toContain("'Paddle checkout pending'");
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
