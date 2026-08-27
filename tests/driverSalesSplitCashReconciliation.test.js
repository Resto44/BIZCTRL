import { describe, expect, it } from 'vitest';
import { cashReconciliationSnapshot } from '../src/lib/closing/CashReconciliationLedger';
import { driverSourceEntryAmounts } from '../src/lib/salesSourceClosingLifecycle';

describe('split Driver Sales Cash Reconciliation', () => {
  it('adds only the cash side of a driver entry to expected physical cash while retaining both sides in revenue', () => {
    const driver = driverSourceEntryAmounts({ cash_amount: 100, network_amount: 200 });
    const reconciliation = cashReconciliationSnapshot({
      openingCash: 0,
      currentCashSales: 0,
      actualCash: 100,
      revenueEntries: [
        { amount: driver.cash, payment_method: 'cash' },
        { amount: driver.network, payment_method: 'card' },
      ],
    });

    expect(driver.total).toBe(300);
    expect(reconciliation.cashSales).toBe(100);
    expect(reconciliation.cardSales).toBe(200);
    expect(reconciliation.revenueToday).toBe(300);
    expect(reconciliation.expectedCash).toBe(100);
    expect(reconciliation.difference).toBe(0);
  });
});
