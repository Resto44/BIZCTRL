import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('central branch UUID scope contract', () => {
  it('persists an authenticated user-and-tenant scoped canonical branch selection and rejects invalid IDs', async () => {
    const [context, tenant] = await Promise.all([
      source('../src/lib/BranchScopeContext.jsx'),
      source('../src/lib/TenantContext.jsx'),
    ]);

    expect(context).toContain("export const ALL_BRANCHES = 'all'");
    expect(context).toContain('bizctrl.selected-branch.${userId || \'anonymous\'}.${restaurantId || \'none\'}');
    expect(context).toContain('localStorage.getItem(key)');
    expect(context).toContain('const restoredScopeRef = useRef(null);');
    expect(context).toContain('if (restoredScopeRef.current === restorationKey) return;');
    expect(context).toContain('const persistedId = normalizeBranchId(localStorage.getItem(key));');
    expect(context).toContain('availableBranches.some((branch) => String(branch.id) === persistedId)');
    expect(context).toContain('const selectedBranch = availableBranches.find((branch) => String(branch.id) === selectedBranchId) || null;');
    expect(context).toContain('localStorage.setItem(storageKey(user?.id, restaurantId), safeId)');
    expect(context).toContain('availableBranches.some((branch) => String(branch.id) === nextId)');
    expect(context).toContain('managerBranchId && nextId !== managerBranchId');
    expect(context).toContain('isBranchScoped && managerBranchObject?.id');
    expect(tenant).toContain('const isBranchScoped = isManager || isEmployee;');
    expect(tenant).toContain('if (isBranchScoped && assignedBranch)');
    expect(context).toContain("{ ...tenantFilter, branch_id: selectedBranchId }");
    expect(context).not.toContain('branch_name');
  });

  it('mounts the scope under authenticated tenant context and removes dashboard-local branch state', async () => {
    const [app, dashboard] = await Promise.all([
      source('../src/App.jsx'),
      source('../src/pages/OwnerDashboard.jsx'),
    ]);

    expect(app).toContain('<BranchScopeProvider>');
    expect(app).toContain('<TenantProvider>');
    expect(dashboard).toContain('const selectedBranch = selectedBranchId;');
    expect(dashboard).not.toContain("const [selectedBranch, setSelectedBranch] = useState('all')");
    expect(dashboard).toContain('onSelect={setSelectedBranchId}');
    expect(dashboard).toContain("const selectedLabel = selectedBranch === 'all'");
    expect(dashboard).toContain('key={`branch-selector-${selectedBranchId}`}');
    expect(dashboard).toContain('key={`branch-dashboard-${selectedBranchId}`}');
    expect(dashboard).toContain("queryKey: ['sales_today', activeRestaurant?.id, selectedBranchId, today]");
    expect(dashboard).toContain("createQuery().eq('branch_id', selectedBranchId)");
    expect(dashboard).toContain("createQuery().is('branch_id', null).eq(legacyColumn, selectedBranchKey)");
  });

  it('keeps report analytics and linked operational routes on the same UUID scope', async () => {
    const [reports, sales, purchases, expenses, inventory, treasury] = await Promise.all([
      source('../src/pages/Reports.jsx'),
      source('../src/pages/Sales.jsx'),
      source('../src/pages/Purchases.jsx'),
      source('../src/pages/Expenses.jsx'),
      source('../src/pages/Inventory.jsx'),
      source('../src/pages/Treasury.jsx'),
    ]);

    expect(reports).toContain('useBranchScope');
    expect(reports).toContain("queryKey: ['sales', 'reports', activeRestaurant?.id, selectedBranchId]");
    expect(reports).toContain("isAllBranches ? 'all' : selectedBranchKey");
    expect(reports).toContain('const scopedBranches = useMemo(');
    expect(reports).toContain("String(branch.id) === String(selectedBranchId)");
    expect(reports).toContain('branches: scopedBranches || []');
    expect(reports).toContain('Showing data for: ${selectedBranchLabel}');
    expect(reports).not.toContain("computeProductQuantityAnalytics(purchases, 'all'");

    for (const page of [sales, purchases, expenses, inventory, treasury]) {
      expect(page).toContain('useBranchScope');
      expect(page).toContain('selectedBranchId');
      expect(page).toContain("eq('branch_id', selectedBranchId)");
      expect(page).toContain("is('branch_id', null)");
    }
  });

  it('uses canonical branch UUIDs and server-scoped Sales Source reads without browser filtering', async () => {
    const hook = await source('../src/hooks/useSalesSources.js');
    const context = await source('../src/lib/SalesClosingCustomizationContext.jsx');
    const migration = await source('../src/supabase/20260827_sales_closing_branch_isolation.sql');

    expect(hook).toContain('useSalesSources({ branchId, branchKey, includeInactive = false } = {})');
    expect(hook).toContain('useBranchScope()');
    expect(hook).toContain('requestedScopeMatchesActive');
    expect(hook).not.toContain('.filter((source) => branchMatchesSource(');
    expect(context).toContain("['sales_sources_active', restaurantId, selectedBranchId, selectedBranchKey, isAllBranches]");
    expect(context).toContain("supabase.rpc('erp_sales_closing_branch_sources'");
    expect(context).toContain("p_branch_id: selectedBranchId");
    expect(context).toContain(".eq('is_global', true)");
    expect(context).not.toContain(".or('is_global.eq.true,and(branch_id.is.null,branch_ids.is.null)')");
    expect(context).not.toContain("const sourceQueryKey = useMemo(() => ['sales_sources_active', restaurantId]");
    expect(migration).toContain('erp_can_access_scope_text(p_restaurant_id::text, p_branch_id::text)');
    expect(migration).toContain('source.branch_id = p_branch_id::text');
    expect(migration).toContain('p_branch_id = ANY(COALESCE(source.branch_ids');
  });

  it('sends a canonical branch UUID to Copilot and verifies it against the resolved tenant before tools run', async () => {
    const [panel, edge] = await Promise.all([
      source('../src/components/dashboard/OwnerCopilotPanel.jsx'),
      source('../supabase/functions/owner-copilot/index.ts'),
    ]);

    expect(panel).toContain('selectedBranchId');
    expect(panel).toContain('selectedBranchId,');
    expect(edge).toContain('body.selectedBranchId');
    expect(edge).toContain('.eq("restaurant_id", identity.restaurant_id)');
    expect(edge).toContain('.eq("id", requestedBranchId)');
    expect(edge).toContain('branchId = branch.id;');
    expect(edge).toContain('branch_id.eq.${scope.branchId}');
    expect(edge).toContain('and(branch_id.is.null,${legacyColumn}.eq.${scope.branchKey})');
    expect(edge).toContain('BRANCH_SCOPE_DENIED');
  });
});
