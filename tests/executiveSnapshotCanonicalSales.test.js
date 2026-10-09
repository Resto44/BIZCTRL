import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { calculateERPAccounting, calculateSalesRevenue } from '../src/lib/helpers.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Executive snapshot canonical finalized Sales Closing accounting', () => {
  const closing = {
    closing_state: 'finalized',
    date: '2026-10-09',
    restaurant_cash: 400,
    restaurant_network: 440,
    credit: 45,
    custom_sources_total: 0,
    // These are the source details already represented by the canonical
    // payment buckets. Their sum is 885, not another 885 in revenue.
    sales_sources_json: [
      { source_key: 'cash', amount: 400 },
      { source_key: 'network', amount: 440 },
      { source_key: 'credit', amount: 45 },
    ],
  };

  it('does not double a finalized 885 sale when snapshot details repeat payment buckets', () => {
    const revenue = calculateSalesRevenue(closing);
    expect(revenue).toMatchObject({
      cash: 400, network: 440, credit: 45, customSources: 0, total: 885,
    });
  });

  it('aligns ERP sales, operating result and margin with Sales History sample', () => {
    const metrics = calculateERPAccounting({
      sales: [closing],
      purchases: [{ total_amount: 578 }],
      periodExpenses: [],
      rangeType: 'day',
      daysInPeriod: 1,
      asOfDate: '2026-10-09',
    });
    expect(metrics.totalSales).toBe(885);
    expect(metrics.totalPurchaseCost).toBe(578);
    expect(metrics.netProfit).toBe(307);
    expect(metrics.netMargin).toBeCloseTo(34.6892655, 3);
    expect(metrics.totalCash + metrics.totalNetwork + metrics.totalCredit + metrics.totalAdditionalSources)
      .toBe(metrics.totalSales);
  });

  it('counts real custom revenue only once through the canonical custom bucket', () => {
    const sale = {
      ...closing,
      custom_sources_total: 50,
      sales_sources_json: [{ source_key: 'custom', amount: 50 }],
    };
    const revenue = calculateSalesRevenue(sale);
    expect(revenue.customSources).toBe(50);
    expect(revenue.total).toBe(935);
  });

  it('does not promote source history snapshots to revenue when custom bucket is empty', () => {
    const sale = {
      ...closing,
      sales_sources_json: [
        { source_id: 'driver', amount: 885, previous_amount: 200, total_amount: 1085 },
      ],
    };
    expect(calculateSalesRevenue(sale).total).toBe(885);
  });

  it('scopes both comparison periods to finalized rows and uses live ERP metrics in the card', async () => {
    const [dashboard, card, snapshot] = await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/dashboard/OwnerReportCenter.jsx'),
      source('../src/components/dashboard/ExecutiveSnapshotV2.jsx'),
    ]);
    expect(dashboard).toContain("filters: { closing_state: 'finalized' }");
    expect(dashboard.match(/filters: \{ closing_state: 'finalized' \}/g)).toHaveLength(2);
    expect(card).toContain('<ExecutiveSnapshotV2 model={model} copy={copy} />');
    expect(snapshot).toContain('data-testid="snapshot-sales"');
    expect(snapshot).toContain('data-testid="snapshot-profit"');
    expect(snapshot).toContain('data-testid="snapshot-margin"');
    expect(snapshot).toContain('data-testid="snapshot-drawer-cash"');
    expect(snapshot).toContain('buildExecutiveSnapshotPresentation');
    expect(snapshot).not.toContain('drawerCash.amount / presentation.sales');
    expect(card).not.toContain('SAR 885');
  });
});
