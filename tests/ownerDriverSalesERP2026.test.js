import { describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { ownerDriverDateRange, previousOwnerDriverRange, ownerDriverGrowth, ownerDriverReconciliation } from '../src/lib/ownerDriverSalesAnalytics';

const migration = new URL('../supabase/migrations/20261109230000_owner_driver_sales_analytics.sql', import.meta.url);
const card = new URL('../src/components/dashboard/OwnerDriverSalesCard.jsx', import.meta.url);
const dashboard = new URL('../src/pages/OwnerDashboard.jsx', import.meta.url);

describe('Owner Driver Sales ERP analytics',()=>{
 const now=new Date(2026,10,9,14,0,0);
 it('supports all requested periods and safe same-length comparisons',()=>{
  expect(ownerDriverDateRange('today',now)).toMatchObject({from:'2026-11-09',to:'2026-11-09',days:1});
  expect(ownerDriverDateRange('yesterday',now)).toMatchObject({from:'2026-11-08',to:'2026-11-08'});
  expect(ownerDriverDateRange('week',now)).toMatchObject({from:'2026-11-09'});
  expect(ownerDriverDateRange('month',now)).toMatchObject({from:'2026-11-01'});
  expect(ownerDriverDateRange('3m',now)).toMatchObject({from:'2026-09-01'});
  expect(ownerDriverDateRange('6m',now)).toMatchObject({from:'2026-06-01'});
  expect(ownerDriverDateRange('9m',now)).toMatchObject({from:'2026-03-01'});
  expect(ownerDriverDateRange('year',now)).toMatchObject({from:'2026-01-01'});
  const range=ownerDriverDateRange('month',now);
  expect(previousOwnerDriverRange(range)).toMatchObject({from:'2026-10-23',to:'2026-10-31',days:9});
 });
 it('rejects invalid custom windows without making an unscoped query',()=>{
  expect(ownerDriverDateRange('custom',now,'','')).toBeNull();
  expect(ownerDriverDateRange('custom',now,'2026-02-30','2026-03-01')).toBeNull();
  expect(ownerDriverDateRange('custom',now,'2026-11-10','2026-11-09')).toBeNull();
  expect(ownerDriverDateRange('custom',now,'2025-01-01','2026-11-09')).toBeNull();
  expect(ownerDriverDateRange('custom',now,'2026-11-01','2026-11-09')).toMatchObject({days:9});
 });
 it('reports growth safely and reconciles cash/network cents exactly',()=>{
  expect(ownerDriverGrowth(120,100)).toBe(20);
  expect(ownerDriverGrowth(0,0)).toBeNull();
  expect(ownerDriverGrowth(120,0)).toBeNull();
  expect(ownerDriverReconciliation({totals:{cash:0.1,network:0.2,revenue:0.3}})).toBe(true);
  expect(ownerDriverReconciliation({totals:{cash:100,network:40,revenue:150}})).toBe(false);
 });
 it('does not duplicate driver revenue, include draft closings, or leak tenant data',async()=>{
  const sql=await readFile(migration,'utf8');
  expect(sql).toContain("m.user_id = auth.uid()");
  expect(sql).toContain("m.role = 'owner'");
  expect(sql).toContain("m.status = 'approved'");
  expect(sql).toContain("m.restaurant_id = p_restaurant_id");
  expect(sql).toContain("s.restaurant_id = p_restaurant_id");
  expect(sql).toContain("closing.closing_state IN ('finalized', 'locked')");
  expect(sql).toContain("s.status = 'finalized'");
  expect(sql).toContain("closing.branch_id = s.branch_id");
  expect(sql).toContain("closing.date = s.date");
  expect(sql).toContain("d.branch_id = s.branch_id");
  expect(sql).toContain('SUM(total_amount)');
  expect(sql).toContain('SUM(cash_amount)');
  expect(sql).toContain('SUM(network_amount)');
  expect(sql).toContain("p_bucket NOT IN ('day','week','month')");
  expect(sql).toContain('REVOKE ALL ON FUNCTION');
  expect(sql).toContain('TO authenticated,service_role');
  expect(sql).not.toMatch(/\b(INSERT INTO|DELETE FROM|UPDATE public\.|TRUNCATE)\b/i);
  expect(sql).not.toContain('driver_daily_reports');
  expect(sql).not.toContain('delivery_orders');
 });
 it('shows localized responsive metrics, period and driver filters and genuine error state',async()=>{
  const [ui,owner]=await Promise.all([readFile(card,'utf8'),readFile(dashboard,'utf8')]);
  expect(ui).toContain('data-testid="owner-driver-sales-analytics"');
  expect(ui).toContain("p_restaurant_id:restaurantId,p_branch_id:branch,p_driver_id:driverId||null");
  expect(ui).toContain('ownerDriverDateRange');
  expect(ui).toContain('ownerDriverGrowth');
  expect(ui).toContain('ownerDriverReconciliation');
  expect(ui).toContain('current.isError');
  expect(ui).toContain('prior.isError');
  expect(ui).toContain('data-testid="owner-driver-sales-trend"');
  expect(ui).toContain('data-testid="owner-driver-sales-kpis"');
  expect(ui).toContain("lang='en'");
  expect(ui).toContain('fa: {');
  expect(ui).toContain('ar: {');
  expect(ui).toContain('md:grid-cols-3');
  expect(ui).toContain('refetchInterval:90000');
  expect(owner).toContain("role === 'owner' && activePage === 'executive'");
  expect(owner).toContain('OwnerDriverSalesCard');
  expect(owner).toContain("key={String(activeRestaurant?.id)+'-'+String(isAllBranches?'all':selectedBranchId)}");
 });
});
