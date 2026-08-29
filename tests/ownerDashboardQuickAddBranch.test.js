import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

describe('Owner Dashboard quick Add Branch runtime', () => {
  it('keeps Add Branch inside the Owner Control Tower action grid and limits it to owners', async () => {
    const dashboard = await source('../src/pages/OwnerDashboard.jsx');
    expect(dashboard).toContain('data-testid="owner-mega-actions"');
    expect(dashboard).toContain("role === 'owner' ? { label: copy.addBranch");
    expect(dashboard).toContain('onClick: () => setQuickAddBranchOpen(true)');
    expect(dashboard).not.toContain('<QuickActionsDock');
    expect(dashboard).toContain('<QuickAddBranchDialog open={isQuickAddBranchOpen} onOpenChange={setQuickAddBranchOpen} />');
  });

  it('uses a mobile-safe form with all requested quick-create fields and accessible actions', async () => {
    const dialog = await source('../src/components/dashboard/QuickAddBranchDialog.jsx');
    for (const field of ['Branch Name *', 'Branch Code', 'Address', 'City', 'Phone', 'Manager', 'Status']) {
      expect(dialog).toContain(field);
    }
    expect(dialog).toContain('Cancel');
    expect(dialog).toContain('Create Branch');
    expect(dialog).toContain('max-h-[calc(100dvh-1rem)]');
    expect(dialog).toContain('overflow-y-auto');
    expect(dialog).toContain('sticky bottom-0');
  });

  it('refreshes branch and subscription state locally after creation without reloading the application', async () => {
    const dialog = await source('../src/components/dashboard/QuickAddBranchDialog.jsx');
    expect(dialog).toContain("queryClient.invalidateQueries({ queryKey: ['branches', activeRestaurant.id] })");
    expect(dialog).toContain('refetchRestaurants()');
    expect(dialog).toContain('refreshSubscription()');
    expect(dialog).not.toContain('window.location.reload');
  });

  it('enforces owner authorization, duplicate protection, plan limits, tenant scope, and audit logging in the database RPC', async () => {
    const migration = await source('../src/supabase/20260823_owner_dashboard_quick_branch.sql');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_quick_create_branch');
    expect(migration).toContain('public.erp_is_approved_owner(p_restaurant_id)');
    expect(migration).toContain('SUBSCRIPTION_LIMIT_REACHED');
    expect(migration).toContain('BRANCH_NAME_ALREADY_EXISTS');
    expect(migration).toContain('BRANCH_CODE_ALREADY_EXISTS');
    expect(migration).toContain('INSERT INTO public.audit_logs');
    expect(migration).toContain("'branch_created'");
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.erp_quick_create_branch');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.erp_quick_create_branch');
    expect(migration).toContain('v_limit >= 0');
  });

  it('preserves optional quick-create data in the canonical tenant branch source', async () => {
    const tenantContext = await source('../src/lib/TenantContext.jsx');
    expect(tenantContext).toContain("city, phone, manager_name");
    expect(tenantContext).toContain('city: branch.city || legacy.city ||');
    expect(tenantContext).toContain('manager_name: branch.manager_name || legacy.manager_name ||');
  });
});
