import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { enteredDrawerCash, summarizeDrawerCash } from '../src/lib/executiveDrawerCash.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const finalized = (rest = {}) => ({
  closing_state: 'finalized',
  branch_id: 'rayyan',
  date: '2026-10-09',
  finalized_at: '2026-10-09T14:15:00Z',
  restaurant_cash: 400,
  restaurant_network: 440,
  credit: 45,
  actual_cash: 50,
  closing_cash: 50,
  ...rest,
});

describe('Executive drawer cash — physical closing balance only', () => {
  it('uses entered SAR 50, never the SAR 400 cash sales or SAR 885 total sale', () => {
    expect(enteredDrawerCash(finalized())).toBe(50);
    expect(summarizeDrawerCash([finalized()])).toEqual({
      amount: 50, branches: 1, missingBranches: 0, complete: true,
    });
  });

  it('does not add owner injected money or cash given to owner to entered cash', () => {
    const row = finalized({ actual_cash: 50, closing_cash: 150, owner_cash_injection: 100 });
    expect(enteredDrawerCash(row)).toBe(50);
    expect(summarizeDrawerCash([row]).amount).toBe(50);
  });

  it('accepts a zero physical count but never falls back to cash sales', () => {
    expect(enteredDrawerCash(finalized({ actual_cash: 0, closing_cash: 100, restaurant_cash: 400 }))).toBe(0);
    expect(enteredDrawerCash(finalized({ actual_cash: null, closing_cash: null, restaurant_cash: 400 }))).toBeNull();
    expect(enteredDrawerCash(finalized({ actual_cash: '', closing_cash: 150, owner_cash_injection: 100 }))).toBeNull();
    expect(enteredDrawerCash(finalized({ actual_cash: null, closing_cash: 30, owner_cash_injection: 0 }))).toBe(30);
  });

  it('counts only the latest shift of a branch, ordered by business date then finalization', () => {
    const older = finalized({ actual_cash: 90, finalized_at: '2026-10-09T09:00:00Z' });
    const newer = finalized({ actual_cash: 50, finalized_at: '2026-10-09T14:15:00Z' });
    expect(summarizeDrawerCash([newer, older]).amount).toBe(50);
    expect(summarizeDrawerCash([older, newer]).amount).toBe(50);
    expect(summarizeDrawerCash([newer, finalized({ date: '2026-10-08', actual_cash: 200, finalized_at: '2026-10-10T00:00:00Z' })]).amount).toBe(50);
  });

  it('adds the latest recorded balance per branch, never individual shift balances', () => {
    const otherBranch = finalized({ branch_id: 'other', actual_cash: 20 });
    expect(summarizeDrawerCash([finalized(), otherBranch, finalized({ actual_cash: 40, finalized_at: '2026-10-09T09:00:00Z' })]).amount).toBe(70);
  });

  it('never includes drafts or invents zero for missing cash records', () => {
    const draft = finalized({ closing_state: 'draft', actual_cash: 999 });
    expect(summarizeDrawerCash([draft]).amount).toBeNull();
    const unknown = finalized({ branch_id: 'other', actual_cash: null, closing_cash: null });
    const result = summarizeDrawerCash([finalized(), unknown, draft]);
    expect(result).toMatchObject({ amount: null, branches: 2, missingBranches: 1, complete: false });
  });

  it('renders cash in drawer as a balance, not a contribution to sales composition', async () => {
    const [owner, report, executive] = await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/dashboard/OwnerReportCenter.jsx'),
      source('../src/components/dashboard/ExecutiveSnapshotV2.jsx'),
    ]);
    expect(report).toContain('<ExecutiveSnapshotV2 model={model} copy={copy} />');
    expect(owner).toContain('summarizeDrawerCash(periodSales)');
    expect(executive).toContain('data-testid="snapshot-drawer-cash"');
    expect(executive).toContain('methods.map(method=>');
    expect(executive).toContain('presentation.reconciled');
    expect(executive).toContain('data-testid="snapshot-payment-mix"');
    expect(executive).toContain('Cash sales and cash remaining in drawer are separate.');
    expect(executive).not.toContain('periodMetrics.totalCash');
    expect(executive).toContain('drawerCash?.complete');
    expect(executive).toContain("drawerCash.amount");
  });
});
