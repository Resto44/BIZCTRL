import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { closingCashSalesSources } from '../src/lib/closing/ClosingCashSalesSources';
import { cashReconciliationSnapshot } from '../src/lib/closing/CashReconciliationLedger';
import { closingStepIssues } from '../src/components/sales/ClosingStepNavigation';

const code = file => readFile(new URL(file, import.meta.url), 'utf8');
const source = (id, method, amount, options = {}) => ({
  source: { id, name_en: id, included_in_revenue: true, default_payment_method: method, ...options },
  sourceLabel: id, today: amount, previous: 9999,
});

describe('Sales Closing ERP visual/accounting contract', () => {
  it('totals just current-period cash from each source, excluding network, wallet, credit and previous', () => {
    const breakdown = closingCashSalesSources({ baseCashSales: 1840, summaries: [
      source('delivery', 'cash', 520), source('manual', 'cash', 280),
      source('network', 'card', 650), source('wallet', 'wallet', 110),
      source('credit', 'credit', 80),
    ] });
    expect(breakdown.total).toBe(2640);
    expect(breakdown.rows.map(row => [row.id, row.amount])).toEqual([
      ['restaurant_cash', 1840],
      ['source:delivery', 520],
      ['source:manual', 280],
      ['source:network', 0],
      ['source:wallet', 0],
      ['source:credit', 0],
    ]);
  });

  it('splits a driver source by tender and does not add its total twice', () => {
    const breakdown = closingCashSalesSources({ baseCashSales: 40, summaries: [
      source('driver', 'cash', 999, { allows_driver_entries: true, name_fa: 'پیک' }),
    ].map(item => item.source.id === 'driver' ? {
      ...item, driverEntries: [
        { driver_id: 'd1', cash_amount: 45.50, network_amount: 28 },
        { driver_id: 'd2', cash_amount: 12.25, network_amount: 10 },
      ],
    } : item) });
    expect(breakdown.total).toBe(97.75);
    expect(breakdown.rows[1].amount).toBe(57.75);
    expect(breakdown.rows[1].labelFa).toBe('پیک');
  });

  it('never includes a cash-labelled non-revenue funding source or historical previous balances', () => {
    const breakdown = closingCashSalesSources({ baseCashSales: 100, summaries: [
      source('owner_funding', 'cash', 700, { included_in_revenue: false }),
      source('cash_source', 'cash', 15),
    ] });
    expect(breakdown.total).toBe(115);
    expect(breakdown.rows).toHaveLength(2);
  });

  it('maintains a single drawer formula even with owner funding, purchase cash out, and network sales', () => {
    const result = cashReconciliationSnapshot({
      openingCash: 500, currentCashSales: 1840,
      revenueEntries: [{ amount: 520, payment_method: 'cash' }, { amount: 900, payment_method: 'card' }],
      ledgerMovements: [
        { id: 'funding', direction: 'in', amount: 300, movement_type: 'owner_injection' },
        { id: 'purchase', direction: 'out', amount: 120, movement_type: 'cash_purchase' },
      ],
      actualCash: 3040,
    });
    expect(result.cashSales).toBe(2360);
    expect(result.cashIn).toBe(300);
    expect(result.cashOut).toBe(120);
    expect(result.expectedCash).toBe(3040);
    expect(result.difference).toBe(0);
    expect(result.revenueToday).toBe(3260); // funding is not sales
  });

  it('does not present negative expected drawer as normal cash count variance', () => {
    const result = cashReconciliationSnapshot({ openingCash: 0, currentCashSales: 0,
      ledgerMovements: [{ direction: 'out', amount: 1320 }], actualCash: 1320 });
    expect(result.expectedCash).toBe(-1320);
    expect(result.difference).toBeNull();
    expect(result.cashFundingRequired).toBe(1320);
  });

  it('refuses to advance to final review when cash-source classification does not match', () => {
    expect(closingStepIssues(0, [
      { key: 'cashSources', passed: false },
      { key: 'cash', passed: true },
    ])).toHaveLength(1);
  });

  it('connects the main closing to one compact reconciliation, cash sources, funding and a visual ERP review', async () => {
    const [workspace, panel, salesCard, reviewCard] = await Promise.all([
      code('../src/components/sales/UnifiedSalesClosing.jsx'),
      code('../src/components/sales/CashReconciliationPanel.jsx'),
      code('../src/components/sales/ClosingCashSalesSources.jsx'),
      code('../src/components/sales/ClosingFinalReview.jsx'),
    ]);
    expect(workspace.match(/<CashReconciliationPanel/g)).toHaveLength(1);
    expect(workspace.match(/<ClosingFundingPanel/g)).toHaveLength(1);
    expect(workspace).toContain('compact');
    expect(workspace).toContain('<ClosingCashSalesSources breakdown={cashSalesBreakdown}');
    expect(workspace).toContain('<ClosingFinalReview');
    expect(workspace).toContain('cashSalesSourcesMatched');
    expect(panel).toContain('data-testid="drawer-cash-equation"');
    expect(panel).toContain('data-testid="compact-cash-variance"');
    expect(salesCard).toContain('data-testid="closing-cash-sales-sources"');
    expect(reviewCard).toContain('data-testid="closing-next-opening-preview"');
    expect(reviewCard).toContain('canPreviewOpening');
    expect(reviewCard).toContain('onEditCash');
    expect(workspace).toContain('const closingCash = actualCount !== null && cashContextReady && !ledgerOverdrawn ? actualCount : null;');
  });

  it('never auto-posts a funding payment just by opening the visual cash card', async () => {
    const [workspace, funding] = await Promise.all([
      code('../src/components/sales/UnifiedSalesClosing.jsx'),
      code('../src/components/sales/ClosingFundingPanel.jsx'),
    ]);
    expect(workspace).toContain('fundingContent={cashContextReady ? <ClosingFundingPanel');
    expect(funding).toContain("supabase.rpc('erp_fund_sales_closing_drawer',request)");
    expect(funding).toContain('received&&note.trim().length>=10');
    expect(funding).toContain("onClick={submit}");
  });
});
