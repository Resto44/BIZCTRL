import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Retail POS Control Center contract', () => {
  it('keeps the four-page workspace restricted to supermarket portals and viewSales roles', async () => {
    const [app, guard, sidebar] = await Promise.all([
      source('../src/App.jsx'),
      source('../src/components/retail-pos/RetailPOSPortalGuard.jsx'),
      source('../src/components/layout/ERPSidebar.jsx'),
    ]);

    for (const path of ['/retail/pos-control', '/retail/pos-branches', '/retail/pos-device', '/retail/pos-audit']) {
      expect(app).toContain(`path="${path}"`);
      expect(app).toContain(`permission="viewSales"`);
      expect(sidebar).toContain(`path: '${path}'`);
    }
    expect(guard).toContain('isSupermarketProductPortal(activeRestaurant)');
    expect(sidebar).toContain('supermarketOnly: true');
  });

  it('keeps all four POS pages navigation-safe inside one authenticated shell bundle', async () => {
    const [app, workspace] = await Promise.all([
      source('../src/App.jsx'),
      source('../src/components/retail-pos/RetailPOSUI.jsx'),
    ]);
    for (const page of ['POSExecutiveDashboard', 'POSBranchDevices', 'POSTerminalAccount', 'POSAuditCenter']) {
      expect(app).toContain(`import ${page} from '@/pages/retail/pos/${page}'`);
      expect(app).not.toContain(`const ${page} = lazy(`);
    }
    expect(app).toContain("import RetailPOSPortalGuard from '@/components/retail-pos/RetailPOSPortalGuard'");
    expect(app).not.toContain('const RetailPOSPortalGuard  = lazy(');
    expect(workspace).toContain('to={page.path} reloadDocument');
    expect(app).toContain('onClick={() => window.location.reload()}');
  });

  it('defines independent device, shift, receipt, item, payment, approval, event and command ledgers', async () => {
    const sql = await source('../supabase/migrations/20260904143721_retail_pos_control_center.sql');
    for (const table of [
      'retail_pos_devices',
      'retail_pos_shifts',
      'retail_pos_transactions',
      'retail_pos_transaction_items',
      'retail_pos_transaction_payments',
      'retail_pos_approval_requests',
      'retail_pos_device_events',
      'retail_pos_device_commands',
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon`);
    }
    expect(sql).toContain("'POS-' || lpad(series.number::text, 2, '0')");
    expect(sql).toContain('p_count integer default 10');
    expect(sql).toContain("lower(btrim(coalesce(nullif(restaurant.business_type::text, ''), restaurant.business_mode::text, ''))) in ('retail', 'supermarket')");
  });

  it('enforces append-only finance, atomic posting and approval-gated reversals', async () => {
    const sql = await source('../supabase/migrations/20260904143721_retail_pos_control_center.sql');
    expect(sql).toContain('Retail POS financial ledger rows are append-only');
    expect(sql).toContain('create trigger retail_pos_transactions_immutable before update or delete');
    expect(sql).toContain('create trigger retail_pos_items_immutable before update or delete');
    expect(sql).toContain('create trigger retail_pos_payments_immutable before update or delete');
    expect(sql).toContain("request.status = 'approved'");
    expect(sql).toContain('Payment total must equal transaction net total');
    expect(sql).toContain('security definer');
    expect(sql).toContain('grant select on table public.retail_pos_transactions to authenticated');
    expect(sql).not.toContain('grant select, insert on table public.retail_pos_transactions to authenticated');
  });

  it('revokes legacy authenticated defaults and covers foreign-key lookups', async () => {
    const [base, hardening, functionPrivileges] = await Promise.all([
      source('../supabase/migrations/20260904143721_retail_pos_control_center.sql'),
      source('../supabase/migrations/20260904151815_retail_pos_least_privilege.sql'),
      source('../supabase/migrations/20260904152210_retail_pos_function_privileges.sql'),
    ]);
    expect(base).toContain('from public, anon, authenticated');
    expect(hardening).toContain('revoke all on table public.retail_pos_transactions from authenticated');
    expect(hardening).toContain('grant select on table public.retail_pos_transactions to authenticated');
    expect(hardening).toContain('retail_pos_transactions_shift_scope_fk_idx');
    expect(hardening).toContain('retail_pos_events_transaction_scope_fk_idx');
    for (const functionName of [
      'erp_retail_pos_touch_updated_at',
      'erp_retail_pos_validate_device_scope',
      'erp_retail_pos_append_only',
    ]) {
      expect(functionPrivileges).toContain(`revoke all on function public.${functionName}()`);
    }
    expect(functionPrivileges).toContain('from public, anon, authenticated');
  });

  it('uses one batched realtime control channel with a safe polling fallback', async () => {
    const [hook, model] = await Promise.all([
      source('../src/hooks/useRetailPOSControl.js'),
      source('../src/lib/retailPosControl.js'),
    ]);
    expect(hook).toContain('RETAIL_POS_REALTIME_TABLES.forEach');
    expect(hook).toContain('window.setTimeout');
    expect(hook).toContain('refetchInterval: 60_000');
    expect(model).toContain("'retail_pos_transactions'");
    expect(model).toContain("'retail_pos_device_commands'");
  });
});
