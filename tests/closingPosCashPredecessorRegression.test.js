import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20261031011000_closing_exclude_pos_from_cash_predecessor.sql',import.meta.url),'utf8');
const pred=migration.split('-- Also remove POS from legacy fallback')[0];
const context=migration.split('-- Also remove POS from legacy fallback')[1];
describe('Closing cash chain must exclude finalized POS sales',()=>{
 it('only considers physical Morning/Evening drawer closings in ERP predecessor lookup',()=>{
  expect(pred).toContain('CREATE OR REPLACE FUNCTION public.erp_closing_predecessor(');
  expect(pred).toContain("p.closing_state='finalized'");
  expect(pred).toContain("lower(btrim(COALESCE(p.shift,''))) IN ('morning','evening')");
  expect(pred).toContain("p.cashier_id=c OR p.cashier_id IS NULL");
  expect(pred).toContain('current_row.previous_closing_id');
 });
 it('also excludes POS from legacy opening fallback for all candidate queries',()=>{
  expect(context).toContain('CREATE OR REPLACE FUNCTION public.erp_sales_closing_opening_context(');
  expect((context.match(/AND lower\(btrim\(COALESCE\(p\.shift,''\)\)\) IN \('morning','evening'\)/g)||[]).length).toBe(4);
  expect(context).toContain("AND lower(btrim(COALESCE(previous.shift,''))) IN ('morning','evening')");
  expect(context).toContain("v_verification.id IS NOT NULL");
  expect(context).toContain('v_session_previous.actual_cash');
 });
 it('keeps the missing verified closing cash fail-closed and never rewrites historical sales',()=>{
  expect(context).toContain("v_session_previous.actual_cash IS NOT NULL");
  expect(context).toContain("opening_verified', false");
  expect(migration).not.toMatch(/\bUPDATE\s+public\.daily_sales\b|\bDELETE\s+FROM\s+public\.daily_sales\b/i);
  expect(migration).toContain('public.erp_can_access_scope_text');
 });
});
