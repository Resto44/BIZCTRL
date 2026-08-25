import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateSalesSources, minorToMoney } from '../src/lib/closing/ClosingCalculations';

const source = (relativePath) => readFile(resolve(process.cwd(), relativePath), 'utf8');

describe('Sales Closing canonical lifecycle regression', () => {
  it('allows only one active draft session while finalized history remains available for a fresh draft', async () => {
    const migration = await source('src/supabase/20260827_sales_closing_draft_lifecycle.sql');

    expect(migration).toContain("WHERE closing_state IN ('draft', 'ready')");
    expect(migration).toContain("IF COALESCE(NEW.closing_state, 'draft') NOT IN ('draft', 'ready') THEN");
    expect(migration).toContain("WHERE existing_closing.closing_state IN ('draft', 'ready')");
    expect(migration).toContain('v_has_existing := false;');
  });

  it('returns a correction-required lifecycle result for a protected closing ID instead of throwing the legacy immutable error', async () => {
    const migration = await source('src/supabase/20260827_sales_closing_draft_lifecycle.sql');
    const repository = await source('src/lib/closing/ClosingRepository.js');
    const workspace = await source('src/components/sales/UnifiedSalesClosing.jsx');

    expect(migration).toContain("'requires_correction', true");
    expect(migration).toContain("'lifecycle_action', 'correction_required'");
    expect(repository).toContain('_requiresCorrection: Boolean(data.requires_correction)');
    expect(workspace).not.toContain('Save failed: ${err?.message');
    expect(workspace).toContain('Request Correction');
  });

  it('routes Closing History lifecycle states into explicit review and correction UI', async () => {
    const [history, mapper, sales] = await Promise.all([
      source('src/components/sales/SalesListItem.jsx'),
      source('src/lib/dailySalesPresentation.js'),
      source('src/pages/Sales.jsx'),
    ]);

    expect(mapper).toContain("closing_state: sale.closing_state || 'finalized'");
    expect(history).toContain("correction_requested: 'Correction Requested'");
    expect(history).toContain("'View Closing and request correction'");
    expect(sales).toContain('const handleRequestCorrection = async () => {');
    expect(sales).toContain('requestClosingCorrection({ closingId: editing.id, reason: reason.trim() })');
  });

  it('uses only Today values from the reported screen as ERP revenue', () => {
    const result = calculateSalesSources([
      { id: 'delivery', today: '350', previous: '250' },
      { id: 'wholesale', today: '400', previous: '350' },
    ]);

    expect(result.rows.map((row) => minorToMoney(row.totalMinor))).toEqual([600, 750]);
    expect(minorToMoney(result.erpRevenueMinor)).toBe(750);
    expect(minorToMoney(result.erpRevenueMinor)).not.toBe(1350);
  });
});
