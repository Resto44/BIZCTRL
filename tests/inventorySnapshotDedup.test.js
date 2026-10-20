import { describe, expect, it } from 'vitest';
import { latestInventorySnapshots } from '../src/lib/inventorySnapshotView.js';
import { buildInventoryOverview, buildInventoryConsumption } from '../src/lib/ownerReportCenter.js';

const branches = [
  { id: 'ryan-uuid', branch_key: 'ryan', name: 'Rayan' },
  { id: 'north-uuid', branch_key: 'north', name: 'North' },
];

describe('ERP inventory snapshot deduplication', () => {
  it('keeps the latest dated product snapshot for the same branch and unit', () => {
    const rows = [
      { id: 'old', product_id: 'rice', branch: 'ryan', unit: 'bag', date: '2026-10-02', quantity: 15 },
      { id: 'new', product_id: 'rice', branch_id: 'ryan-uuid', unit: 'bag', date: '2026-10-14', quantity: 4 },
    ];
    expect(latestInventorySnapshots(rows, branches)).toEqual([rows[1]]);
  });

  it('never combines products across branches or incompatible units', () => {
    const rows = [
      { id: 'a', product_id: 'rice', branch: 'ryan', unit: 'bag', date: '2026-10-14', quantity: 4 },
      { id: 'b', product_id: 'rice', branch: 'north', unit: 'bag', date: '2026-10-14', quantity: 8 },
      { id: 'c', product_id: 'rice', branch: 'ryan', unit: 'kg', date: '2026-10-14', quantity: 30 },
    ];
    expect(latestInventorySnapshots(rows, branches)).toEqual(rows);
  });

  it('uses a later updated timestamp to resolve snapshots on the same business date', () => {
    const rows = [
      { id: 'a', product_id: 'oil', branch: 'ryan', unit: 'box', date: '2026-10-14', updated_date: '2026-10-14T08:00:00Z', quantity: 8 },
      { id: 'b', product_id: 'oil', branch: 'ryan', unit: 'box', date: '2026-10-14', updated_date: '2026-10-14T18:00:00Z', quantity: 5 },
    ];
    expect(latestInventorySnapshots(rows, branches)[0].id).toBe('b');
  });

  it('does not double count archived snapshots in Owner valuation and consumption', () => {
    const rows = [
      { id: 'old', product_id: 'rice', branch: 'ryan', unit: 'bag', date: '2026-10-02', quantity: 9, low_stock_threshold: 5 },
      { id: 'new', product_id: 'rice', branch_id: 'ryan-uuid', unit: 'bag', date: '2026-10-14', quantity: 2, low_stock_threshold: 5 },
    ];
    expect(buildInventoryOverview(rows, [{ id: 'rice', purchase_cost: 10 }], branches))
      .toMatchObject({ totalValue: 20, lowStock: 1, outOfStock: 0 });
    const consumption = buildInventoryConsumption([
      { product_id: 'rice', transaction_type: 'recipe_consumption', quantity: -1, unit_cost: 10 },
    ], [{ id: 'rice', name: 'Rice', unit: 'bag', purchase_cost: 10 }], rows, branches);
    expect(consumption.items[0].stock).toBe(2);
  });
});
