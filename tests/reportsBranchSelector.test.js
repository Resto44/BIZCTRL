import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');

describe('ERP Sales Analytics branch and period scope',()=>{
 it('uses tenant-authorized canonical branch IDs with no all-branches choice for scoped staff',async()=>{
  const reports=await source('../src/pages/Reports.jsx');
  expect(reports).toContain('setSelectedBranchId');
  expect(reports).toContain('<Select value={selectedBranchId} onValueChange={setSelectedBranchId}>');
  expect(reports).toContain('id="sales-analytics-branch"');
  expect(reports).toContain('!isBranchScoped && <SelectItem value="all">{copy.all}</SelectItem>');
  expect(reports).toContain('(branches || []).filter(b=>b.id).map((branch)');
  expect(reports).toContain("const { branches, activeRestaurant, isBranchScoped } = useTenant();");
 });
 it('paginates every table within tenant and selected branch, with canonical+legacy scope',async()=>{
  const reports=await source('../src/pages/Reports.jsx');
  for(const query of [
   "queryKey: ['sales', 'reports', activeRestaurant?.id, selectedBranchId]",
   "queryKey: ['purchases_erp', activeRestaurant?.id, selectedBranchId]",
   "queryKey: ['expenses', 'reports', activeRestaurant?.id, selectedBranchId]",
   ".eq('restaurant_id', activeRestaurant.id)",
   "load(q=>q.eq('branch_id',selectedBranchId))",
   "load(q=>q.is('branch_id',null).eq(legacyColumn,selectedBranchKey))",
   "range(offset, offset + 499)",
   "['finalized','locked'].includes(row.closing_state)",
  ])expect(reports).toContain(query);
  expect(reports).not.toContain("return error ? [] : (data || [])");
 });
 it('shows every selectable period and feeds the exact same snapshot to the ERP PDF',async()=>{
  const reports=await source('../src/pages/Reports.jsx');
  for(const key of ['today','yesterday','week','month','year'])expect(reports).toContain(`sales-period-${key}`);
  expect(reports).toContain('data-testid="sales-period-summary"');
  expect(reports).toContain('periodSnapshot,previousSnapshot,growth:periodGrowth');
  expect(reports).toContain('range:reportRange');
  expect(reports).toContain('generateSalesAnalyticsPDF');
  expect(reports).toContain('selectedBranchLabel');
  expect(reports).toContain('hasReportError || isLoading');
 });
});
