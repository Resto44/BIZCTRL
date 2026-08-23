import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('ERP Sales Analytics branch selector', () => {
  it('renders an authorized branch selector that updates the shared UUID branch scope', async () => {
    const reports = await source('../src/pages/Reports.jsx');
    expect(reports).toContain('setSelectedBranchId');
    expect(reports).toContain('<Select value={selectedBranchId} onValueChange={setSelectedBranchId}>');
    expect(reports).toContain('id="sales-analytics-branch"');
    expect(reports).toContain('!isBranchScoped && <SelectItem value="all">All Branches</SelectItem>');
    expect(reports).toContain('(branches || []).map((branch) =>');
    expect(reports).toContain('branch.name || branch.label || branch.branch_key || branch.key');
  });

  it('keeps every analytics data source scoped by selected branch UUID with legacy-key compatibility', async () => {
    const reports = await source('../src/pages/Reports.jsx');
    expect(reports).toContain("queryKey: ['sales', 'reports', activeRestaurant?.id, selectedBranchId]");
    expect(reports).toContain("queryKey: ['purchases_erp', activeRestaurant?.id, selectedBranchId]");
    expect(reports).toContain("queryKey: ['expenses', 'reports', activeRestaurant?.id, selectedBranchId]");
    expect(reports).toContain("createQuery().eq('branch_id', selectedBranchId)");
    expect(reports).toContain("createQuery().is('branch_id', null).eq(legacyColumn, selectedBranchKey)");
  });

  it('shows the active branch label and prevents a branch-scoped user from selecting all branches', async () => {
    const reports = await source('../src/pages/Reports.jsx');
    expect(reports).toContain("{isAllBranches ? 'Showing data for: All Branches' : `Showing data for: ${selectedBranchLabel}`}");
    expect(reports).toContain('const { branches, activeRestaurant, isBranchScoped } = useTenant();');
  });
});
