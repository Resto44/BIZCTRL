import { describe, expect, it } from 'vitest';
import {
  buildCleanClosingDraft,
  calculateCashReconciliation,
  calculateOperatingResult,
  calculatePaymentReconciliation,
  calculateSalesSources,
  moneyToMinor,
  minorToMoney,
} from './ClosingCalculations';

describe('ClosingCalculations', () => {
  it('keeps a new Closing draft clean while preserving only its supplied session identity', () => {
    const draft = buildCleanClosingDraft({
      date: '2026-08-26',
      branch: 'riyadh',
      branchId: '11111111-1111-1111-1111-111111111111',
      shift: 'Evening',
      cashierId: '22222222-2222-2222-2222-222222222222',
      cashierName: 'Cashier',
    });

    expect(draft).toMatchObject({
      date: '2026-08-26',
      branch: 'riyadh',
      shift: 'Evening',
      cashier_name: 'Cashier',
      opening_cash: '',
      actual_cash: '',
      owner_cash_injection: '',
      sales_notes: '',
      cash_notes: '',
      closing_state: 'draft',
    });
    expect(draft.sales_sources_json).toEqual([]);
    expect(draft.payment_reconciliation_json).toEqual([]);
  });

  it('uses only today amounts as ERP revenue while retaining previous as historical context', () => {
    const dayTwo = calculateSalesSources([
      { id: 'delivery', today: '200.00', previous: '400.00' },
      { id: 'wholesale', today: '150.00', previous: '350.00' },
    ]);

    expect(minorToMoney(dayTwo.erpRevenueMinor)).toBe(350);
    expect(dayTwo.rows.map((row) => minorToMoney(row.totalMinor))).toEqual([600, 500]);

    const dayThree = calculateSalesSources([
      { id: 'delivery', today: '100', previous: '600' },
      { id: 'wholesale', today: '200', previous: '500' },
    ]);
    expect(minorToMoney(dayThree.erpRevenueMinor)).toBe(300);
    expect(dayThree.rows.map((row) => minorToMoney(row.totalMinor))).toEqual([700, 700]);
  });

  it('handles decimal money without binary floating point drift', () => {
    expect(moneyToMinor('0.10') + moneyToMinor('0.20')).toBe(30);
    expect(minorToMoney(moneyToMinor('0.10') + moneyToMinor('0.20'))).toBe(0.3);
  });

  it('calculates shortage, overage, and balanced cash from the same canonical formula', () => {
    const shortage = calculateCashReconciliation({ openingCash: '100', cashSales: '885', actualCash: '900' });
    const overage = calculateCashReconciliation({ openingCash: '100', cashSales: '885', actualCash: '1000' });
    const balanced = calculateCashReconciliation({ openingCash: '100', cashSales: '885', actualCash: '985' });

    expect([minorToMoney(shortage.expectedMinor), minorToMoney(shortage.differenceMinor), shortage.status]).toEqual([985, -85, 'SHORTAGE']);
    expect([minorToMoney(overage.differenceMinor), overage.status]).toEqual([15, 'OVERAGE']);
    expect([minorToMoney(balanced.differenceMinor), balanced.status]).toEqual([0, 'BALANCED']);
  });

  it('reconciles each payment method independently from the cash drawer', () => {
    const reconciliation = calculatePaymentReconciliation([
      { payment_method: 'card', expected: '500', actual: '480' },
      { payment_method: 'wallet', expected: '100', actual: '100' },
    ]);

    expect(reconciliation.rows.map((row) => [row.payment_method, minorToMoney(row.differenceMinor), row.status]))
      .toEqual([['card', -20, 'SHORTAGE'], ['wallet', 0, 'BALANCED']]);
    expect(reconciliation.hasVariance).toBe(true);
  });

  it('keeps cash variance separate from operating result', () => {
    const result = calculateOperatingResult({ revenue: '1000', purchases: '250', operatingExpenses: '150' });
    expect(minorToMoney(result.operatingResultMinor)).toBe(600);
  });
});
