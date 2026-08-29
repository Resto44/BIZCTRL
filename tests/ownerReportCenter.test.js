import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  buildBranchPriceInconsistencies,
  buildInventoryConsumption,
  buildInventoryOverview,
  buildOwnerReportPeriod,
  buildPriceControlReport,
  buildSupplierPriceComparisons,
  groupExpensesByCategory,
} from '../src/lib/ownerReportCenter.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Owner ERP Report Center', () => {
  it('exposes exactly four compact report pages and keeps every page in the owner dashboard flow', async () => {
    const [dashboard, center] = await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/dashboard/OwnerReportCenter.jsx'),
    ]);
    expect(dashboard).toContain("{ key: 'executive'");
    expect(dashboard).toContain("{ key: 'finance'");
    expect(dashboard).toContain("{ key: 'operations'");
    expect(dashboard).toContain("{ key: 'price-control'");
    expect(dashboard).toContain('useSearchParams()');
    for (const testId of ['report-executive', 'report-finance', 'report-operations', 'report-price-control']) {
      expect(center).toContain(`data-testid="${testId}"`);
    }
  });

  it('provides a clickable five-period selector and connects its URL state to report queries', async () => {
    const dashboard = await source('../src/pages/OwnerDashboard.jsx');
    expect(dashboard).toContain('data-testid="owner-period-selector"');
    expect(dashboard).toContain("{ key: 'today'");
    expect(dashboard).toContain("{ key: 'week'");
    expect(dashboard).toContain("{ key: 'month'");
    expect(dashboard).toContain("{ key: 'six-months'");
    expect(dashboard).toContain("{ key: 'year'");
    expect(dashboard).toContain("next.set('period', nextPeriod)");
    expect(dashboard).toContain("['sales_report_period'");
    expect(dashboard).toContain("['expenses_report_period'");
    expect(dashboard).toContain("['inventory_transactions_report'");
  });

  it('builds exact current and comparable previous ERP report ranges', () => {
    const now = new Date(2026, 7, 29, 12, 0, 0);
    expect(buildOwnerReportPeriod('today', now)).toMatchObject({
      key: 'today', rangeType: 'day', daysInPeriod: 1,
      currentStart: '2026-08-29', currentEnd: '2026-08-29', previousStart: '2026-08-28', previousEnd: '2026-08-28',
    });
    expect(buildOwnerReportPeriod('week', now)).toMatchObject({
      key: 'week', rangeType: 'week', daysInPeriod: 7,
      currentStart: '2026-08-23', currentEnd: '2026-08-29', previousStart: '2026-08-16', previousEnd: '2026-08-22',
    });
    expect(buildOwnerReportPeriod('month', now)).toMatchObject({
      key: 'month', currentStart: '2026-08-01', currentEnd: '2026-08-29', previousStart: '2026-07-01', previousEnd: '2026-07-29',
    });
    expect(buildOwnerReportPeriod('six-months', now)).toMatchObject({
      key: 'six-months', currentStart: '2026-03-01', currentEnd: '2026-08-29', previousStart: '2025-09-01', previousEnd: '2026-02-28',
    });
    expect(buildOwnerReportPeriod('year', now)).toMatchObject({
      key: 'year', currentStart: '2026-01-01', currentEnd: '2026-08-29', previousStart: '2025-01-01', previousEnd: '2025-08-29',
    });
  });

  it('uses canonical ERP sources rather than placeholder dashboard numbers', async () => {
    const dashboard = await source('../src/pages/OwnerDashboard.jsx');
    for (const sourceName of ['daily_sales', 'expenses', 'supplier_invoices', 'debt_records', 'inventory', 'inventory_transactions', 'product_price_history']) {
      expect(dashboard).toContain(sourceName);
    }
    expect(dashboard).toContain('calculateERPAccounting({');
    expect(dashboard).toContain('buildInventoryConsumption(inventoryTransactions, products, inventory)');
    expect(dashboard).not.toMatch(/mockData|placeholderData|demoValue/);
  });

  it('calculates ingredient usage and waste separately from recorded stock movements', () => {
    const products = [{ id: 'chicken', name: 'Chicken carton', unit: 'ctn', purchase_cost: 20 }];
    const inventory = [{ product_id: 'chicken', opening_stock: 8 }];
    const report = buildInventoryConsumption([
      { product_id: 'chicken', transaction_type: 'recipe_consumption', quantity: -2, unit_cost: 20 },
      { product_id: 'chicken', transaction_type: 'sale', quantity: -1, unit_cost: 20 },
      { product_id: 'chicken', transaction_type: 'waste', quantity: -0.5, unit_cost: 20 },
      { product_id: 'chicken', transaction_type: 'purchase', quantity: 4, unit_cost: 20 },
    ], products, inventory);
    expect(report.items).toEqual([{ productId: 'chicken', name: 'Chicken carton', unit: 'ctn', quantity: 3, cost: 60, stock: 8 }]);
    expect(report.wasteQuantity).toBe(0.5);
    expect(report.wasteCost).toBe(10);
  });

  it('derives stock health and valuation from inventory plus Product Master cost', () => {
    expect(buildInventoryOverview([
      { product_id: 'rice', opening_stock: 2, low_stock_threshold: 3 },
      { product_id: 'oil', opening_stock: 0, low_stock_threshold: 2 },
    ], [
      { id: 'rice', purchase_cost: 50 },
      { id: 'oil', purchase_cost: 30 },
    ])).toEqual({ totalValue: 100, lowStock: 1, outOfStock: 1, skuCount: 2 });
  });

  it('calculates margin, target price and supplier cost changes from recorded prices', () => {
    const report = buildPriceControlReport([
      { id: 'rice', name: 'Rice', purchase_cost: 6, selling_price: 10 },
      { id: 'oil', name: 'Oil', purchase_cost: 4, selling_price: 10 },
    ], [
      { product_id: 'rice', product_name: 'Rice', previous_price: 5, new_price: 7, difference: 2, pct_change: 40, recorded_at: '2026-08-29T10:00:00Z' },
    ], 35);
    const rice = report.rows.find((row) => row.productId === 'rice');
    expect(rice.cost).toBe(7);
    expect(rice.margin).toBeCloseTo(30);
    expect(rice.suggestedPrice).toBeCloseTo(10.7692);
    expect(rice.status).toBe('watch');
    expect(report.increaseCount).toBe(1);
    expect(report.healthyCount).toBe(1);
  });

  it('finds real supplier savings and cross-branch price differences', () => {
    const history = [
      { product_id: 'rice', product_name: 'Rice', supplier_name: 'A', branch: 'north', new_price: 10, recorded_at: '2026-08-29T10:00:00Z' },
      { product_id: 'rice', product_name: 'Rice', supplier_name: 'B', branch: 'south', new_price: 12, recorded_at: '2026-08-29T09:00:00Z' },
    ];
    expect(buildSupplierPriceComparisons(history)[0]).toMatchObject({ name: 'Rice', saving: 2, best: { supplier: 'A', price: 10 } });
    expect(buildBranchPriceInconsistencies(history)[0]).toMatchObject({ name: 'Rice', spread: 2 });
  });

  it('groups finance expenses by canonical category IDs', () => {
    expect(groupExpensesByCategory([
      { category_id: 'food', amount: 50 },
      { category_id: 'food', amount: 25 },
      { category_id: 'rent', amount: 100 },
    ], [{ id: 'food', name: 'Food' }, { id: 'rent', name: 'Rent' }])).toEqual([
      { name: 'Rent', amount: 100 },
      { name: 'Food', amount: 75 },
    ]);
  });
});
