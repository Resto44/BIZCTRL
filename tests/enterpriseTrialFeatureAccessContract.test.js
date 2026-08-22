import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(repoRoot, 'src', 'supabase', '20260822_enterprise_trial_feature_flags.sql');
const rowAccessMigrationPath = path.join(repoRoot, 'src', 'supabase', '20260822_feature_row_access_lifecycle_guard.sql');
const guardPath = path.join(repoRoot, 'src', 'components', 'subscription', 'FeatureRouteGuard.jsx');
const appPath = path.join(repoRoot, 'src', 'App.jsx');

async function readMigration() {
  return readFile(migrationPath, 'utf8');
}

describe('canonical Enterprise trial feature access', () => {
  it('derives a trial subscription feature payload from its active canonical plan', async () => {
    const sql = await readMigration();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.erp_subscription_snapshot(p_restaurant_id uuid DEFAULT NULL)');
    expect(sql).toContain("'feature_flags', coalesce(v_plan.feature_flags, '[]'::jsonb)");
    expect(sql).not.toContain("CASE WHEN v_status = 'TRIAL' THEN '[]'::jsonb");
    expect(sql).toContain("WHERE id = v_subscription.plan\n    AND is_active = true");
    expect(sql).toContain("MESSAGE = 'SUBSCRIPTION_PLAN_INVALID'");
  });

  it('keeps trial expiration and canonical ERP access checks ahead of feature exposure', async () => {
    const sql = await readMigration();
    const expirationCheck = sql.indexOf("IF v_status = 'TRIAL' AND (v_subscription.trial_end IS NULL OR v_subscription.trial_end < current_date) THEN");
    const featureFlags = sql.indexOf("'feature_flags', coalesce(v_plan.feature_flags, '[]'::jsonb)");

    expect(expirationCheck).toBeGreaterThanOrEqual(0);
    expect(expirationCheck).toBeLessThan(featureFlags);
    expect(sql).toContain("UPDATE public.subscriptions SET subscription_status = 'EXPIRED'");
    expect(sql).toContain("'has_erp_access', public.erp_subscription_has_erp_access(v_restaurant_id)");
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.erp_subscription_snapshot(uuid) TO authenticated;');
  });

  it('keeps protected feature rows constrained by tenant scope and canonical lifecycle access', async () => {
    const sql = await readFile(rowAccessMigrationPath, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.erp_subscription_feature_row_allowed(p_feature text, p_restaurant_id text)');
    expect(sql).toContain('public.erp_can_access_scope_text(p_restaurant_id, NULL)');
    expect(sql).toContain('public.erp_subscription_has_erp_access(s.restaurant_id)');
    expect(sql).toContain('public.erp_subscription_can_use_feature(p_feature, s.restaurant_id)');
  });

  it('preserves the same client and server guard path for each affected module', async () => {
    const [guard, app] = await Promise.all([readFile(guardPath, 'utf8'), readFile(appPath, 'utf8')]);

    expect(guard).toContain('isActive && hasFeature(feature)');
    expect(guard).toContain("erp_require_subscription_feature");
    expect(app).toContain('feature="driver_analytics"');
    expect(app).toContain('feature="advanced_analytics"');
    expect(app).toContain('feature="network_management"');
    expect(app).not.toMatch(/plan\s*===\s*['"]enterprise/i);
  });
});
