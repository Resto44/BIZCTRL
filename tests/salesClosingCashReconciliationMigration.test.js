import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
const migration = read('src/supabase/20260827_sales_closing_erp_cash_reconciliation.sql');
const workspace = read('src/components/sales/UnifiedSalesClosing.jsx');
const salesPage = read('src/pages/Sales.jsx');
const settlementLedgerFix = read('src/supabase/20260827_fix_sales_closing_owner_settlement_ledger.sql');

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
    expect(workspace).toContain('Record Owner Payment');
    expect(workspace).toContain('never sales revenue');
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
    expect(workspace).toContain('id="quick-closing-actualCash"');
    expect(workspace).toContain('updateActualCashCount(value)');
    expect(workspace).toContain('ClosingNumericInput');
    expect(workspace).toContain('money-ledger-cash-sales-${cashSales}');
    expect(workspace).toContain('money-summary-cash-sales-${cashSales}');
    expect(workspace).toContain('cashLedgerContext.owner_settlement?.closing_id === currentClosingId');
    expect(workspace).toContain('ownerSettlementPaymentApplied');
    expect(workspace).toContain('isCurrentClosingOwnerSettlementMovement');
    expect(workspace).toContain("movement?.source_module === 'OwnerCashInjection'");
    expect(workspace).toContain('ownerSettlementResolved');
    expect(workspace).toContain('ownerSettlementStatusLabel');
    expect(workspace).toContain('ownerSettlementPaymentTarget');
    expect(workspace).toContain('Math.max(ownerSettlementRequired, reconciliation.shortage)');
    expect(workspace).toContain('ownerSettlementPaymentApplied >= ownerSettlementPaymentTarget');
    expect(workspace).toContain('ownerSettlementRemaining');
    expect(workspace).toContain('reconciliation.shortage > 0 && ownerSettlementRemaining === 0');
  });
});
