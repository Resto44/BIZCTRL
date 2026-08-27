import { describe, expect, it } from 'vitest';
import {
  buildBranchDriverAnalytics,
  buildDriverSalesAnalytics,
  buildDriverTrendAnalytics,
} from '../src/lib/driverAnalytics';
import {
  buildSalesSourceClosingSnapshots,
  driverSourceEntryAmounts,
  driverSourcePaymentBreakdown,
  driverSourceTodayTotal,
} from '../src/lib/salesSourceClosingLifecycle';

const branchA = { id: '11111111-1111-4111-8111-111111111111', key: 'branch-a', label: 'Branch A' };
const branchB = { id: '22222222-2222-4222-8222-222222222222', key: 'branch-b', label: 'Branch B' };
const drivers = [
  { id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', full_name: 'Abdullah Khan', branch_id: branchA.id, is_active: true, status: 'active' },
  { id: 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2', full_name: 'Mohammed', branch_id: branchA.id, is_active: true, status: 'active' },
  { id: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3', full_name: 'Ahmad', branch_id: branchA.id, is_active: true, status: 'active' },
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

const entry = (id, driverId, branch, cashAmount, networkAmount, date = '2026-08-27') => ({
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
  cash_amount: cashAmount,
  network_amount: networkAmount,
  total_amount: cashAmount + networkAmount,
  amount: cashAmount + networkAmount,
  payment_method: 'split',
  status: 'finalized',
  finalized_at: '2026-08-27T12:00:00.000Z',
  closing_state: 'finalized',
});

const driverEntries = [
  entry('entry-abdullah', drivers[0].id, branchA, 100, 200),
  entry('entry-mohammed', drivers[1].id, branchA, 50, 150),
  entry('entry-ahmad', drivers[2].id, branchA, 80, 20),
  entry('entry-hassan', drivers[3].id, branchB, 700, 0),
  { ...entry('draft-ignored', drivers[0].id, branchA, 900, 0), status: 'draft', finalized_at: null, closing_state: 'draft' },
  entry('yesterday-ignored', drivers[0].id, branchA, 50, 0, '2026-08-26'),
];

describe('canonical split-payment driver Sales Source', () => {
  it('derives each driver total from Cash plus Network while allowing either payment side to be zero', () => {
    expect(driverSourceEntryAmounts({ cash_amount: 0, network_amount: 300 })).toEqual({ cash: 0, network: 300, total: 300 });
    expect(driverSourceEntryAmounts({ cash_amount: 300, network_amount: 0 })).toEqual({ cash: 300, network: 0, total: 300 });
    expect(driverSourceEntryAmounts({ cash_amount: 100, network_amount: 200 })).toEqual({ cash: 100, network: 200, total: 300 });
  });

  it('persists and aggregates the required Branch A closing scenario without historical double counting', () => {
    const branchADriverEntries = driverEntries.slice(0, 3);
    const snapshots = buildSalesSourceClosingSnapshots([{
      source: delivery,
      driverEntries: branchADriverEntries,
      today: 9999,
      previous: 600,
      total: 10599,
    }], { branchId: branchA.id, branch: branchA.key, date: '2026-08-27', shift: 'Morning' });

    expect(driverSourcePaymentBreakdown(branchADriverEntries)).toEqual({ cash: 230, network: 370, total: 600 });
    expect(driverSourceTodayTotal(branchADriverEntries)).toBe(600);
    expect(snapshots[0]).toMatchObject({
      source_id: delivery.id,
      subcategory: 'Drivers',
      amount: 600,
      today_amount: 600,
      previous_amount: 600,
      total_amount: 1200,
    });
    expect(snapshots[0].driver_entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ driver_id: drivers[0].id, cash_amount: 100, network_amount: 200, total_amount: 300 }),
      expect.objectContaining({ driver_id: drivers[1].id, cash_amount: 50, network_amount: 150, total_amount: 200 }),
      expect.objectContaining({ driver_id: drivers[2].id, cash_amount: 80, network_amount: 20, total_amount: 100 }),
    ]));
  });

  it('uses the same persisted split values in Driver Analytics and excludes draft and prior-day records', () => {
    const analytics = buildDriverSalesAnalytics({
      drivers,
      driverEntries,
      branchId: branchA.id,
      branchKey: branchA.key,
      dateFrom: '2026-08-27',
      dateTo: '2026-08-27',
    });

    expect(analytics.totals).toMatchObject({
      drivers: 3,
      activeDrivers: 3,
      cash: 230,
      network: 370,
      credit: 0,
      other: 0,
      revenue: 600,
    });
    expect(analytics.rankedDrivers.map(({ name, revenue }) => ({ name, revenue }))).toEqual([
      { name: 'Abdullah Khan', revenue: 300 },
      { name: 'Mohammed', revenue: 200 },
      { name: 'Ahmad', revenue: 100 },
    ]);
  });

  it('enforces branch isolation in cross-branch analytics and trend aggregation', () => {
    const branchAAnalytics = buildDriverSalesAnalytics({ drivers, driverEntries, branchId: branchA.id, dateFrom: '2026-08-27', dateTo: '2026-08-27' });
    const branchBAnalytics = buildDriverSalesAnalytics({ drivers, driverEntries, branchId: branchB.id, dateFrom: '2026-08-27', dateTo: '2026-08-27' });
    const branchRows = buildBranchDriverAnalytics({ drivers, driverEntries, branches: [branchA, branchB], dateFrom: '2026-08-27', dateTo: '2026-08-27' });
    const trends = buildDriverTrendAnalytics({ drivers, driverEntries, branches: [branchA, branchB], branchId: branchA.id, dateFrom: '2026-08-27', dateTo: '2026-08-27' });

    expect(branchAAnalytics.totals).toMatchObject({ revenue: 600, cash: 230, network: 370 });
    expect(branchAAnalytics.driverRows.some((row) => row.name === 'Hassan')).toBe(false);
    expect(branchBAnalytics.totals).toMatchObject({ drivers: 2, activeDrivers: 1, revenue: 700, cash: 700, network: 0 });
    expect(branchRows.map(({ branchName, revenue }) => ({ branchName, revenue }))).toEqual([
      { branchName: 'Branch B', revenue: 700 },
      { branchName: 'Branch A', revenue: 600 },
    ]);
    expect(trends.trendRows).toEqual([expect.objectContaining({ date: '2026-08-27', revenue: 600, cash: 230, network: 370 })]);
  });
});
