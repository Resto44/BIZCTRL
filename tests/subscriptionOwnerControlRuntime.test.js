import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const billingPath = new URL('../src/pages/Billing.jsx', import.meta.url);
const ownerApiPath = new URL('../src/lib/platformOwnerApi.js', import.meta.url);
const ownerPortalPath = new URL('../src/pages/PlatformOwnerPortal.jsx', import.meta.url);
const migrationPath = new URL('../src/supabase/20260817_subscription_owner_control_runtime.sql', import.meta.url);

describe('subscription and owner-control runtime hardening', () => {
  it('renders authoritative payment instructions as text and supports a localized accessible IBAN copy flow', async () => {
    const billing = await readFile(billingPath, 'utf8');
    expect(billing).toContain('navigator.clipboard?.writeText');
    expect(billing).toContain("fallback.select()");
    expect(billing).toContain("copy.ibanCopied");
    expect(billing).toContain("{ibanCopied ? copy.copied : copy.copyIban}");
    expect(billing).toContain('className="select-all break-all font-mono tracking-wide"');
    expect(billing).toContain("billingInstructions.company_name");
    expect(billing).toContain("billingInstructions.payment_reference_rules");
    expect(billing).toContain("IBAN copied successfully");
    expect(billing).toContain("تم نسخ IBAN بنجاح");
    expect(billing).toContain("IBAN با موفقیت کپی شد");
  });

  it('uses only guarded RPCs for owner-managed payment settings, pricing, archive, and anonymization actions', async () => {
    const api = await readFile(ownerApiPath, 'utf8');
    expect(api).toContain("rpc('platform_owner_save_manual_payment_settings'");
    expect(api).toContain("rpc('platform_owner_upsert_plan'");
    expect(api).toContain("rpc('platform_owner_archive_user'");
    expect(api).toContain("rpc('platform_owner_anonymize_user'");
    expect(api).not.toContain("from('platform_manual_payment_settings')");
  });

  it('supplies protected owner UX for current prices, payment settings, archive, and type-to-confirm anonymization', async () => {
    const portal = await readFile(ownerPortalPath, 'utf8');
    expect(portal).toContain('setPlanEditor(plan)');
    expect(portal).toContain('platformOwnerApi.savePlan');
    expect(portal).toContain('platformOwnerApi.saveManualPaymentSettings');
    expect(portal).toContain("'DELETE USER'");
    expect(portal).toContain('platformOwnerApi.anonymizeUser');
    expect(portal).toContain('Archive preserves payment and audit records');
  });

  it('validates IBAN configuration, calculates intent amounts on the server, preserves idempotency, and activates only on owner approval', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain("v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'");
    expect(sql).toContain('PERFORM public.platform_owner_assert();');
    expect(sql).toContain('PERFORM public.erp_assert_billing_owner(v_restaurant_id);');
    expect(sql).toContain('FOR UPDATE;');
    expect(sql).toContain("'reused', true");
    expect(sql).toContain('v_plan.monthly_price_cents - CASE');
    expect(sql).toContain("subscription_status = 'PENDING_PAYMENT'");
    expect(sql).toContain("v_status := CASE WHEN p_approve THEN 'ACTIVE' ELSE 'PAST_DUE' END;");
    expect(sql).toContain('cancel_at_period_end = CASE WHEN p_approve THEN false');
    expect(sql).toContain('canceled_at = CASE WHEN p_approve THEN NULL');
    expect(sql).toContain("'payment_approved'");
  });

  it('protects active Platform Owner accounts and preserves financial records during user retention actions', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain("MESSAGE = 'PLATFORM_OWNER_ACCOUNT_PROTECTED'");
    expect(sql).toContain("btrim(coalesce(p_confirmation, '')) <> 'DELETE USER'");
    expect(sql).toContain("'financial_records_preserved', true");
    expect(sql).not.toContain('DELETE FROM auth.users');
  });
});
