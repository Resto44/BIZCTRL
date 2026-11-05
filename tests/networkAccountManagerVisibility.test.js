import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
describe('Network account manager visibility contract', () => {
 it('writes canonical UUID for full account creates and edits, not a legacy nullable branch', () => {
   const component = read('../src/pages/NetworkManagement.jsx');
   expect(component).toContain('networkAccountSavePayload(data, branches)');
   expect(component).toContain('resolveCanonicalNetworkBranch');
   expect(component).toContain('no verified canonical branch');
   expect(component).not.toContain('branch_id: isUuid ? data.branch_id : null');
 });
 it('keeps network account closing options branch and tenant constrained', () => {
   const closing = read('../src/components/sales/UnifiedSalesClosing.jsx');
   const filter = read('../src/lib/closing/ClosingFunding.js');
   expect(closing).toContain('activeClosingNetworkAccounts(all, activeRestaurant.id, selectedBranchId, form.branch, networkBranchAliases)');
   expect(filter).toContain('String(a.branch_id) === String(branchId)');
   expect(filter).toContain('a.restaurant_id');
 });
 it('loads branch manager settlement accounts only for the canonical assigned branch', () => {
   const source = read('../src/components/network/NetworkAccountSelect.jsx');
   expect(source).toContain('resolveCanonicalNetworkBranch(branches, branch)');
   expect(source).toContain(".eq('branch_id', selected.id)");
   expect(source).toContain(".eq('restaurant_id', activeRestaurant.id)");
   expect(source).toContain('if (error) throw error;');
 });
 it('does not broaden RLS or guess aliases when backfilling', () => {
   const sql = read('../supabase/migrations/20261106024500_network_accounts_canonical_branch_backfill.sql');
   expect(sql).toContain('b.restaurant_id::text = a.restaurant_id');
   expect(sql).toContain('having count(distinct canonical_branch_id) = 1');
   expect(sql).toContain('a.branch_id is null');
   expect(sql).not.toMatch(/disable row level security/i);
 });
});
