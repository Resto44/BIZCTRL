import { describe, it, expect } from 'vitest';
import {
  computeInventoryInsights, inventoryItemActivity, inventoryPeriodWindow, riyadhISODate,
} from '../src/lib/inventoryTrendAnalytics.js';

describe('restaurant inventory ERP analytics', () => {
  const date = '2026-11-06';
  const stock = [
    { product_id: 'rice', branch_id: 'b1', branch: 'rayyan', currentStock: 10, low_stock_threshold: 5, unit: 'bag', isLow: false },
    { product_id: 'chicken', branch_id: 'b1', branch: 'rayyan', currentStock: 0, low_stock_threshold: 5, unit: 'carton', isLow: true },
  ];
  const purchases = [
    { product_id: 'rice', branch_id: 'b1', qty: 4, date },
    { product_id: 'chicken', branch_id: 'b1', qty: 3, date: '2026-11-05' },
    { product_id: 'rice', branch_id: 'b1', qty: 99, date: '2026-09-01' },
  ];
  const waste = [
    { product_id: 'rice', branch_id: 'b1', qty: 2, date },
    { product_id: 'chicken', branch_id: 'b1', qty: 20, date: '2026-01-01' },
  ];

  it('supports all six requested time windows', () => {
    expect(['day', 'week', 'month', 'quarter', 'half', 'year'].map(period =>
      inventoryPeriodWindow(period, date).days)).toEqual([1, 7, 30, 90, 180, 365]);
  });

  it('counts real movement records in the selected window, never sales or mixed-unit quantities', () => {
    const result = computeInventoryInsights(stock, purchases, waste, { period: 'week', todayISO: date });
    expect(result.incomingCount).toBe(2);
    expect(result.wasteCount).toBe(1);
    expect(result.series.reduce((sum, point) => sum + point.purchases, 0)).toBe(2);
    expect(result.series.reduce((sum, point) => sum + point.waste, 0)).toBe(1);
    expect(result.itemsCount).toBe(2);
    expect(result.lowCount).toBe(1);
    expect(result.outCount).toBe(1);
    expect(inventoryItemActivity(result, stock[0]).purchasedQty).toBe(4);
    expect(inventoryItemActivity(result, stock[0]).wastedQty).toBe(2);
  });

  it('preserves historical balances when the movement time filter changes', () => {
    const result = computeInventoryInsights(stock, purchases, waste, { period: 'day', todayISO: date });
    expect(result.itemsCount).toBe(2);
    expect(result.incomingCount).toBe(1);
    expect(result.lowPercent).toBe(50);
    expect(result.series).toHaveLength(1);
  });

  it('uses Riyadh business date instead of UTC for late-night activity', () => {
    expect(riyadhISODate(new Date('2026-11-05T22:30:00Z'))).toBe('2026-11-06');
  });
});
