import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Sales closing workspace responsive and validation contract', () => {
  it('uses a viewport-bounded, scroll-safe workspace dialog on mobile and desktop', async () => {
    const sales = await source('../src/pages/Sales.jsx');
    const dialogShell = 'h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-h-[calc(100dvh-1rem)] max-w-3xl flex-col gap-0 overflow-hidden';

    expect(sales.match(new RegExp(dialogShell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(2);
    expect(sales).toContain('sm:max-h-[calc(100dvh-3rem)] sm:w-full sm:rounded-lg');
    expect(sales).toContain('min-h-0 min-w-0 flex-1 overflow-hidden');
    expect(sales).not.toContain('100vw');
  });

  it('keeps section numbering unique whether optional custom sales sources exist or not', async () => {
    const workspace = await source('../src/components/sales/ERPSalesWorkspace.jsx');

    expect(workspace).toContain("pos: '3'");
    expect(workspace).toContain("credit: '4'");
    expect(workspace).toContain("custom: '5'");
    expect(workspace).toContain('purchases: String(hasCustomSources ? 6 : 5)');
    expect(workspace).toContain('sectionNum={sectionNumbers.pos}');
    expect(workspace).toContain('sectionNum={sectionNumbers.credit}');
    expect(workspace).toContain('sectionNum={sectionNumbers.save}');
    expect(workspace).not.toContain('sectionNum="4½"');
  });

  it('requires an actual cash count and derives the displayed cashier from the selected cashier record', async () => {
    const workspace = await source('../src/components/sales/ERPSalesWorkspace.jsx');

    expect(workspace).toContain('const cashierDisplayName = form.cashier_name || selectedCashier?.full_name || \'\';');
    expect(workspace).toContain('cashiers.length !== 1');
    expect(workspace).toContain('passed: actualCount !== null && (remainingDifference === 0 || managerApproved)');
    expect(workspace).toContain("toast.error('Actual cash count is required before closing the shift.');");
    expect(workspace).toContain('disabled={isSubmitting || purchasesLoading || !allValid}');
  });

  it('keeps headers, badges, summaries and validation rows shrinkable on narrow viewports', async () => {
    const workspace = await source('../src/components/sales/ERPSalesWorkspace.jsx');

    expect(workspace).toContain('flex w-full min-w-0 items-center justify-between gap-2');
    expect(workspace).toContain('max-w-[7.5rem] overflow-hidden text-ellipsis whitespace-nowrap');
    expect(workspace).toContain('max-w-[8rem] shrink-0 truncate text-right');
    expect(workspace).toContain('pb-[calc(env(safe-area-inset-bottom)+1.5rem)]');
    expect(workspace).not.toContain('100vw');
  });
});
