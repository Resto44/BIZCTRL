import { describe, expect, it } from 'vitest';
import {
  PAYMENT_METHODS,
  cashReconciliationSnapshot,
  dailyClosingDefaults,
  dailyFixedExpenseAllocation,
  paymentBuckets,
  walletFirstSettlementAllocation,
} from '../src/lib/closing/CashReconciliationLedger';
import { buildSalesSourceClosingSnapshots } from '../src/lib/salesSourceClosingLifecycle';

describe('ERP cash reconciliation ledger', () => {
  it('implements the required realistic shortage scenario without double counting non-cash revenue', () => {
    const result = cashReconciliationSnapshot({
      openingCash: 500,
      currentCashSales: 1000,
      revenueEntries: [{ amount: 300, payment_method: 'card' }],
      customerCredit: 200,
      ledgerMovements: [{ direction: 'out', amount: 100, movement_type: 'cash_expense' }],
      actualCash: 1250,
      expenses: 100,
    });

    expect(result.revenueToday).toBe(1500);
    expect(result.cashSales).toBe(1000);
    expect(result.cardSales).toBe(300);
    expect(result.creditSales).toBe(200);
    expect(result.nonCashSales).toBe(300);
    expect(result.expectedCash).toBe(1400);
    expect(result.actualCash).toBe(1250);
    expect(result.difference).toBe(-150);
    expect(result.shortage).toBe(150);
    expect(result.ownerSettlementRequired).toBe(150);
    expect(result.branchWalletApplied).toBe(0);
    expect(result.ownerPaymentRequired).toBe(150);
    expect(result.overage).toBe(0);
  });

  it('never adds card, bank, online, wallet, customer credit, or Previous values to physical cash', () => {
    const payments = paymentBuckets([
      { amount: 300, payment_method: 'card' },
      { amount: 250, payment_method: 'bank_transfer' },
      { amount: 150, payment_method: 'online' },
      { amount: 100, payment_method: 'wallet' },
      { amount: 200, payment_method: 'credit' },
    ]);
    const result = cashReconciliationSnapshot({
      openingCash: 500,
      currentCashSales: 1000,
      revenueEntries: [
        { amount: payments.card, payment_method: PAYMENT_METHODS.CARD },
        { amount: payments.bank_transfer, payment_method: PAYMENT_METHODS.BANK_TRANSFER },
        { amount: payments.online, payment_method: PAYMENT_METHODS.ONLINE },
        { amount: payments.wallet, payment_method: PAYMENT_METHODS.WALLET },
        { amount: payments.credit, payment_method: PAYMENT_METHODS.CREDIT },
      ],
      actualCash: 1500,
    });

    expect(result.revenueToday).toBe(2000);
    expect(result.expectedCash).toBe(1500);
    expect(result.difference).toBe(0);
  });

  it('allocates a shortage to the Branch Wallet before owner funding', () => {
    expect(walletFirstSettlementAllocation({ requiredFunding: 166.67, branchWalletAvailable: 500 })).toMatchObject({
      branchWalletApplied: 166.67,
      ownerPaymentRequired: 0,
      walletRemaining: 333.33,
      totalCovered: 166.67,
      settlementStatus: 'Paid from Branch Wallet',
    });
    expect(walletFirstSettlementAllocation({ requiredFunding: 166.67, branchWalletAvailable: 100 })).toMatchObject({
      branchWalletApplied: 100,
      ownerPaymentRequired: 66.67,
      walletRemaining: 0,
      totalCovered: 166.67,
      settlementStatus: 'Partially paid from Branch Wallet',
    });
    expect(walletFirstSettlementAllocation({ requiredFunding: 166.67, branchWalletAvailable: 0 })).toMatchObject({
      branchWalletApplied: 0,
      ownerPaymentRequired: 166.67,
      walletRemaining: 0,
      totalCovered: 166.67,
      settlementStatus: 'Owner payment required',
    });
    expect(walletFirstSettlementAllocation({ requiredFunding: 0, branchWalletAvailable: 500 })).toMatchObject({
      branchWalletApplied: 0,
      ownerPaymentRequired: 0,
      totalCovered: 0,
      settlementStatus: 'No funding required',
    });
  });

  it('allocates fixed monthly expenses per configured business day without making funding revenue', () => {
    const fixedToday = dailyFixedExpenseAllocation([{ monthly_amount: 2000, allocation_days: 30, is_fixed: true }]);
    expect(fixedToday).toBe(66.67);
    const result = cashReconciliationSnapshot({
      currentCashSales: 150,
      purchases: 200,
      expenses: fixedToday,
      otherOperatingCosts: 50,
      actualCash: 0,
      branchWalletAvailable: 200,
    });
    expect(result.operatingResult).toBe(-166.67);
    expect(result.branchWalletApplied).toBe(150);
    expect(result.ownerPaymentRequired).toBe(0);
    expect(result.operatingResult).toBe(-166.67);
  });

  it('keeps an overage separate from revenue and owner settlement', () => {
    const result = cashReconciliationSnapshot({ openingCash: 100, currentCashSales: 50, actualCash: 175 });
    expect(result.revenueToday).toBe(50);
    expect(result.expectedCash).toBe(150);
    expect(result.overage).toBe(25);
    expect(result.shortage).toBe(0);
    expect(result.ownerSettlementRequired).toBe(0);
  });

  it('keeps operating result independent from cash reconciliation', () => {
    const result = cashReconciliationSnapshot({
      openingCash: 500,
      currentCashSales: 1000,
      revenueEntries: [{ amount: 300, payment_method: 'card' }, { amount: 200, payment_method: 'credit' }],
      ledgerMovements: [{ direction: 'out', amount: 100, movement_type: 'cash_expense' }],
      actualCash: 1250,
      purchases: 250,
      expenses: 100,
    });
    expect(result.operatingResult).toBe(1150);
    expect(result.shortage).toBe(150);
  });

  it('creates a new daily Closing with all daily inputs reset and no prior-day data copied', () => {
    const next = dailyClosingDefaults({
      date: '2026-08-27', branch: 'main', branchId: 'branch-1', shift: 'Morning', cashierId: 'cashier-1', cashierName: 'Cashier',
    });
    expect(next.date).toBe('2026-08-27');
    expect(next.restaurant_cash).toBe(0);
    expect(next.restaurant_network).toBe(0);
    expect(next.credit).toBe(0);
    expect(next.actual_cash).toBeNull();
    expect(next.sales_sources_json).toEqual([]);
    expect(next.credit_entries_json).toEqual([]);
    expect(next.payment_reconciliation_json).toEqual([]);
  });

  it('persists source Previous, Today, Total, payment method, and optional subcategory without counting Previous as Today revenue', () => {
    const [snapshot] = buildSalesSourceClosingSnapshots([{
      source: { id: 'source-1', name_en: 'Delivery', category: 'delivery', subcategory: 'Marketplace', default_payment_method: 'card' },
      previous: 600,
      today: 300,
      total: 900,
    }], { date: '2026-08-27', branch: 'main', shift: 'Morning', cashierId: 'cashier-1' });

    expect(snapshot.previous_amount).toBe(600);
    expect(snapshot.today_amount).toBe(300);
    expect(snapshot.total_amount).toBe(900);
    expect(snapshot.payment_method).toBe('card');
    expect(snapshot.subcategory).toBe('Marketplace');
    expect(snapshot.today_amount).not.toBe(snapshot.total_amount);
  });
});
