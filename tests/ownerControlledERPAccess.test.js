import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('owner-controlled ERP access contract', () => {
  const migration = read('supabase/migrations/20260830133000_owner_controlled_erp_access_core.sql');
  const roleContext = read('src/lib/RoleContext.jsx');
  const authClient = read('src/api/supabaseClient.js');
  const login = read('src/pages/ERPLogin.jsx');
  const managerPortal = read('src/pages/ManagerDashboardERP.jsx');
  const employeePortal = read('src/pages/EmployeeDashboardERP.jsx');

  it('defines exactly four canonical membership roles', () => {
    expect(migration).toContain("array['owner'::text, 'manager'::text, 'employee'::text, 'supplier'::text]");
    expect(roleContext).toContain("OWNER:           'owner'");
    expect(roleContext).toContain("MANAGER:         'manager'");
    expect(roleContext).toContain("EMPLOYEE:        'employee'");
    expect(roleContext).toContain("SUPPLIER:        'supplier'");
  });

  it('authorizes the browser from one canonical session RPC', () => {
    expect(authClient).toContain("supabase.rpc('erp_get_session_context')");
    const authMe = authClient.slice(authClient.indexOf('async me()'), authClient.indexOf('async isAuthenticated()'));
    expect(authMe).not.toContain('user_metadata?.role');
    expect(login).toContain("supabase.rpc('erp_get_session_context')");
  });

  it('keeps branch scope out of browser session storage', () => {
    expect(managerPortal).not.toContain("sessionStorage.getItem('erp_active_branch_id')");
    expect(employeePortal).not.toContain("sessionStorage.getItem('erp_active_branch_id')");
    expect(managerPortal).toContain('managerBranchObject');
    expect(employeePortal).toContain('managerBranchObject');
  });

  it('honors explicit owner revocations and module-specific writes', () => {
    expect(migration).toContain("public.erp_default_permissions(p_role)");
    expect(migration).toContain("|| public.erp_sanitize_permissions(p_role, coalesce(p_membership_permissions, '{}'::jsonb))");
    expect(migration).toContain("'uploadSales'" );
    expect(migration).toContain("'createPurchases'");
    expect(migration).toContain("'updateInventory'");
    expect(migration).toContain("'recordAttendance'");
  });

  it('revokes anonymous execution from the control plane', () => {
    expect(migration).toContain('revoke all on function public.erp_get_session_context() from public, anon');
    expect(migration).toContain('revoke all on function public.update_user_role_and_permissions');
    expect(migration).toContain('grant execute on function public.erp_get_session_context() to authenticated, service_role');
  });
});
