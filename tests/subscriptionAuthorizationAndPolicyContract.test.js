import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const mockMigration = new URL('../src/supabase/20260814_mock_test_payment_provider.sql', import.meta.url);
const featureMigration = new URL('../src/supabase/20260814_subscription_feature_enforcement.sql', import.meta.url);
const driverMigration = new URL('../src/supabase/20260814_driver_feature_enforcement.sql', import.meta.url);

describe('canonical subscription authorization and feature-policy contract', () => {
  it('rejects non-owner TEST MODE payment and lifecycle calls at the backend boundary', async () => {
    const sql = await readFile(mockMigration, 'utf8');
    const functions = ['create_subscription_payment_intent', 'erp_apply_mock_test_payment', 'erp_simulate_subscription_lifecycle'];
    for (const name of functions) {
      const start = sql.indexOf(`FUNCTION public.${name}`);
      const end = sql.indexOf('$$;', start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(sql.slice(start, end)).toContain('PERFORM public.erp_assert_billing_owner(v_restaurant_id);');
    }
    expect(sql).toContain("MESSAGE = 'BILLING_OWNER_REQUIRED'");
    expect(sql).toContain("MESSAGE = 'TEST_MODE_DISABLED'");
  });

  it('uses restrictive database policies for every identified persisted premium module', async () => {
    const featureSql = await readFile(featureMigration, 'utf8');
    const driverSql = await readFile(driverMigration, 'utf8');
    const expectations = [
      ['scheduled_reports', 'scheduled_reports'], ['ocr_logs', 'ocr'], ['product_analytics', 'advanced_analytics'],
      ['network_accounts', 'network_management'], ['network_pos_devices', 'network_management'],
      ['network_transfers', 'network_management'], ['network_reconciliations', 'network_management'],
    ];
    for (const [table, feature] of expectations) {
      expect(featureSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(featureSql).toContain(`erp_subscription_feature_row_allowed('${feature}'`);
    }
    expect(driverSql).toContain('ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;');
    expect(driverSql).toContain("erp_subscription_feature_row_allowed('driver_analytics'");
  });
});
