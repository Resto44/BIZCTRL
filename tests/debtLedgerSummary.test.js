import { describe, expect, it } from 'vitest';
import { buildDebtLedgerSummary, isOverdueDebtRecord } from '../src/lib/debtLedgerSummary';
const now = new Date(2026, 9, 24, 14);
const debt = { id: '1', type: 'receivable', party_type: 'customer', customer_id: 'a', party_name: 'Same name', remaining_amount: '100.50', paid_amount: '10', status: 'partial', due_date: '2026-10-24' };
describe('ERP debt totals and aging', () => {
  it('adds numeric strings, excludes cancelled/written-off balances and keeps supplier payments out of collections', () => {
    const result = buildDebtLedgerSummary([
      debt,
      { ...debt, id: '2', customer_id: 'b', remaining_amount: '20.25', paid_amount: '5' },
      { ...debt, id: '3', status: 'written_off', remaining_amount: '999', paid_amount: '3' },
      { ...debt, id: '4', status: 'voided', remaining_amount: '900', paid_amount: '900' },
      { ...debt, id: '5', type: 'liability', remaining_amount: '40', paid_amount: '200' },
    ], now);
    expect(result.totalReceivable).toBe(120.75);
    expect(result.totalLiability).toBe(40);
    expect(result.totalCollected).toBe(18);
    expect(result.topDebtors).toHaveLength(2);
    expect(result.topDebtors.map(row => row.id)).toEqual(['customer:a', 'customer:b']);
  });
  it('does not mark a debt overdue before its due day ends and respects 30/60-day boundaries', () => {
    expect(isOverdueDebtRecord(debt, now)).toBe(false);
    const result = buildDebtLedgerSummary([
      debt,
      { ...debt, id: '2', remaining_amount: 30, due_date: '2026-09-24' },
      { ...debt, id: '3', remaining_amount: 60, due_date: '2026-08-25' },
      { ...debt, id: '4', remaining_amount: 61, due_date: '2026-08-24' },
    ], now);
    expect(result.aging).toEqual({ current: 100.5, '30d': 30, '60d': 60, '90d+': 61 });
    expect(result.totalOverdue).toBe(151);
  });
  it('never merges unlinked legacy records just because their names match', () => {
    const result = buildDebtLedgerSummary([{ ...debt, customer_id: null }, { ...debt, id: '2', customer_id: null }], now);
    expect(result.topDebtors).toHaveLength(2);
  });
});
