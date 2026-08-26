import { describe, expect, it } from 'vitest';
import {
  buildBranchDriverAnalytics,
  buildDriverSalesAnalytics,
  buildDriverTrendAnalytics,
} from '../src/lib/driverAnalytics';
import { buildSalesSourceClosingSnapshots, driverSourceTodayTotal } from '../src/lib/salesSourceClosingLifecycle';

const branchA = { id: '11111111-1111-4111-8111-111111111111', key: 'branch-a', label: 'Branch A' };
const branchB = { id: '22222222-2222-4222-8222-222222222222', key: 'branch-b', label: 'Branch B' };
const drivers = [
  { id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', full_name: 'Ahmad', branch_id: branchA.id, is_active: true, status: 'active' },
  { id: 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2', full_name: 'Mohammed', branch_id: branchA.id, is_active: true, status: 'active' },
  { id: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3', full_name: 'Ali', branch_id: branchA.id, is_active: true, status: 'active' },
  { id: 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1', full_name: 'Hassan', branch_id: branchB.id, is_active: true, status: 'active' },
  { id: 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2', full_name: 'Inactive B', branch_id: branchB.id, is_active: false, status: 'inactive' },
];
const delivery = {
  id: '33333333-3333-4333-8333-333333333333',
  name_en: 'Delivery',
  subcategory: 'Drivers',
  allows_driver_entries: true,
  default_payment_method: 'cash',
  included_in_revenue: true,
};

const entry = (id, driverId, branch, amount, paymentMethod, date = '2026-08-26') => ({
  id,
  closing_id: '44444444-4444-4444-8444-444444444444',
  restaurant_id: '55555555-5555-4555-8555-555555555555',
  branch_id: branch.id,
  branch: branch.key,
  driver_id: driverId,
  sales_source_id: delivery.id,
  subcategory: 'Drivers',
  date,
  shift: 'Morning',
  amount,
  payment_method: paymentMethod,
  status: 'finalized',
  finalized_at: '2026-08-26T12:00:00.000Z',
  closing_state: 'finalized',
});

const driverEntries = [
  entry('entry-ahmad', drivers[0].id, branchA, 200, 'cash'),
  entry('entry-mohammed', drivers[1].id, branchA, 150, 'card'),
  entry('entry-ali', drivers[2].id, branchA, 100, 'customer_credit'),
  entry('entry-hassan', drivers[3].id, branchB, 700, 'cash'),
  { ...entry('draft-ignored', drivers[0].id, branchA, 900, 'cash'), status: 'draft', finalized_at: null, closing_state: 'draft' },
  entry('yesterday-ignored', drivers[0].id, branchA, 50, 'cash', '2026-08-25'),
];

describe('canonical driver Sales Source analytics', () => {
  it('reconciles the exact Sales Source child records for Branch A without duplicate revenue', () => {
    const snapshots = buildSalesSourceClosingSnapshots([{
      source: delivery,
      driverEntries: driverEntries.slice(0, 3),
      today: 9999,
      previous: 600,
      total: 10599,
    }], { branchId: branchA.id, branch: branchA.key, date: '2026-08-26', shift: 'Morning' });

    expect(driverSourceTodayTotal(driverEntries.slice(0, 3))).toBe(450);
    expect(snapshots[0]).toMatchObject({
      source_id: delivery.id,
      subcategory: 'Drivers',
      amount: 450,
      today_amount: 450,
      previous_amount: 600,
      total_amount: 1050,
    });
    expect(snapshots[0].driver_entries).toHaveLength(3);

    const analytics = buildDriverSalesAnalytics({
      drivers,
      driverEntries,
      branchId: branchA.id,
      branchKey: branchA.key,
      dateFrom: '2026-08-26',
      dateTo: '2026-08-26',
    });

    expect(analytics.totals).toMatchObject({
      drivers: 3,
      activeDrivers: 3,
      cash: 200,
      network: 150,
      credit: 100,
      other: 0,
      revenue: 450,
    });
    expect(analytics.rankedDrivers.map(({ name, revenue }) => ({ name, revenue }))).toEqual([
      { name: 'Ahmad', revenue: 200 },
      { name: 'Mohammed', revenue: 150 },
      { name: 'Ali', revenue: 100 },
    ]);
  });

  it('excludes draft and prior-day records from today while retaining active drivers with no sales', () => {
    const analytics = buildDriverSalesAnalytics({
      drivers,
      driverEntries,
      branchId: branchA.id,
      dateFrom: '2026-08-26',
      dateTo: '2026-08-26',
    });

    expect(analytics.totals.revenue).toBe(450);
    expect(analytics.driverRows.find((row) => row.name === 'Ahmad')).toMatchObject({ orders: 1, revenue: 200 });
  });

  it('enforces branch isolation in both branch and cross-branch aggregations', () => {
    const branchAAnalytics = buildDriverSalesAnalytics({
      drivers,
      driverEntries,
      branchId: branchA.id,
      dateFrom: '2026-08-26',
      dateTo: '2026-08-26',
    });
    const branchBAnalytics = buildDriverSalesAnalytics({
      drivers,
      driverEntries,
      branchId: branchB.id,
      dateFrom: '2026-08-26',
      dateTo: '2026-08-26',
    });
    const branchRows = buildBranchDriverAnalytics({
      drivers,
      driverEntries,
      branches: [branchA, branchB],
      dateFrom: '2026-08-26',
      dateTo: '2026-08-26',
    });

    expect(branchAAnalytics.totals.revenue).toBe(450);
    expect(branchAAnalytics.driverRows.some((row) => row.name === 'Hassan')).toBe(false);
    expect(branchBAnalytics.totals).toMatchObject({ drivers: 2, activeDrivers: 1, revenue: 700, cash: 700 });
    expect(branchRows.map(({ branchName, revenue }) => ({ branchName, revenue }))).toEqual([
      { branchName: 'Branch B', revenue: 700 },
      { branchName: 'Branch A', revenue: 450 },
    ]);
  });

  it('uses finalized entry revenue rather than transaction counts for Top 10 and trends', () => {
    const trends = buildDriverTrendAnalytics({
      drivers,
      driverEntries,
      branches: [branchA, branchB],
      branchId: branchA.id,
      dateFrom: '2026-08-26',
      dateTo: '2026-08-26',
    });

    expect(trends.rankedDrivers.map((row) => row.name)).toEqual(['Ahmad', 'Mohammed', 'Ali']);
    expect(trends.trendRows).toEqual([expect.objectContaining({ date: '2026-08-26', revenue: 450, cash: 200, network: 150, credit: 100 })]);
  });
});
