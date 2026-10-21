import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { cashReconciliationSnapshot } from '../src/lib/closing/CashReconciliationLedger.js';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');

describe('Sales Closing: POS optional, manual/offline available', () => {
  it('closes a zero-device, cash-only shift when opening and Actual Cash reconcile', () => {
    const ledger = cashReconciliationSnapshot({
      openingCash: 100,
      currentCashSales: 300,
      revenueEntries: [],
      ledgerMovements: [{ direction: 'out', amount: 50, is_reversed: false }],
      actualCash: 350,
    });
    expect(ledger).toMatchObject({
      revenueToday: 300, cardSales: 0, cashSales: 300, expectedCash: 350,
      actualCash: 350, difference: 0, varianceStatus: 'balanced',
      ledgerOverdrawn: false,
    });
  });

  it('treats manually recorded network and customer credit as sales, not drawer cash', () => {
    const ledger = cashReconciliationSnapshot({
      openingCash: 0, currentCashSales: 300,
      revenueEntries: [{ amount: 160, payment_method: 'card' }, { amount: 30, payment_method: 'credit' }],
      actualCash: 300,
    });
    expect(ledger.revenueToday).toBe(490);
    expect(ledger.expectedCash).toBe(300);
    expect(ledger.difference).toBe(0);
    expect(ledger.cardSales).toBe(160);
    expect(ledger.creditSales).toBe(30);
  });

  it('does not bypass physical count or ledger verification for an offline closing', async () => {
    const src = await read('../src/components/sales/UnifiedSalesClosing.jsx');
    expect(src).toContain("const [salesEntryMode, setSalesEntryMode] = useState('manual')");
    expect(src).toContain('data-testid="sales-entry-manual"');
    expect(src).toContain('data-testid="sales-entry-automatic"');
    expect(src).toContain("disabled={!automaticTotalsEnabled || Boolean(initial?.id)}");
    expect(src).toContain('data-testid="offline-sales-audit"');
    expect(src).toContain('data-testid="closing-blockers"');
    expect(src).toContain('id="quick-closing-cashSales"');
    expect(src).toContain('id={`quick-closing-network-${entry.id}`}');
    expect(src).toContain("passed: posEntries.every(e => e.amount === '' || e.amount == null");
    expect(src).toContain('p_cashier_id: effectiveCashierId');
    expect(src).toContain("cashLedgerContext.opening_verified === true");
    expect(src).toContain("if (!savingDraft && actualCount === null) nextErrors.actualCash");
    expect(src).toContain("cashLedgerUnavailable || !cashContextReady || ledgerOverdrawn || !allValid");
    expect(src).not.toContain("nextErrors.sales_notes =");
    expect(src).not.toContain("if (isManager && (custLoading || posLoading))");
    expect(src).not.toContain("No posted ERP cash sales were found.");
    // Manual totals must never depend on a non-existent trusted POS feed.
    expect(src).toContain("const automaticTotalsEnabled = false;");
    expect(src).toContain("automaticClosingEnabled = Boolean(salesEntryMode === 'automatic'");
  });
});
