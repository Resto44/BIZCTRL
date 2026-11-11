import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationFile=new URL('../supabase/migrations/20261111163000_fix_closing_push_branch_42702.sql',import.meta.url);
const originalFile=new URL('../supabase/migrations/20261111114500_erp_all_portal_web_push.sql',import.meta.url);

describe('Sales Closing SQLSTATE 42702 - portal push trigger regression',()=>{
 it('keeps a fully qualified, unique PL/pgSQL branch variable so customer credit finalization does not raise 42702',async()=>{
  const [sql,old]=await Promise.all([readFile(migrationFile,'utf8'),readFile(originalFile,'utf8')]);
  expect(old).toMatch(/DECLARE rowdata jsonb; tenant uuid; branch uuid;/);
  expect(sql).toMatch(/DECLARE rowdata jsonb; tenant uuid; v_branch_id uuid;/);
  expect(sql).toContain('SELECT b.id INTO v_branch_id FROM public.branches b');
  expect(sql).toContain('c.branch_id=v_branch_id');
  expect(sql).toContain('v_branch_id=ANY(coalesce(m.selected_branch_ids');
  expect(sql).not.toMatch(/\bbranch\s+uuid\s*;/);
  expect(sql).not.toMatch(/\bc\.branch_id\s*=\s*branch\b/);
  expect(sql).not.toMatch(/\bbranch\s*=\s*ANY\s*\(/);
  expect(sql).not.toMatch(/\bINTO\s+branch\b/);
  expect(sql).toContain("SET search_path TO ''");
 });
 it('preserves all existing authorized push event categories without deleting triggers',async()=>{
  const sql=await readFile(migrationFile,'utf8');
  for(const category of ['notifications','orders','supplier_invoices',
      'attendance_shift_sessions','driver_requests','debt_records','debt_payments']){
   expect(sql).toContain("TG_TABLE_NAME='"+category+"'");
  }
  expect(sql).toContain('push_private.portal_enqueue');
  expect(sql).toContain('a.active AND a.user_id IS NOT NULL AND c.is_active');
  expect(sql).toContain('c.restaurant_id=tenant');
  expect(sql).toContain("SECURITY DEFINER");
  expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDROP\s+TRIGGER\b/i);
  expect(sql).not.toMatch(/\bUPDATE\s+public\.(?:daily_sales|customers|debt_records|cash_movements)\b/i);
 });
 it('does not bypass canonical closing validation or change finance RPC code',async()=>{
  const sql=await readFile(migrationFile,'utf8');
  const repo=await readFile(new URL('../src/lib/closing/ClosingRepository.js',import.meta.url),'utf8');
  expect(sql).not.toContain('erp_save_sales_closing_core');
  expect(sql).not.toContain('erp_finalize_sales_closing(');
  expect(repo).toContain("erp_finalize_sales_closing");
  expect(repo).toContain("p_request_id: requestId");
  expect(repo).toContain('normalizeClosingPayload');
 });
});
