import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('natural-key closing credit regression', () => {
  it('validates the resolved finalized closing before returning, even without a supplied closing id', () => {
    const sql = readFileSync('supabase/migrations/20261024210520_closing_credit_consistency_guard.sql', 'utf8');
    const guard = sql.split('guard text := $guard$')[1].split('$guard$;')[0];
    expect(guard).toContain('sales_closing_id = v_closing.id');
    expect(guard).not.toContain('IF p_closing_id');
    expect(guard).toContain('v_existing_count <> v_sanitized_count');
    expect(guard).toContain('v_existing_total <> v_credit_total');
    expect(guard).toContain("debt.customer_id = (candidate ->> 'customer_id')::uuid");
    expect(guard).toContain("RAISE EXCEPTION 'SALES_CLOSING_CREDIT_FINALIZED_IMMUTABLE'");
    expect(sql).toContain("guard || E'\\n' || needle");
  });
  it('uses stable shift values for cash funding regardless of display language', () => {
    const source = readFileSync('src/components/sales/UnifiedSalesClosing.jsx', 'utf8');
    expect(source).toContain('shift={form.shift} cashierId={effectiveCashierId}');
    expect(source).not.toContain('shift={closingTr(form.shift)}');
  });
});
