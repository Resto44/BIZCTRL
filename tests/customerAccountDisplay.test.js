import { describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { customerAccountDisplayLabel } from '../src/lib/customerAccountDisplay.js';

describe('Customer portal account selector uses restaurant and branch name', () => {
 it('shows the real branch name without customer name, branch keys, or UUID fragments', () => {
  const account = {
   id:'c31d-id', name:'ابو بسقاب', business:'مطاعم شمعة الريان',
   branch:'main-9a50614652', branch_name:'فرع الريان'
  };
  const label = customerAccountDisplayLabel(account);
  expect(label).toBe('مطاعم شمعة الريان · فرع الريان');
  expect(label).not.toContain('ابو بسقاب');
  expect(label).not.toContain('main-');
  expect(label).not.toContain('9a506');
  expect(label).not.toContain('c31d');
 });
 it('does not reveal an internal key when a branch has no registered human-readable name', () => {
  const account = { business:'Example Restaurant',name:'Customer A',branch:'main-abc123',branch_name:null };
  expect(customerAccountDisplayLabel(account)).toBe('Example Restaurant');
  expect(customerAccountDisplayLabel({branch:'main-abc123',name:'Customer B'})).toBe('—');
 });
 it('uses the same label for every option and for the native mobile title', async () => {
  const page = await readFile(new URL('../src/pages/CustomerPortal.jsx',import.meta.url),'utf8');
  expect(page).toContain('title={customerAccountDisplayLabel(account)}');
  expect(page).toContain('{customerAccountDisplayLabel(a)}</option>');
  expect(page).not.toContain('{a.business} · {a.name} · {a.branch}');
  expect(page).not.toContain('title={`${account.business} · ${account.name}');
  expect(page).toContain('value={account.id}');
  expect(page).toContain('value={a.id}');
 });
 it('only resolves branch names inside the authorized same-tenant customer account RPC',async()=>{
  const sql = await readFile(new URL('../supabase/migrations/20261111103000_customer_portal_account_branch_labels.sql',import.meta.url),'utf8');
  expect(sql).toContain('customer_portal_private.accounts()');
  expect(sql).toContain('a.user_id=auth.uid() AND a.active AND c.is_active');
  expect(sql).toContain('ON b.id=c.branch_id AND b.restaurant_id=c.restaurant_id');
  expect(sql).toContain("'branch_name',NULLIF(btrim(b.name),'')");
  expect(sql).not.toContain("'branch',c.branch");
  expect(sql).not.toMatch(/(?:DELETE\s+FROM|DROP\s+TABLE|UPDATE\s+public\.customers|ALTER\s+TABLE)/i);
 });
});
