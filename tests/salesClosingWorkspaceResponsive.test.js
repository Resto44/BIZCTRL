import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Quick Sales Closing workflow contract', () => {
  it('renders every closing group in one continuous scrollable workspace without accordion interaction', async () => {
    const workspace = await source('../src/components/sales/ERPSalesWorkspace.jsx');

    expect(workspace).toContain('touch-pan-y overflow-y-auto overscroll-contain');
    expect(workspace).toContain('grid grid-rows-[1fr] opacity-100');
    expect(workspace).toContain('title="Sales Entry"');
    expect(workspace).toContain('title="Cash Reconciliation"');
    expect(workspace).toContain('title="Operating Result"');
    expect(workspace).not.toContain('activeSection === key ? null : key');
  });

  it('keeps the primary fields and totals auto-calculated for fast entry', async () => {
    const workspace = await source('../src/components/sales/ERPSalesWorkspace.jsx');

    expect(workspace).toContain('label="Cash Sales"');
    expect(workspace).toContain('label="Card / Network Sales"');
    expect(workspace).toContain('label="Other Payment"');
    expect(workspace).toContain('label="Total Sales"');
    expect(workspace).toContain('cashSales + networkTotal + creditTotal + customTotal');
    expect(workspace).toContain('actualCount - expectedCash');
    expect(workspace).toContain('totalSales - approvedPurchasesTotal - expensesTotal');
  });

  it('loads existing purchases and expenses by secure restaurant and branch scope without duplicate entry', async () => {
    const workspace = await source('../src/components/sales/ERPSalesWorkspace.jsx');

    expect(workspace).toContain("queryKey: ['approved_purchases_for_date'");
    expect(workspace).toContain("queryKey: ['closing_expenses_for_date'");
    expect(workspace).toContain(".from('expenses')");
    expect(workspace).toContain(".eq('restaurant_id', activeRestaurant.id)");
    expect(workspace).toContain('const expensesTotal = useMemo');
    expect(workspace).toContain('Paid Purchases');
    expect(workspace).toContain('Credit Purchases');
  });

  it('uses inline validation, safe mobile spacing and a sticky save action', async () => {
    const workspace = await source('../src/components/sales/ERPSalesWorkspace.jsx');

    expect(workspace).toContain("nextErrors.actualCash = 'Actual Cash is required.'");
    expect(workspace).toContain("nextErrors.credit = 'Credit customer is required.'");
    expect(workspace).toContain('focusField(firstError)');
    expect(workspace).toContain('pb-[calc(env(safe-area-inset-bottom)+6.5rem)]');
    expect(workspace).toContain('h-full min-h-0 min-w-0 flex-col');
    expect(workspace).toContain('[-webkit-overflow-scrolling:touch]');
    expect(workspace).toContain('dir="ltr"');
    expect(workspace).toContain("{currency}{'\\u00A0'}{");
    expect(workspace).toContain('sticky bottom-0 z-20');
    expect(workspace).not.toContain('100vw');

    const sales = await source('../src/pages/Sales.jsx');
    expect(sales).toContain('h-[calc(100dvh-1rem)] min-h-0');
    expect(sales).toContain('flex min-h-0 min-w-0 flex-1 overflow-hidden');
  });

  it('keeps existing security and prevents a duplicate finalized closing before save', async () => {
    const sales = await source('../src/pages/Sales.jsx');
    const workspace = await source('../src/components/sales/ERPSalesWorkspace.jsx');

    expect(sales).toContain(".eq('restaurant_id', data.restaurant_id)");
    expect(sales).toContain(".eq('date', data.date)");
    expect(sales).toContain(".eq('shift', data.shift)");
    expect(sales).toContain('_alreadyExists: true');
    expect(workspace).toContain('Closing already exists for this branch and shift.');
    expect(workspace).toContain('Daily closing saved successfully.');
    expect(workspace).toContain('Save Daily Closing');
  });
});
