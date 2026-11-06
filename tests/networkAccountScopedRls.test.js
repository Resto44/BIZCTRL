import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261106000326_network_accounts_scoped_feature_gate_20261106.sql',import.meta.url),'utf8');
describe('Network Management RLS branch manager and subscription gate',()=>{
  it('uses canonical branch authorization instead of a NULL owner-only branch for subscription policy',()=>{
    expect(sql).toContain('erp_can_access_scope_text(p_restaurant_id, p_branch_id)');
    expect(sql).toContain('ALTER POLICY subscription_feature_network_accounts');
    expect(sql).toMatch(/network_management', restaurant_id, branch_id::text/g);
    expect(sql).not.toMatch(/erp_can_access_scope_text\(p_restaurant_id,\s*NULL\)/);
  });
  it('keeps subscriptions and feature entitlement mandatory for both SELECT and writes',()=>{
    expect(sql).toContain('erp_subscription_has_erp_access(s.restaurant_id)');
    expect(sql).toContain('erp_subscription_can_use_feature(p_feature, s.restaurant_id)');
    expect(sql).toContain("s.restaurant_id::text = nullif(p_restaurant_id, '')");
    expect(sql).toContain('WITH CHECK');
    expect(sql).not.toMatch(/disable row level security/i);
    expect(sql).not.toMatch(/DROP POLICY\s+erp_scope_/i);
  });
  it('restricts the SECURITY DEFINER helper to authenticated sessions',()=>{
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.erp_subscription_feature_branch_row_allowed(text,text,text)');
    expect(sql).toContain('FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('TO authenticated;');
  });
});
