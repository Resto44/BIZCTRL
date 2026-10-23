import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildOwnerOrderSourceAnalytics } from '../src/lib/ownerOrderSourceAnalytics.js';

const fixture = {
  date: '2026-10-23',
  closing_state: 'finalized',
  restaurant_cash: 1525,
  restaurant_network: 736,
  credit: 25,
  sales_sources_json: [
    { source_id: 'cash-delivery', name_en: 'Delivery cash', amount: 1525, payment_bucket: 'other' },
    { source_id: 'counter-1', name_en: 'Network counter 1', amount: 625, payment_bucket: 'card' },
    { source_id: 'driver-1', name_en: 'Driver 1', amount: 36, payment_bucket: 'card' },
    { source_id: 'driver-2', name_en: 'Driver 2', amount: 25, payment_bucket: 'card' },
    { source_id: 'driver-3', name_en: 'Driver 3', amount: 25, payment_bucket: 'card' },
    { source_id: 'customer-credit', name_en: 'Customer credit', amount: 25, payment_bucket: 'credit' },
  ],
};

describe('Owner order/sales source breakdown', () => {
  it('shows source-level data already saved in finalized closing records, without double-counting canonical sales', () => {
    const report = buildOwnerOrderSourceAnalytics({ sales: [fixture], verifiedSales: 2286 });
    expect(report.sources).toHaveLength(6);
    expect(report.allocatedTotal).toBe(2261);
    expect(report.verifiedSales).toBe(2286);
    expect(report.difference).toBe(25);
    expect(report.reconciled).toBe(false);
    expect(report.sources[0]).toMatchObject({ name: 'Delivery cash', amount: 1525 });
    expect(report.sources.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(100, 8);
  });

  it('ignores draft records, non-revenue entries, malformed JSON and negative amounts', () => {
    const report = buildOwnerOrderSourceAnalytics({
      verifiedSales: 45,
      sales: [
        { closing_state: 'draft', sales_sources_json: [{ source_id: 'draft', amount: 100 }] },
        { closing_state: 'finalized', sales_sources_json: 'not-json' },
        { closing_state: 'finalized', sales_sources_json: [
          { source_key: 'a', name_en: 'A', today_amount: 20 },
          { source_key: 'b', name_en: 'B', amount: -10 },
          { source_key: 'c', name_en: 'C', amount: 50, included_in_revenue: false },
          { source_key: 'd', name_en: 'D', amount: 25 },
        ] },
      ],
      revenueSources: [{ source_key: 'd', included_in_revenue: false }],
    });
    expect(report.sources.map(s => s.name)).toEqual(['A']);
    expect(report.allocatedTotal).toBe(20);
    expect(report.difference).toBe(25);
  });

  it('combines the same source across closings and supports localized names', () => {
    const report = buildOwnerOrderSourceAnalytics({
      sales: [
        { closing_state: 'finalized', sales_sources_json: [{ source_id: 'id-1', name_ar: 'توصيل', amount: 40 }] },
        { closing_state: 'finalized', sales_sources_json: JSON.stringify([{ source_id: 'id-1', name_ar: 'توصيل', amount: 30 }]) },
      ],
      lang: 'ar', verifiedSales: 70,
    });
    expect(report.sources).toHaveLength(1);
    expect(report.sources[0]).toMatchObject({ name: 'توصيل', amount: 70, closingCount: 2, share: 100 });
    expect(report.reconciled).toBe(true);
  });

  it('wires the source card into the owner dashboard and preserves a separate payment mix', async () => {
    const [owner, executive, card] = await Promise.all([
      readFile(new URL('../src/pages/OwnerDashboard.jsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/components/dashboard/ExecutiveSnapshotV2.jsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/components/dashboard/OwnerOrderSourcesAnalytics.jsx', import.meta.url), 'utf8'),
    ]);
    expect(owner).toContain('periodSales, revenueSources, lang,');
    expect(executive).toContain('<OwnerOrderSourcesAnalytics');
    expect(executive).toContain('snapshot-payment-mix');
    expect(card).toContain('snapshot-order-sources-analytics');
    expect(card).toContain("navigate('/sales-sources')");
    expect(card).toContain('owner-source-reconciliation');
  });
});
