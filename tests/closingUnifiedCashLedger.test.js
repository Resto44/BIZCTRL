import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cashReconciliationSnapshot } from '../src/lib/closing/CashReconciliationLedger';
import { closingFundingProposal } from '../src/lib/closing/ClosingFunding';

const workspace = readFileSync('src/components/sales/UnifiedSalesClosing.jsx', 'utf8');
const simple = readFileSync('src/components/sales/SimpleClosingCash.jsx', 'utf8');
const wallet = readFileSync('src/components/sales/ClosingWalletChoice.jsx', 'utf8');
const openingSql = readFileSync('supabase/migrations/20261021170000_sales_closing_audited_opening_verification.sql', 'utf8');
const fundingSql = readFileSync('supabase/migrations/20261022213539_closing_drawer_funding.sql', 'utf8');

describe('One canonical ERP Cash Reconciliation card', () => {
  it('has one simple counted-cash editor and an owner/restaurant wallet choice', () => {
    expect(workspace.match(/<SimpleClosingCash\b/g)).toHaveLength(1);
    expect(workspace.match(/<ClosingFundingPanel\b/g)).toHaveLength(1);
    expect(workspace).toContain('data-testid="closing-cash-action"');
    expect(workspace).toContain('inputId="quick-closing-actualCash"');
    expect(workspace).toContain('fundingContent={cashContextReady ? <ClosingFundingPanel');
    expect(workspace).toContain('cashFundingRequired={reconciliation.cashFundingRequired}');
    expect(workspace).toContain('movements={asRecordArray(cashLedgerContext.movements)');
    expect(simple).toContain('data-testid="simple-closing-cash"');
    expect(simple).toContain('<ClosingNumericInput id={inputId}');
    expect(simple).toContain('{fundingContent}');
    expect(wallet).toContain("['restaurant','owner']");
    expect(wallet).toContain('data-testid="closing-wallet-choice"');
    expect(workspace).toContain("wallet_funding: requestedClosingState === 'finalized' ? activeFundingPlan : null");
  });

  it('shows counted drawer cash even when its ledger is negative, without fabricated overage', () => {
    const snap = cashReconciliationSnapshot({
      openingCash: 0, currentCashSales: 0, actualCash: 1320,
      ledgerMovements: [{ direction: 'out', amount: 1320, movement_type: 'cash_expense' }],
    });
    expect(snap).toMatchObject({
      expectedCash: -1320, actualCash: 1320, difference: null,
      cashFundingRequired: 1320, ledgerOverdrawn: true,
      varianceStatus: 'ledger_overdrawn',
    });
    expect(workspace).not.toContain('Unexplained difference from cash count');
    expect(workspace).not.toContain('actualCount - expectedCash');
    expect(simple).toContain('ledgerOverdrawn &&');
    expect(simple).toContain('!ledgerOverdrawn &&');
    expect(simple).toContain('Count the notes and coins and enter the total.');
    expect(workspace).toContain("const closingCash = actualCount !== null && cashContextReady && !ledgerOverdrawn ? actualCount : null;");
  });

  it('counts only a physically received, posted funding movement in the drawer; it never adds funding to sales', () => {
    const base = {
      openingCash: 50, currentCashSales: 200, actualCash: 370,
      revenueEntries: [{ amount: 900, payment_method: 'card' }],
      ledgerMovements: [{ id: 'paid-1', direction: 'out', amount: 180, movement_type: 'cash_expense' }],
    };
    const before = cashReconciliationSnapshot(base);
    const after = cashReconciliationSnapshot({
      ...base, ledgerMovements: [...base.ledgerMovements,
        { id: 'received-1', direction: 'in', amount: 300, movement_type: 'cash_deposit',
          source_module: 'Treasury', payment_method: 'cash' }],
    });
    expect(before).toMatchObject({ revenueToday: 1100, expectedCash: 70, actualCash: 370, difference: 300 });
    expect(after).toMatchObject({ revenueToday: 1100, expectedCash: 370, actualCash: 370, difference: 0 });
    expect(closingFundingProposal(before.expectedCash, before.actualCash).toCount).toBe(300);
    expect(fundingSql).toContain('p_received IS NOT TRUE');
    expect(fundingSql).toContain('AND cashier_id=p_cashier_id AND shift=p_shift');
    expect(fundingSql).toContain('CLOSING_FUNDING_CLOSED_PERIOD');
  });

  it('carries verified actual cash from the last finalized eligible drawer as next Opening Cash, not wallet or cash sales', () => {
    expect(openingSql).toContain("p.closing_state = 'finalized'");
    expect(openingSql).toContain('v_previous.actual_cash');
    expect(openingSql).toContain('same_cashier_count');
    expect(openingSql).toContain('ambiguous_previous_shift');
    expect(openingSql).toContain('initial_opening_required');
    expect(openingSql).not.toContain("'opening_cash', v_previous.closing_cash");
    expect(workspace).toContain('openingCash: opening ?? 0,');
    expect(workspace).toContain('const closingCash = actualCount !== null && cashContextReady && !ledgerOverdrawn ? actualCount : null;');
  });
});
