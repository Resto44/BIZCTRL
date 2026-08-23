import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('production audit remediation contract', () => {
  it('does not log complete business records, user emails, or successful insert payloads during routine entity creation', async () => {
    const client = await source('../src/api/supabaseClient.js');

    expect(client).not.toContain('create() called with record:');
    expect(client).not.toContain('current user email:');
    expect(client).not.toContain('FINAL PAYLOAD being sent to Supabase:');
    expect(client).not.toContain('INSERT SUCCESS:');
    expect(client).toContain('console.error(`[entity:${tableName}] INSERT ERROR:`');
  });

  it('filters the mobile More menu through the existing role permission matrix before rendering routes', async () => {
    const navigation = await source('../src/components/layout/BottomNav.jsx');

    expect(navigation).toContain('const MORE_PERMISSION_BY_PATH = {');
    expect(navigation).toContain("'/billing': 'viewBilling'");
    expect(navigation).toContain("'/erp-approval-center': 'manageSettings'");
    expect(navigation).toContain("'/ai-copilot': 'viewDashboard'");
    expect(navigation).toContain('const { role, can } = useRole();');
    expect(navigation).toContain('const permission = MORE_PERMISSION_BY_PATH[item.path];');
    expect(navigation).toContain('return (!permission || can[permission]) && !hidden.has(item.path);');
    expect(navigation).toContain('}, [baseMoreSections, baseNav, can, configuration]);');
  });

  it('hardens audited state-changing RPC execution without removing authenticated invoice rollback access', async () => {
    const migration = await source('../supabase/migrations/20260823_audit_rpc_execution_hardening.sql');

    expect(migration).toContain('ALTER FUNCTION public.backfill_cash_register_data(date, date)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.backfill_cash_register_data(date, date) FROM anon, authenticated;');
    expect(migration).toContain('ALTER FUNCTION public.delete_supplier_invoice_with_rollback(uuid)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.delete_supplier_invoice_with_rollback(uuid) FROM anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.delete_supplier_invoice_with_rollback(uuid) TO authenticated;');
    expect(migration).toContain('SET search_path TO public, pg_temp;');
  });

  it('keeps mobile More-menu filtering as a frontend UX guard rather than a replacement for backend authorization', async () => {
    const [navigation, role, featureGuard] = await Promise.all([
      source('../src/components/layout/BottomNav.jsx'),
      source('../src/lib/RoleContext.jsx'),
      source('../src/components/subscription/FeatureRouteGuard.jsx'),
    ]);

    expect(navigation).toContain('Route guards and RLS remain authoritative');
    expect(role).toContain('return ROLES.EMPLOYEE; // Deny by default');
    expect(featureGuard).toContain("supabase.rpc('erp_require_subscription_feature'");
  });
});
