import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Unified Sales Closing workflow contract', () => {
  it('uses one compact, continuous mobile-first closing workflow instead of the former nine-step form', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('Daily Sales Closing');
    expect(workspace).toContain("data-testid=\"quick-closing-auto-summary\"");
    expect(workspace).toContain('Daily Closing Summary');
    expect(workspace).toContain('touch-pan-y overflow-y-auto overscroll-contain');
    expect(workspace).toContain('grid grid-cols-1 gap-3 lg:grid-cols-2');
    expect(workspace).toContain('pb-[calc(env(safe-area-inset-bottom)+6.5rem)]');
    expect(workspace).toContain('env(safe-area-inset-bottom)+0.75rem');
    expect(workspace).not.toContain('100vw');
  });

  it('defaults every role to the streamlined Quick Closing view and does not mask the authenticated operator behind a pending employee query', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain("const [closingView, setClosingView] = useState('quick');");
    expect(workspace).toContain("cashierDisplayName || (empLoading ? 'Loading…' : empError ? 'Unable to load cashier' : 'No cashier')");
  });

  it('loads existing sales, POS and cash-register data automatically in restaurant, branch and date scope', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain("queryKey: ['quick_closing_automatic_sources'");
    expect(workspace).toContain("from('daily_cash_settlements')");
    expect(workspace).toContain("scoped('payments'");
    expect(workspace).toContain("from('pos_reconciliation')");
    expect(workspace).toContain(".eq('restaurant_id', activeRestaurant.id)");
    expect(workspace).toContain(".eq('branch_id', selectedBranchId)");
    expect(workspace).toContain(".eq('date', form.date)");
    expect(workspace).toContain('Record sales at POS first.');
    expect(workspace).toContain('Exceptional Cash Adjustment');
  });

  it('calculates total sales, cash reconciliation, purchases, expenses and operating result automatically', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('cashSales + networkTotal + creditTotal + otherPaymentTotal');
    expect(workspace).toContain('actualCount - expectedCash');
    expect(workspace).toContain('totalSales - approvedPurchasesTotal - expensesTotal');
    expect(workspace).toContain('expected_closing_cash');
    expect(workspace).toContain('Actual Cash');
    expect(workspace).toContain('Cash balanced.');
  });

  it('uses accessible numeric inputs, stable currency presentation and a non-obstructive sticky action area', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('inputMode="decimal"');
    expect(workspace).toContain('dir="ltr"');
    expect(workspace).toContain('tabular-nums');
    expect(workspace).toContain('whitespace-nowrap');
    expect(workspace).toContain('className="border-t border-border bg-background/95');
    expect(workspace).toContain('Save Draft');
    expect(workspace).toContain('Finalize Closing');
  });

  it('preserves scoped purchase and expense loading, inline validation, and duplicate-closing protection', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');
    const sales = await source('../src/pages/Sales.jsx');

    expect(workspace).toContain("queryKey: ['approved_purchases_for_date'");
    expect(workspace).toContain("queryKey: ['closing_expenses_for_date'");
    expect(workspace).toContain(".from('expenses')");
    expect(workspace).toContain("nextErrors.actualCash = 'Actual Cash is required.'");
    expect(workspace).toContain('focusField(firstError)');
    expect(workspace).toContain('Closing already completed for this branch and shift.');
    expect(sales).toContain(".eq('restaurant_id', data.restaurant_id)");
    expect(sales).toContain(".eq('date', data.date)");
    expect(sales).toContain(".eq('shift', data.shift)");
    expect(sales).toContain('_alreadyExists: true');
  });

  it('clears automatic totals when the closing scope changes and blocks a save when ERP source reads fail', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('const automaticClosingScope = [');
    expect(workspace).toContain('previous.scope !== automaticClosingScope');
    expect(workspace).toContain('const snapshotMatchesScope = automaticClosingSnapshot.scope === automaticClosingScope');
    expect(workspace).toContain('const queryError = [settlementResults, paymentResults, posResults, creditResults]');
    expect(workspace).toContain('if (queryError) throw queryError;');
    expect(workspace).toContain('automaticClosingUnavailable');
    expect(workspace).toContain('Retry ERP data load');
    expect(workspace).toContain('disabled={isSubmitting || purchasesLoading || expensesLoading || autoSourceLoading || automaticClosingUnavailable || !allValid}');
  });
});
