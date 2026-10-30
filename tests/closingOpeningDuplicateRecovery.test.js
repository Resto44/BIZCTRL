import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read = relative => readFileSync(new URL(relative,import.meta.url),'utf8');
describe('ERP cash opening recovery and mobile closing safety',()=>{
 const sql=read('../supabase/migrations/20261030213000_closing_opening_idempotent_recovery.sql');
 const form=read('../src/components/sales/UnifiedSalesClosing.jsx');
 const cash=read('../src/components/sales/SimpleClosingCash.jsx');
 it('checks immutable shift-scoped count before any new insert, preserving locks and authorization',()=>{
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain('public.erp_can_write_scope');
  expect(sql).toContain('AND lower(v.shift)=lower(p_shift) AND v.cashier_id=p_cashier_id');
  expect(sql.indexOf('already_exists')).toBeLessThan(sql.lastIndexOf('INSERT INTO public.sales_closing_opening_verifications'));
  expect(sql).toContain("'amount_matches',v_existing.counted_cash=p_counted_cash");
  expect(sql).not.toMatch(/UPDATE public\.sales_closing_opening_verifications|DELETE FROM public\.sales_closing_opening_verifications/i);
 });
 it('prefers a verified opening before an older shift, but never reuses it for the next closing in the same shift',()=>{
  expect(sql).toContain('v_session_previous.date <> p_date');
  expect(sql).toContain('lower(v_session_previous.shift) <> lower(p_shift)');
  expect(sql).toContain("IF v_session_previous.id IS NOT NULL THEN");
 });
 it('refreshes cash ledger and provides a readable message rather than database-key diagnostics',()=>{
  expect(form).toContain('openingResult?.already_exists');
  expect(form).toContain('openingResult?.amount_matches');
  expect(form).toContain('await refetchCashLedger()');
  expect(form).toContain('previousCashCountMissing');
  expect(form).not.toContain("setOpeningVerificationError(error?.message");
 });
 it('does not confuse previous closing with new shift opening',()=>{
  expect(cash).toContain('openingBlockedByPrevious ?');
  expect(cash).toContain('Do not repeat this for each closing');
  expect(cash).toContain('نقد موجود در صندوق');
 });
});
