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
