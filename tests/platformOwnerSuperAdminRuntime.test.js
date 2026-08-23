import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const portalPath = new URL('../src/pages/PlatformOwnerPortal.jsx', import.meta.url);
const apiPath = new URL('../src/lib/platformOwnerApi.js', import.meta.url);
const migrationPath = new URL('../src/supabase/20260823_platform_owner_super_admin_runtime.sql', import.meta.url);

describe('Platform Owner super-admin runtime', () => {
  it('keeps modules, global settings, and plan management behind Platform Owner RPC boundaries', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    for (const routine of [
      'platform_owner_list_modules',
      'platform_owner_save_module',
      'platform_owner_upsert_plan',
      'platform_owner_set_tenant_feature_override',
      'platform_owner_save_settings',
      'platform_owner_control_center',
    ]) expect(migration).toContain(routine);
    expect(migration).toContain('PERFORM public.platform_owner_assert();');
    expect(migration).toContain('REVOKE ALL ON TABLE public.platform_modules, public.platform_settings FROM anon, authenticated;');
    expect(migration).not.toContain('GRANT ALL ON TABLE public.platform_modules');
  });

  it('enforces global modules, per-tenant overrides, metered limits, and resource creation limits server-side', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('erp_subscription_can_use_feature');
    expect(migration).toContain('is_globally_enabled');
    expect(migration).toContain("WHEN 'products' THEN 'products'");
    expect(migration).toContain("WHEN 'suppliers' THEN 'suppliers'");
    expect(migration).toContain("WHEN 'customers' THEN 'customers'");
    expect(migration).toContain("'ai_requests', 'api_requests', 'reports', 'transactions'");
    expect(migration).toContain('CREATE TRIGGER subscription_capacity_products');
    expect(migration).toContain('CREATE TRIGGER subscription_capacity_suppliers');
    expect(migration).toContain('CREATE TRIGGER subscription_capacity_customers');
  });

  it('sends all new control-plane actions through guarded RPCs rather than direct table operations', async () => {
    const [api, portal] = await Promise.all([readFile(apiPath, 'utf8'), readFile(portalPath, 'utf8')]);
    expect(api).toContain("rpc('platform_owner_control_center')");
    expect(api).toContain("rpc('platform_owner_upsert_plan'");
    expect(api).toContain("rpc('platform_owner_save_module'");
    expect(api).toContain("rpc('platform_owner_set_tenant_feature_override'");
    expect(portal).toContain('<ModuleManagement');
    expect(portal).toContain('Plan limit override');
    expect(portal).toContain('Use -1 for unlimited access.');
    expect(portal).not.toContain("run(restaurantId, feature, enabled, reason)");
  });
});
