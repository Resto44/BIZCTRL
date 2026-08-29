import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
const migration = read('src/supabase/20260827_sales_closing_erp_cash_reconciliation.sql');
const workspace = read('src/components/sales/UnifiedSalesClosing.jsx');
const reconciliationPanel = read('src/components/sales/CashReconciliationPanel.jsx');
const salesPage = read('src/pages/Sales.jsx');
const settlementLedgerFix = read('src/supabase/20260827_fix_sales_closing_owner_settlement_ledger.sql');
const walletFirstMigration = read('src/supabase/20260827_sales_closing_wallet_first_settlement.sql');
const openingCashSourceFix = read('src/supabase/20260827_fix_sales_closing_opening_cash_source.sql');

describe('Sales Closing ERP cash reconciliation migration contract', () => {
  it('uses the existing canonical cash ledger with exact Closing scope fields', () => {
    expect(migration).toContain('ALTER TABLE public.cash_movements');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS cashier_id uuid');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS shift text');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS payment_method text');
    expect(migration).toContain('erp_sales_closing_cash_context');
    expect(migration).toContain('movement.branch_id = p_branch_id');
    expect(migration).toContain('movement.shift = p_shift');
    expect(migration).toContain('movement.cashier_id = p_cashier_id');
  });

  it('derives Expected Cash from opening cash plus ERP IN minus ERP OUT and excludes owner settlement from historical expected cash', () => {
    expect(migration).toContain('erp_sales_closing_opening_cash');
    expect(migration).toContain("CASE WHEN movement.direction = 'in' THEN movement.amount ELSE -movement.amount END");
    expect(settlementLedgerFix).toContain("movement.source_document_id = p_current_closing_id::text");
    expect(settlementLedgerFix).toContain("movement.movement_type = 'owner_injection'");
    expect(migration).toContain('erp_sales_closing_expected_cash');
    expect(migration).toContain("v_new_expected text := $new_expected$");
    expect(migration).toContain("v_definition := replace(v_original, v_old_expected, v_new_expected)");
  });

  it('creates a separate owner-settlement payable and only posts cash when the explicit owner-payment RPC is called', () => {
    expect(migration).toContain('owner_settlement_required');
    expect(migration).toContain('erp_record_sales_closing_owner_payment');
    expect(settlementLedgerFix).toContain("'owner_injection'");
    expect(settlementLedgerFix).toContain("'OwnerCashInjection'");
    expect(salesPage).toContain('recordClosingOwnerPayment');
    expect(reconciliationPanel).toContain('Record Owner Payment');
    expect(reconciliationPanel).toContain('Separate settlement — no sales impact');
  });

  it('never imports legacy daily settlement cash sales into a new Closing', () => {
    expect(workspace).toContain('const automaticTotalsEnabled = false;');
    expect(workspace).not.toContain("supabase.from('daily_cash_settlements')");
    expect(workspace).not.toContain('settlementCash');
    expect(workspace).not.toContain('settlement?.cash_sales');
    expect(salesPage).toContain('dailyClosingDefaults');
  });

  it('uses only the immediately previous finalized Actual Cash under the same cashier and shift identity for Opening Cash', () => {
    expect(openingCashSourceFix).toContain('COALESCE(previous_closing.actual_cash, 0)');
    expect(openingCashSourceFix).toContain('COALESCE(previous_closing.cashier_id::text, previous_closing.cashier_employee_id) = p_cashier_id::text');
    expect(openingCashSourceFix).not.toContain('+ COALESCE((SELECT shortage.');
    expect(openingCashSourceFix).toContain("position('owner_payment_amount' IN COALESCE(v_definition, '')) > 0");
    expect(openingCashSourceFix).toContain("position('wallet_payment_amount' IN COALESCE(v_definition, '')) > 0");
    expect(openingCashSourceFix).toContain("previous_closing.closing_state = 'finalized'");
  });

  it('allocates shortage funding to Branch Wallet before owner funding in one server transaction', () => {
    expect(walletFirstMigration).toContain('erp_apply_sales_closing_wallet_settlement');
    expect(walletFirstMigration).toContain("v_wallet_applied := LEAST");
    expect(walletFirstMigration).toContain("transaction_type = 'closing_settlement'");
    expect(walletFirstMigration).toContain('owner_settlement_required = v_owner_required');
    expect(walletFirstMigration).toContain('pg_advisory_xact_lock');
    expect(walletFirstMigration).toContain('uq_wallet_transactions_closing_settlement');
    expect(salesPage).not.toContain('autoWalletTx(savedClosing, savedClosing.id, previousClosing)');
    expect(salesPage).not.toContain('autoSettle(savedClosing, savedClosing.id, proofUrl || null, ocr || null, previousClosing)');
    expect(workspace).toContain('Branch Wallet');
    expect(workspace).toContain('Branch Wallet Applied');
  });

  it('recomputes fixed and variable daily costs server-side and snapshots settlement allocation immutably', () => {
    expect(walletFirstMigration).toContain('erp_sales_closing_expense_context');
    expect(walletFirstMigration).toContain('fixed_expenses_total = v_fixed_expenses');
    expect(walletFirstMigration).toContain('variable_expenses_total = v_variable_expenses');
    expect(walletFirstMigration).toContain('sales_closing_settlement_snapshots');
    expect(walletFirstMigration).toContain('SALES_CLOSING_SETTLEMENT_SNAPSHOT_IMMUTABLE');
    expect(workspace).toContain('Fixed Expense Today');
    expect(workspace).toContain('Variable Expenses');
    expect(workspace).toContain('Funding never changes this result');
  });

  it('persists immutable ledger/reconciliation snapshots and retains normal finalized edit behavior', () => {
    expect(migration).toContain('sales_closing_cash_ledger_snapshots');
    expect(migration).toContain('SALES_CLOSING_CASH_LEDGER_SNAPSHOT_IMMUTABLE');
    expect(migration).toContain('sales_closing_finalized_versions');
    expect(settlementLedgerFix).toContain('v_old_snapshot_block');
    expect(settlementLedgerFix).toContain("position('sales_closing_cash_ledger_snapshots' IN v_save_definition) > 0");
    expect(migration).not.toContain('SALES_CLOSING_HISTORY_IMMUTABLE');
    expect(migration).not.toContain('correction request workflow');
  });

  it('does not create an invalid Balanced shortage record and retains only Shortage or Overage variances', () => {
    expect(settlementLedgerFix).toContain("COALESCE(v_difference, 0) <> 0");
    expect(settlementLedgerFix).toContain("CASE WHEN v_difference < 0 THEN 'Shortage' ELSE 'Overage' END");
    expect(settlementLedgerFix).toContain('DELETE FROM public.cash_shortages WHERE closing_id = v_saved.id');
  });

  it('uses the existing Pending-to-Resolved shortage lifecycle instead of invalid payment statuses', () => {
    const statusFix = read('src/supabase/20260827_fix_cash_shortage_settlement_status.sql');
    expect(statusFix).toContain("'''Pending'''");
    expect(statusFix).toContain("'''Resolved'''");
    expect(statusFix).toContain('ERP_CASH_SHORTAGE_STATUS_LIFECYCLE_INVALID');
    expect(workspace).toContain("activeOwnerSettlement?.status || 'PENDING'");
    expect(workspace).toContain("toLowerCase() === 'resolved'");
  });

  it('keeps the mobile Actual Cash field as the shared DOM-stable numeric control', () => {
    expect(reconciliationPanel).toContain('id="quick-closing-actualCash"');
    expect(workspace).toContain('updateActualCashCount(value)');
    expect(reconciliationPanel).toContain('ClosingNumericInput');
    expect(workspace).toContain('cashSales={reconciliation.cashSales}');
    expect(workspace).toContain('money-summary-cash-sales-${cashSales}');
    expect(workspace).toContain('cashLedgerContext.owner_settlement?.closing_id === currentClosingId');
    expect(workspace).toContain('ownerSettlementPaymentApplied');
    expect(workspace).toContain('isCurrentClosingOwnerSettlementMovement');
    expect(workspace).toContain("movement?.source_module === 'OwnerCashInjection'");
    expect(workspace).toContain('ownerSettlementResolved');
    expect(workspace).toContain('ownerSettlementStatusLabel');
    expect(workspace).toContain('ownerSettlementPaymentTarget');
    expect(workspace).toContain('Math.max(ownerSettlementRequired, reconciliation.ownerPaymentRequired)');
    expect(workspace).toContain('ownerSettlementPaymentApplied >= ownerSettlementPaymentTarget');
    expect(workspace).toContain('ownerSettlementRemaining');
    expect(workspace).toContain('reconciliation.shortage > 0 && ownerSettlementRemaining === 0');
  });

  it('keeps variance notes optional and resets count approval after any Actual Cash edit', () => {
    expect(workspace).not.toContain("nextErrors.cashNotes = 'A reconciliation note is required");
    expect(workspace).not.toContain("key: 'cashNote'");
    expect(workspace).toContain('setManagerApproved(false);');
    expect(workspace).toContain('onCashNotesChange={setCashNotes}');
    expect(reconciliationPanel).toContain('Optional reconciliation note');
  });
});
