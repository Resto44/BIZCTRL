import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL('../src/supabase/20260814_mock_test_payment_provider.sql', import.meta.url);
const featureMigrationPath = new URL('../src/supabase/20260814_subscription_feature_enforcement.sql', import.meta.url);
const canonicalMigrationPath = new URL('../src/supabase/20260814_canonical_subscription_hardening.sql', import.meta.url);

describe('canonical subscription backend contract', () => {
  it('keeps a paid plan pending until a provider result is explicitly applied', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain("'PENDING_PAYMENT'");
    expect(sql).toContain("'payment_status', 'pending'");
    expect(sql).toContain("SET plan = v_plan.id,");
    expect(sql).toContain("subscription_status = 'PENDING_PAYMENT'");
    expect(sql).toContain("WHEN lower(p_outcome) = 'succeeded' THEN 'ACTIVE'");
  });

  it('requires the organization owner and enabled test mode for all test simulations', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql.match(/PERFORM public\.erp_assert_billing_owner\(v_restaurant_id\);/g)).toHaveLength(3);
    expect(sql.match(/IF NOT public\.erp_subscription_test_mode_enabled\(\) THEN/g)).toHaveLength(2);
    expect(sql).toContain("MESSAGE = 'TEST_MODE_DISABLED'");
  });

  it('marks all Mock/Test payment records and events as TEST ONLY', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain("provider, status, amount_cents,\n    currency, is_test, display_label");
    expect(sql).toContain("'mock_test'");
    expect(sql).toContain("'TEST ONLY — Pending simulated payment'");
    expect(sql).toContain("'TEST ONLY — Simulated successful payment'");
    expect(sql).toContain("'mock_test_provider'");
  });

  it('keeps premium modules behind restrictive server-side policies', async () => {
    const sql = await readFile(featureMigrationPath, 'utf8');
    expect(sql).toContain('AS RESTRICTIVE');
    expect(sql).toContain("erp_subscription_feature_row_allowed('scheduled_reports'");
    expect(sql).toContain("erp_subscription_feature_row_allowed('advanced_analytics'");
    expect(sql).toContain("erp_subscription_feature_row_allowed('network_management'");
  });

  it('enforces usage limits inside a SECURITY DEFINER procedure instead of trusting client-side progress UI', async () => {
    const sql = await readFile(canonicalMigrationPath, 'utf8');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.erp_consume_subscription_usage(');
    expect(sql).toContain("p_metric NOT IN ('pdf_exports', 'ocr_scans', 'storage_mb')");
    expect(sql).toContain('IF coalesce(v_used, 0) + p_amount > v_limit THEN');
    expect(sql).toContain("MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED'");
    expect(sql).toContain('ON CONFLICT (subscription_id, metric, period_start) DO UPDATE');
  });
});
