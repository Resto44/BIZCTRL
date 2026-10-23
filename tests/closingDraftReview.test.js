import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
const source = readFileSync('src/components/sales/UnifiedSalesClosing.jsx','utf8');
const migration = readFileSync('supabase/migrations/20261023130318_closing_draft_cash_review.sql','utf8');
describe('unreconciled closing draft boundary', () => {
  it('allows draft capture without allowing negative-cash finalization', () => {
    expect(source).toContain('if (!savingDraft && ledgerOverdrawn) nextErrors.reconciliation');
    const buttons = [...source.matchAll(/<Button type="submit" data-closing-intent="draft"[^>]+>/g)].map(m=>m[0]);
    expect(buttons).toHaveLength(1);
    for (const button of buttons) expect(button).not.toContain('ledgerOverdrawn');
    expect(source).toContain('disabled={isSubmitting || !allValid || !cashContextReady || cashDifference === null || ledgerOverdrawn}');
  });
  it('only defers the specific overdrawn error for drafts, leaving permissions and finalization intact', () => {
    expect(migration).toContain("v_requested_state <> 'draft' OR SQLERRM <> 'SALES_CLOSING_CASH_LEDGER_OVERDRAWN'");
    expect(migration).toContain('v_expected_cash := NULL;');
    expect(migration).toContain('IF v_actual IS NOT NULL AND v_expected_cash IS NOT NULL THEN');
    expect(migration).toContain('DELETE FROM public.sales_closing_cash_reconciliations WHERE closing_id = v_saved.id;');
    expect(migration).not.toContain('DROP CONSTRAINT');
    expect(migration).not.toContain('DISABLE TRIGGER');
  });
  it('protects previously posted records from draft downgrade and explains the unresolved cash source', () => {
    expect(migration).toContain('SALES_CLOSING_FINALIZED_DRAFT_DENIED');
    expect(migration).toContain('COALESCE(v_closing_version, 0) > 0');
    expect(source).not.toContain('Unexplained difference from cash count');
    expect(source).toContain('data-testid="closing-cash-action"');
    expect(source).toContain('cashFundingRequired={reconciliation.cashFundingRequired}');
    const panel = readFileSync('src/components/sales/CashReconciliationPanel.jsx','utf8');
    expect(panel).toContain('Recorded cash balance gap · not count variance');
    expect(source).toContain('Draft saved. Final reconciliation is still pending.');
  });
});
