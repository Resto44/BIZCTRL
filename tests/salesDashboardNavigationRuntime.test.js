import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  normalizeSalesDashboardBranches,
  saleMatchesBranch,
  salesDashboardBranchLabel,
} from '../src/lib/salesDashboardBranches.js';

const salesDashboardPath = new URL('../src/pages/SalesDashboard.jsx', import.meta.url);
const sidebarPath = new URL('../src/components/layout/ERPSidebar.jsx', import.meta.url);

describe('Sales Analytics sidebar navigation runtime', () => {
  const branches = normalizeSalesDashboardBranches([
    { id: 'branch-1', branch_key: 'north', name: 'North Branch', is_active: true },
    { id: 'branch-2', key: 'south', label: 'South Branch', is_active: true },
  ]);

  it('keeps sidebar navigation on the registered Sales Dashboard route', async () => {
    const sidebar = await readFile(sidebarPath, 'utf8');
    expect(sidebar).toContain("{ path: '/sales-dashboard',      label: 'Sales Analytics'");
  });

  it('normalizes authorized tenant branches for the selector rather than reading branch data from LanguageContext', async () => {
    const dashboard = await readFile(salesDashboardPath, 'utf8');
    expect(branches).toEqual([
      expect.objectContaining({ id: 'branch-1', key: 'north', label: 'North Branch' }),
      expect.objectContaining({ id: 'branch-2', key: 'south', label: 'South Branch' }),
    ]);
    expect(dashboard).toContain("import { useTenant } from '@/lib/TenantContext'");
    expect(dashboard).toContain('const { branches: tenantBranches, activeRestaurant } = useTenant();');
    expect(dashboard).toContain('normalizeSalesDashboardBranches(tenantBranches)');
  });

  it('matches both canonical branch UUID records and legacy branch-key records when filtering sales', () => {
    expect(saleMatchesBranch({ branch_id: 'branch-1', branch: null }, branches[0])).toBe(true);
    expect(saleMatchesBranch({ branch_id: null, branch: 'south' }, branches[1])).toBe(true);
    expect(saleMatchesBranch({ branch_id: 'branch-1', branch: 'north' }, branches[1])).toBe(false);
  });

  it('shows a human-readable branch label in the analytics comparison when sales use either storage format', () => {
    expect(salesDashboardBranchLabel({ branch_id: 'branch-1', branch: null }, branches)).toBe('North Branch');
    expect(salesDashboardBranchLabel({ branch_id: null, branch: 'south' }, branches)).toBe('South Branch');
  });

  it('scopes Sales Dashboard reads to the active restaurant and uses the selected branch matcher', async () => {
    const dashboard = await readFile(salesDashboardPath, 'utf8');
    expect(dashboard).toContain("queryKey: ['sales-dashboard', activeRestaurant?.id]");
    expect(dashboard).toContain('{ restaurant_id: activeRestaurant.id }');
    expect(dashboard).toContain('const matchesSelectedBranch = (sale) => branchFilter === \'all\' || saleMatchesBranch(sale, selectedBranch);');
    expect(dashboard).toContain('value={branch.key || branch.id}');
  });
});
