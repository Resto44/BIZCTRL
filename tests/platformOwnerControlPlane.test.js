import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const appPath = new URL('../src/App.jsx', import.meta.url);
const portalPath = new URL('../src/pages/PlatformOwnerPortal.jsx', import.meta.url);
const loginPath = new URL('../src/pages/PlatformOwnerLogin.jsx', import.meta.url);
const appUrlPath = new URL('../src/lib/appUrl.js', import.meta.url);
const apiPath = new URL('../src/lib/platformOwnerApi.js', import.meta.url);
const controlPlanePath = new URL('../src/supabase/20260815_platform_owner_control_plane.sql', import.meta.url);
const managementPath = new URL('../src/supabase/20260815_platform_owner_management_routines.sql', import.meta.url);
const proofPath = new URL('../src/supabase/20260815_manual_iban_payment_proofs.sql', import.meta.url);
const hardeningPath = new URL('../src/supabase/20260815_platform_owner_hardening.sql', import.meta.url);
const explicitRlsPath = new URL('../src/supabase/20260815_platform_owner_explicit_rls.sql', import.meta.url);
const revokePrivilegesPath = new URL('../src/supabase/20260815_platform_owner_revoke_direct_privileges.sql', import.meta.url);
const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);

describe('Platform Owner control plane', () => {
  it('keeps the Platform Owner route outside the customer ERP layout and replaces the legacy super-admin route', async () => {
    const app = await readFile(appPath, 'utf8');
    expect(app).toContain('path="/platform-owner/login"');
    expect(app).toContain('path="/platform-owner/*"');
    expect(app).toContain('<Route path="/super-admin" element={<Navigate to="/platform-owner/login" replace />} />');
    expect(app).not.toContain('<Route path="/super-admin" element={<SuperAdmin />} />');
  });

  it('uses the verified custom production domain for recovery redirects without retaining the legacy URL', async () => {
    const [login, appUrl] = await Promise.all([readFile(loginPath, 'utf8'), readFile(appUrlPath, 'utf8')]);
    expect(login).toContain('getPlatformOwnerRecoveryRedirectUrl()');
    expect(login).not.toContain('window.location.origin}/platform-owner/login?mode=recovery');
    expect(appUrl).toContain("const PRODUCTION_APP_URL = import.meta.env.VITE_PUBLIC_APP_URL || 'https://mybizctrl.site';");
    expect(appUrl).toContain('if (import.meta.env.PROD) return PRODUCTION_APP_URL;');
    expect(appUrl).not.toContain('base44-rest-ctrl.vercel.app');
  });

  it('requires a dedicated platform owner account and never derives global access from an organization owner role or client environment variable', async () => {
    const [sql, portal] = await Promise.all([readFile(controlPlanePath, 'utf8'), readFile(portalPath, 'utf8')]);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.platform_owner_accounts');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.platform_owner_assert()');
    expect(sql).toContain("MESSAGE = 'PLATFORM_OWNER_REQUIRED'");
    expect(sql).not.toContain("pr.role = 'owner'");
    expect(portal).not.toContain('VITE_SUPER_ADMIN_EMAIL');
  });

  it('extends canonical subscriptions and payments with manual IBAN review instead of creating duplicate billing tables', async () => {
    const sql = await readFile(controlPlanePath, 'utf8');
    expect(sql).toContain('ALTER TABLE public.subscription_payments');
    expect(sql).toContain("provider = 'manual_iban'");
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_manual_iban_payment_intent');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.platform_owner_review_manual_payment');
    expect(sql).toContain("subscription_status = v_status");
    expect(sql).toContain("v_status := CASE WHEN p_approve THEN 'ACTIVE' ELSE 'PAST_DUE' END");
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.platform_subscriptions');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.platform_payments');
  });

  it('creates restricted payment-proof storage and a manual-payment snapshot for billing owners', async () => {
    const [proof, billing] = await Promise.all([readFile(proofPath, 'utf8'), readFile(billingPath, 'utf8')]);
    expect(proof).toContain("'payment-proofs'");
    expect(proof).toContain('payment_proofs_owner_upload');
    expect(proof).toContain('payment_proofs_owner_read');
    expect(proof).toContain("provider IN ('manual_iban', 'mock_test')");
    expect(billing).toContain('submitManualPaymentProof');
    expect(billing).toContain('Manual IBAN payment');
  });

  it('retires the permanent Free entitlement while preserving history and exposes management routines for plans, promotions, subscriptions, and activity logs', async () => {
    const [controlPlane, management] = await Promise.all([readFile(controlPlanePath, 'utf8'), readFile(managementPath, 'utf8')]);
    expect(controlPlane).toContain("SET subscription_status = 'EXPIRED'");
    expect(controlPlane).toContain("WHERE id = 'free'");
    expect(management).toContain('platform_owner_list_plans');
    expect(management).toContain('platform_owner_save_promotion');
    expect(management).toContain('platform_owner_set_subscription_status');
    expect(management).toContain('platform_owner_list_activity_logs');
  });

  it('renders a multilingual responsive control-plane navigation and separate owner login', async () => {
    const [portal, login, api] = await Promise.all([readFile(portalPath, 'utf8'), readFile(loginPath, 'utf8'), readFile(apiPath, 'utf8')]);
    expect(portal).toMatch(/fa:\s*\{\s*dashboard: 'داشبورد'/);
    expect(portal).toMatch(/ar:\s*\{\s*dashboard: 'لوحة التحكم'/);
    expect(portal).toContain('lg:hidden');
    expect(portal).toContain('md:hidden');
    expect(login).toContain('Platform Owner sign in');
    expect(api).toContain('platform_owner_session_snapshot');
  });

  it('allows platform-owner grants only through a service-role routine and enforces first-time promotions in the manual payment intent', async () => {
    const hardening = await readFile(hardeningPath, 'utf8');
    expect(hardening).toContain('platform_owner_provision');
    expect(hardening).toContain("auth.role() <> 'service_role'");
    expect(hardening).toContain("MESSAGE = 'PLATFORM_OWNER_PROVISION_SERVICE_ROLE_ONLY'");
    expect(hardening).toContain('NOT promotion.first_time_only OR NOT EXISTS');
    expect(hardening).toContain("prior_payment.status = 'paid'");
  });

  it('blocks direct authenticated access to every Platform Owner table through explicit RLS policies', async () => {
    const rls = await readFile(explicitRlsPath, 'utf8');
    for (const table of ['platform_owner_accounts', 'platform_owner_activity_logs', 'platform_manual_payment_settings', 'platform_promotions', 'subscription_feature_overrides']) {
      expect(rls).toContain(`${table}_deny_direct`);
    }
    expect(rls).toContain('AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false)');
  });

  it('revokes direct anonymous and authenticated table privileges while retaining guarded RPC access', async () => {
    const revocations = await readFile(revokePrivilegesPath, 'utf8');
    for (const table of ['platform_owner_accounts', 'platform_owner_activity_logs', 'platform_manual_payment_settings', 'platform_promotions', 'subscription_feature_overrides']) {
      expect(revocations).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated;`);
    }
  });
});
