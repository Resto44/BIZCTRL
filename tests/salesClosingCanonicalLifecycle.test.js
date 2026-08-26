import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateSalesSources, minorToMoney } from '../src/lib/closing/ClosingCalculations';

const source = (relativePath) => readFile(resolve(process.cwd(), relativePath), 'utf8');

describe('Sales Closing editable-finalized lifecycle regression', () => {
  it('allows only one active draft session while finalized history remains available for a fresh draft', async () => {
    const migration = await source('src/supabase/20260827_sales_closing_draft_lifecycle.sql');

    expect(migration).toContain("WHERE closing_state IN ('draft', 'ready')");
    expect(migration).toContain("IF COALESCE(NEW.closing_state, 'draft') NOT IN ('draft', 'ready') THEN");
    expect(migration).toContain("WHERE existing_closing.closing_state IN ('draft', 'ready')");
  });

  it('removes the runtime lock and correction guards while preserving append-only finalized versions', async () => {
    const migration = await source('src/supabase/20260827_remove_sales_closing_lock_correction.sql');

    expect(migration).toContain('DROP TRIGGER IF EXISTS erp_guard_sales_closing_history ON public.daily_sales;');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.erp_guard_sales_closing_history();');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.erp_request_sales_closing_correction');
    expect(migration).toContain('Avoid direct updates to');
    expect(migration).not.toContain("UPDATE public.daily_sales\nSET closing_state");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.sales_closing_finalized_versions');
    expect(migration).toContain('ALTER COLUMN restaurant_id DROP NOT NULL;');
    expect(migration).toContain('CREATE TRIGGER sales_closing_finalized_versions_no_mutation');
    expect(migration).toContain("v_definition := replace(v_definition, v_old_guard, '');");
    expect(migration).toContain("v_definition := replace(v_definition, v_old_credit_posting, v_new_credit_posting);");
  });

  it('keeps finalized Closings fully editable through the same draft and finalize controls without correction routing', async () => {
    const [workspace, sales, repository, history] = await Promise.all([
      source('src/components/sales/UnifiedSalesClosing.jsx'),
      source('src/pages/Sales.jsx'),
      source('src/lib/closing/ClosingRepository.js'),
      source('src/components/sales/SalesListItem.jsx'),
    ]);

    expect(workspace).toContain('Save Draft');
    expect(workspace).toContain('Finalize Closing');
    expect(workspace).toContain("setRequestedClosingState('draft')");
    expect(workspace).toContain("setRequestedClosingState('finalized')");
    expect(workspace).not.toContain('isProtectedClosing');
    expect(workspace).not.toContain('onRequestCorrection');
    expect(sales).not.toContain('handleRequestCorrection');
    expect(sales).not.toContain('_requiresCorrection');
    expect(repository).not.toContain('requestClosingCorrection');
    expect(repository).not.toContain('SALES_CLOSING_HISTORY_IMMUTABLE:');
    expect(history).toContain('aria-label="Edit Closing"');
    expect(history).not.toContain('request correction');
  });

  it('derives reopened Closing versions from immutable history rather than a mutable current-row counter', async () => {
    const migration = await source('src/supabase/20260827_fix_sales_closing_finalized_version_sequence.sql');

    expect(migration).toContain('SELECT COALESCE(MAX(version_row.version), 0)');
    expect(migration).toContain("IF v_requested_state = 'finalized' THEN\n      v_closing_version := v_closing_version + 1;");
    expect(migration).toContain('SALES_CLOSING_VERSION_SEQUENCE_UNEXPECTED_VERSION');
  });

  it('uses only Today values from the reported screen as ERP revenue', () => {
    const result = calculateSalesSources([
      { id: 'delivery', today: '350', previous: '250' },
      { id: 'wholesale', today: '400', previous: '350' },
      { id: 'customer-credit', today: '500', previous: '0' },
    ]);

    expect(result.rows.map((row) => minorToMoney(row.totalMinor))).toEqual([600, 750, 500]);
    expect(minorToMoney(result.erpRevenueMinor)).toBe(1250);
    expect(minorToMoney(result.erpRevenueMinor)).not.toBe(1600);
  });
});


describe('Sales Closing branch-isolation regression', () => {
  it('resets the active Closing workspace and remounts it on every canonical branch change', async () => {
    const [workspace, sales] = await Promise.all([
      source('src/components/sales/UnifiedSalesClosing.jsx'),
      source('src/pages/Sales.jsx'),
    ]);

    expect(workspace).toContain('const selectClosingBranch = useCallback');
    expect(workspace).toContain('setSelectedBranchId(nextBranch.id)');
    expect(workspace).toContain("setCashSalesInput('')");
    expect(workspace).toContain("setOpeningCash('')");
    expect(workspace).toContain("setActualCashCount('')");
    expect(workspace).toContain('setCreditEntries([])');
    expect(workspace).toContain('setCustomSourceAmounts({})');
    expect(workspace).toContain("queryClient.cancelQueries({ queryKey: ['sales-closing-cash-ledger-context'] })");
    expect(workspace).not.toContain('branches.at(0)?.key');

    expect(sales).toContain("qc.cancelQueries({ queryKey: ['sales'] })");
    expect(sales).toContain('setEditing(null)');
    expect(sales).toContain('setNewClosingDefaults(null)');
    expect(sales).toContain('setSessionContext(null)');
    expect(sales).toContain('setSelectedIds(new Set())');
    expect(sales).toContain("new-closing-${newClosingInstance}-${selectedBranchId || 'none'}-${selectedBranchKey || 'none'}");
    expect(sales).toContain('const sales = isLoading ? [] : asRecordArray(salesData);');
  });

  it('queries branch-dependent customers and purchases on the backend rather than filtering restaurant-wide results', async () => {
    const workspace = await source('src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain("base().eq('branch_id', selectedBranchId)");
    expect(workspace).toContain("base().is('branch_id', null).eq('branch', form.branch)");
    expect(workspace).toContain("queryKey: ['customers_form', activeRestaurant?.id, selectedBranchId, form.branch, form.date, form.shift]");
    expect(workspace).toContain("queryKey: ['approved_purchases_for_date', activeRestaurant?.id, selectedBranchId, form.branch, form.date, form.shift]");
    expect(workspace).toContain('const customers = allCustomers;');
    expect(workspace).not.toContain('allCustomers.filter((customer) => matchesBranch');
  });

  it('rejects stale Closing IDs in both the client save guard and canonical server transaction', async () => {
    const [sales, repository, migration] = await Promise.all([
      source('src/pages/Sales.jsx'),
      source('src/lib/closing/ClosingRepository.js'),
      source('src/supabase/20260827_sales_closing_branch_isolation.sql'),
    ]);

    expect(sales).toContain("error.code = 'SALES_CLOSING_BRANCH_CONTEXT_MISMATCH'");
    expect(sales).toContain('payloadBranchId !== String(selectedBranchId)');
    expect(repository).toContain('SALES_CLOSING_BRANCH_CONTEXT_MISMATCH');
    expect(migration).toContain('erp_sales_closing_assert_existing_branch_context');
    expect(migration).toContain("RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_MISMATCH'");
    expect(migration).toContain("PERFORM public.erp_sales_closing_assert_existing_branch_context(p_closing_id, v_restaurant_id, v_branch_id, v_branch);");
  });
});
