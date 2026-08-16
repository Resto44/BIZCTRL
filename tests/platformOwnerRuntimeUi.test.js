import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const portalPath = new URL('../src/pages/PlatformOwnerPortal.jsx', import.meta.url);
const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);
const apiPath = new URL('../src/lib/platformOwnerApi.js', import.meta.url);
const migrationPath = new URL('../src/supabase/20260816_platform_owner_runtime_ui.sql', import.meta.url);
const privilegeMigrationPath = new URL('../src/supabase/20260816_platform_owner_provision_privilege_hardening.sql', import.meta.url);

describe('Platform Owner runtime UI fixes', () => {
  it('uses a responsive mobile-sheet side that respects RTL and renders data rows in a valid table body', async () => {
    const portal = await readFile(portalPath, 'utf8');
    expect(portal).toContain("side={dir === 'rtl' ? 'right' : 'left'}");
    expect(portal).toContain('<tbody>{children}</tbody>');
    expect(portal).not.toContain('<tbody>{items.map}</tbody>');
  });

  it('provides English, Arabic, and Persian copy for the authenticated owner navigation, reports, payments, and settings', async () => {
    const portal = await readFile(portalPath, 'utf8');
    for (const language of ['en:', 'ar:', 'fa:']) expect(portal).toContain(language);
    for (const phrase of ['Payments & IBAN proofs', 'المدفوعات وإثباتات IBAN', 'پرداخت‌ها و مدارک IBAN', 'Print / Save PDF', 'چاپ / ذخیره PDF', 'طباعة / حفظ PDF']) expect(portal).toContain(phrase);
    expect(portal).toContain('window.print()');
  });

  it('keeps sensitive proof access delegated to the restricted payment-proofs storage policy through short-lived signed URLs', async () => {
    const api = await readFile(apiPath, 'utf8');
    expect(api).toContain("supabase.storage.from('payment-proofs').createSignedUrl(objectKey, 60)");
    expect(api).toContain('PAYMENT_PROOF_NOT_AVAILABLE');
  });

  it('restores IBAN instructions after a pending-payment page reload and localizes proof submission labels', async () => {
    const billing = await readFile(billingPath, 'utf8');
    expect(billing).toContain("status !== 'PENDING_PAYMENT'");
    expect(billing).toContain('const billingInstructions = manualPayment?.instructions || pendingInstructions;');
    expect(billing).toContain("testOnly: 'Test payment'");
    expect(billing).toContain("testOnly: 'دفعة اختبار'");
    expect(billing).toContain("testOnly: 'پرداخت آزمایشی'");
  });

  it('gates all data queries on the authorized server snapshot and exposes query failures', async () => {
    const portal = await readFile(portalPath, 'utf8');
    expect(portal).toContain('const ownerReady = snapshot.isSuccess');
    expect(portal).toContain('enabled: ownerReady && (active === \'dashboard\' || active === \'reports\')');
    expect(portal).toContain('retry: false');
    expect(portal).toContain('snapshot.isError');
    expect(portal).toContain('dashboard.isError');
    expect(portal).toContain('role="alert"');
    expect(portal).toContain('onRetry={() => dashboard.refetch()}');
  });

  it('hardens Platform Owner provisioning to service-role execution only', async () => {
    const migration = await readFile(privilegeMigrationPath, 'utf8');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.platform_owner_provision(uuid, boolean) FROM PUBLIC;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.platform_owner_provision(uuid, boolean) FROM anon;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.platform_owner_provision(uuid, boolean) FROM authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.platform_owner_provision(uuid, boolean) TO service_role;');
  });

  it('adds Owner-only settings retrieval and plan changes through the existing Platform Owner assertion, not direct table access', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.platform_owner_manual_payment_settings()');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.platform_owner_change_subscription_plan(');
    expect(migration.match(/PERFORM public\.platform_owner_assert\(\);/g)?.length).toBe(2);
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.platform_owner_manual_payment_settings() TO authenticated;');
    expect(migration).not.toContain('GRANT ALL ON TABLE');
    expect(migration).not.toContain('VITE_SUPABASE_SERVICE_ROLE');
  });
});
