import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { filterDailySalesRecords, toDailySalesCardRecord } from '../src/lib/dailySalesPresentation.js';

const cardPath = new URL('../src/components/sales/SalesListItem.jsx', import.meta.url);
const workspacePath = new URL('../src/components/sales/UnifiedSalesClosing.jsx', import.meta.url);
const salesPagePath = new URL('../src/pages/Sales.jsx', import.meta.url);
const schemaPath = new URL('../src/supabase/schema.sql', import.meta.url);
const migrationPath = new URL('../src/supabase/20260815_daily_sales_manager_attribution.sql', import.meta.url);

describe('Daily Sales manager attribution', () => {
  it('shows only the manager attribution on the Daily Sales record card', async () => {
    const card = await readFile(cardPath, 'utf8');
    expect(card).toContain('UserRound');
    expect(card).toContain('Manager:');
    expect(card).toContain('const managerName = sale.manager_name || sale.manager_email || sale.created_by || \'—\';');
    expect(card).not.toContain('Truck');
    expect(card).not.toContain('sale.driver_name');
    expect(card).not.toContain('sale.driver_id');
  });

  it('keeps revenue calculations independent from attribution fields', async () => {
    const [card, workspace, salesPage] = await Promise.all([
      readFile(cardPath, 'utf8'),
      readFile(workspacePath, 'utf8'),
      readFile(salesPagePath, 'utf8'),
    ]);
    expect(card).toContain('const total = rCash + rNet + credit + customSourcesTotal;');
    expect(workspace).toContain('restaurant_cash: baseCashSales');
    expect(workspace).toContain('const driverSourcePaymentTotals = useMemo(() =>');
    expect(workspace).toContain('restaurant_network: Math.max(0, networkTotal - driverSourcePaymentTotals.card');
    expect(workspace).toContain('credit: Math.max(0, creditTotal - driverSourcePaymentTotals.credit)');
    expect(workspace).toContain('custom_sources_total: Math.max(0, otherPaymentTotal - driverSourcePaymentTotals.other)');
    expect(salesPage).toContain("import { filterDailySalesRecords, toDailySalesCardRecord } from '@/lib/dailySalesPresentation';");
    expect(salesPage).toContain('sale={toDailySalesCardRecord(s)}');
    expect(salesPage).toContain("queryKey: ['sales', activeRestaurant?.id, selectedBranchId, selectedBranchKey, isAllBranches]");
    expect(salesPage).toContain("baseQuery().eq('branch_id', selectedBranchId)");
    expect(salesPage).toContain("baseQuery().is('branch_id', null).eq('branch', selectedBranchKey)");
  });

  it('stores server-derived manager identity, preserves it on edits, and rejects a manager branch mismatch', async () => {
    const [schema, sql] = await Promise.all([
      readFile(schemaPath, 'utf8'),
      readFile(migrationPath, 'utf8'),
    ]);
    expect(schema).toContain('manager_user_id');
    expect(schema).toContain('manager_name');
    expect(schema).toContain('manager_email');
    expect(sql).toContain('v_user_id uuid := auth.uid()');
    expect(sql).toContain('NEW.manager_user_id := OLD.manager_user_id;');
    expect(sql).toContain("MESSAGE = 'DAILY_SALES_BRANCH_SCOPE_DENIED'");
    expect(sql).toContain('NEW.manager_name := COALESCE(');
    expect(sql).toContain('BEFORE INSERT OR UPDATE ON public.daily_sales');
    const profileScope = await readFile(new URL('../src/supabase/20260815_daily_sales_manager_profile_branch_scope.sql', import.meta.url), 'utf8');
    expect(profileScope).toContain('v_assigned_branch_id := coalesce(v_membership.branch_id, v_profile.branch_id);');
  });

  it('keeps Driver Sales out of legacy Daily Sales fields and persists them only as canonical Sales Source children', async () => {
    const [workspace, driverManagement, driverSourceMigration] = await Promise.all([
      readFile(workspacePath, 'utf8'),
      readFile(new URL('../src/pages/DriverManagement.jsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/supabase/20260827_driver_sales_sources_canonical.sql', import.meta.url), 'utf8'),
    ]);
    expect(workspace).not.toContain('drivers_json');
    expect(workspace).toContain('DriverSalesSourceCard');
    expect(workspace).toContain('driver_entries');
    expect(workspace).toContain(".from('drivers')");
    expect(driverManagement).toContain('DriverManagement');
    expect(driverManagement).toContain(".from('driver_sales_entries')");
    expect(driverManagement).not.toContain('recordDriverSaleMutation');
    expect(driverManagement).not.toContain('Record Driver Sale');
    expect(driverManagement).not.toContain('base44.entities.DailySales.update');
    expect(driverSourceMigration).toContain('driver_sales_entries_sales_source_id_fkey');
    expect(driverSourceMigration).toContain('driver_sales_entries_closing_id_fkey');
    expect(driverSourceMigration).toContain("v_state = 'finalized'");
  });

  it('does not count a saved source snapshot again after its amount is classified into a canonical payment bucket', async () => {
    const card = await readFile(cardPath, 'utf8');
    const sourceClassifiedCashSale = {
      id: 'source-classified-cash',
      date: '2026-10-01',
      branch: 'north',
      restaurant_cash: 250,
      restaurant_network: 0,
      credit: 0,
      custom_sources_total: 0,
      sales_sources_json: JSON.stringify([{ source_id: 'cash-source', amount: 250, payment_bucket: 'cash' }]),
    };

    expect(filterDailySalesRecords([sourceClassifiedCashSale], { branch: 'north', from: '', to: '', minTotal: '250', maxTotal: '250' }))
      .toHaveLength(1);
    expect(filterDailySalesRecords([sourceClassifiedCashSale], { branch: 'north', from: '', to: '', minTotal: '251', maxTotal: '' }))
      .toHaveLength(0);
    expect(card).toContain('const customSourcesTotal = Math.max(0, Number(sale.custom_sources_total) || 0);');
    expect(card).not.toContain('JSON.parse(sale.sales_sources_json)');
  });

  it('filters historical records by branch and renders each manager without driver attribution', () => {
    const sales = [
      { id: 'manager-one-history', date: '2026-08-12', branch: 'north', restaurant_cash: 100, restaurant_network: 20, credit: 5, custom_sources_total: 0, manager_name: 'Manager One', driver_name: 'Hidden Driver' },
      { id: 'manager-two-history', date: '2026-08-13', branch: 'south', restaurant_cash: 200, restaurant_network: 30, credit: 10, custom_sources_total: 7, manager_name: 'Manager Two', driver_name: 'Other Hidden Driver' },
    ];
    const northHistory = filterDailySalesRecords(sales, { branch: 'north', from: '', to: '', minTotal: '', maxTotal: '' });
    const southHistory = filterDailySalesRecords(sales, { branch: 'south', from: '', to: '', minTotal: '', maxTotal: '' });
    expect(northHistory.map((sale) => sale.id)).toEqual(['manager-one-history']);
    expect(southHistory.map((sale) => sale.id)).toEqual(['manager-two-history']);
    expect(toDailySalesCardRecord(northHistory[0])).toMatchObject({ id: 'manager-one-history', manager_name: 'Manager One' });
    expect(toDailySalesCardRecord(southHistory[0])).toMatchObject({ id: 'manager-two-history', manager_name: 'Manager Two' });
    expect(toDailySalesCardRecord(northHistory[0])).not.toHaveProperty('driver_name');
    expect(toDailySalesCardRecord(southHistory[0])).not.toHaveProperty('driver_name');
  });
});
