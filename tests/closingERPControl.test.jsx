/** @vitest-environment jsdom */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cashReconciliationSnapshot, closingSourceRevenueEntries, paymentBuckets, sumClosingMoney } from '../src/lib/closing/CashReconciliationLedger';
import ClosingControlOverview from '../src/components/sales/ClosingControlOverview';
import { createClosingSaveError } from '../src/lib/closing/ClosingRepository';

describe('Closing ERP financial controls', () => {
  it.each([
    ['SALES_CLOSING_ACTUAL_CASH_INVALID', 'physically counted'],
    ['SALES_CLOSING_OPENING_RECONCILIATION_REQUIRED', 'opening drawer'],
    ['SALES_CLOSING_CASH_LEDGER_OVERDRAWN', 'negative'],
    ['SALES_CLOSING_UNPOSTED_OWNER_CASH_DENIED', 'authorized cash ledger'],
  ])('surfaces the actionable server guard %s', (code, message) => {
    const error = createClosingSaveError({ message: code, code: 'P0001' }, 'request-1');
    expect(error.code).toBe(code);
    expect(error.userMessage).toContain(message);
    expect(error.requestId).toBe('request-1');
  });
  it('excludes informational sources, including split driver rows, from cash and revenue', () => {
    const entries = closingSourceRevenueEntries([
      { source: { included_in_revenue: false, default_payment_method: 'cash' }, today: 900 },
      { source: { included_in_revenue: false, allows_driver_entries: true }, driverEntries: [{ cash_amount: 800, network_amount: 700 }] },
      { source: { allows_driver_entries: true }, driverEntries: [{ cash_amount: 100, network_amount: 200 }] },
      { source: { default_payment_method: 'credit' }, today: 50, previous: 1000 },
    ]);
    const result = cashReconciliationSnapshot({ openingCash: 500, revenueEntries: entries, actualCash: 600 });
    expect(result).toMatchObject({ revenueToday: 350, expectedCash: 600, difference: 0, cashSales: 100, cardSales: 200, creditSales: 50 });
    expect(paymentBuckets([{ amount: 100, payment_method: 'cash', included_in_revenue: false }]).cash).toBe(0);
  });

  it('keeps decimal sales and ledger totals exact across many rows', () => {
    const result = cashReconciliationSnapshot({
      currentCashSales: 0.1,
      revenueEntries: [{ amount: 0.2, payment_method: 'cash' }, { amount: 0.1, payment_method: 'card' }, { amount: 0.2, payment_method: 'credit' }],
      ledgerMovements: Array.from({ length: 1000 }, () => ({ direction: 'in', amount: 0.01 })),
      actualCash: 10.3,
    });
    expect(result).toMatchObject({ cashSales: 0.3, revenueToday: 0.6, cashIn: 10, expectedCash: 10.3, difference: 0 });
    expect(sumClosingMoney(0.1, 0.2, -0.3)).toBe(0);
  });

  it.each(['', ' ', '.', '-1', '1.001', 'Infinity', null, undefined])('does not turn invalid physical count %s into zero', actualCash => {
    expect(cashReconciliationSnapshot({ actualCash }).actualCash).toBeNull();
    expect(cashReconciliationSnapshot({ actualCash }).varianceStatus).toBe('pending');
  });

  it('accepts an explicitly counted zero', () => {
    expect(cashReconciliationSnapshot({ actualCash: '0.00' })).toMatchObject({ actualCash: 0, difference: 0, varianceStatus: 'balanced' });
  });

  it('debt collection and owner funding increase cash but do not become sales', () => {
    const result = cashReconciliationSnapshot({ currentCashSales: 100, customerCredit: 50, ledgerMovements: [
      { direction: 'in', amount: 30, movement_type: 'debt_payment' },
      { direction: 'in', amount: 20, movement_type: 'owner_injection' },
      { direction: 'out', amount: 10, movement_type: 'cash_expense' },
      { direction: 'in', amount: 500, is_reversed: true },
    ], actualCash: 140 });
    expect(result).toMatchObject({ revenueToday: 150, expectedCash: 140, difference: 0 });
  });

  it('shows unavailable balances as pending in the Arabic overview, not zero or balanced', () => {
    const html = renderToStaticMarkup(<ClosingControlOverview lang="ar" currency="SAR" totalSales={0} expectedCash={null} actualCash={null} difference={null} />);
    const host = document.createElement('div');
    host.innerHTML = html;
    expect(host.querySelector('[data-testid="closing-kpi-expected"]').textContent).toContain('—');
    expect(host.querySelector('[data-testid="closing-kpi-actual"]').textContent).toContain('لم يُعدّ النقد بعد');
    expect(host.querySelector('[data-testid="closing-kpi-variance"]').textContent).not.toContain('متطابق');
    expect(host.querySelector('section').dir).toBe('rtl');
  });
});
