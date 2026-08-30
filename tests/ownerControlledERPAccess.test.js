import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('owner-controlled ERP access contract', () => {
  const migration = read('supabase/migrations/20260830133000_owner_controlled_erp_access_core.sql');
  const roleContext = read('src/lib/RoleContext.jsx');
  const authClient = read('src/api/supabaseClient.js');
  const login = read('src/pages/ERPLogin.jsx');
  const registration = read('src/pages/ERPRegister.jsx');
  const managerPortal = read('src/pages/ManagerDashboardERP.jsx');
  const employeePortal = read('src/pages/EmployeeDashboardERP.jsx');
  const hardening = read('supabase/migrations/20260830160000_harden_erp_public_api_and_snapshot_rls.sql');
  const roleTemplates = read('supabase/migrations/20260830163000_restore_owner_role_templates.sql');
  const legacyLockdown = read('supabase/migrations/20260830170000_lock_legacy_privileged_rpcs.sql');

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
    expect(registration).not.toContain("sessionStorage.setItem('erp_active_branch_id'");
    expect(registration).not.toContain("sessionStorage.setItem('erp_active_restaurant_id'");
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

  it('hardens legacy RPCs and finalized financial snapshots', () => {
    expect(hardening).toContain('alter table public.sales_closing_customer_credit_snapshots enable row level security');
    expect(hardening).toContain('alter table public.sales_closing_cash_ledger_snapshots enable row level security');
    expect(hardening).toContain("and public.erp_has_permission('viewSales')");
    expect(hardening).toContain("'revoke execute on function %s from public, anon'");
    expect(hardening).toContain("'revoke execute on function %s from authenticated'");
  });

  it('offers owner registration only from the Owner portal', () => {
    expect(login).toContain('selectedRole?.role === ROLES.OWNER');
    expect(login).toContain('Create a new owner organization account');
  });

  it('restores role templates as an owner-only ERP workflow', () => {
    expect(roleTemplates).toContain('create table if not exists public.role_templates');
    expect(roleTemplates).toContain("check (base_role in ('manager','employee','supplier'))");
    expect(roleTemplates).toContain('using (public.erp_is_approved_owner(restaurant_id))');
    expect(roleTemplates).toContain("message = 'OWNER_ACCESS_REQUIRED'");
    expect(roleTemplates).toContain('public.erp_sanitize_permissions(source_template.base_role, source_template.permissions)');
    expect(roleTemplates).toContain('revoke all on function public.clone_role_template(uuid,text)');
  });

  it('locks legacy privileged RPCs and owner-scopes onboarding', () => {
    expect(legacyLockdown).toContain('if not public.erp_is_approved_owner(p_organization_id)');
    expect(legacyLockdown).toContain("message = 'ACTIVE_BRANCH_REQUIRED'");
    expect(legacyLockdown).toContain('revoke all on function public.erp_registration_options()');
    expect(legacyLockdown).toContain('revoke all on function public.process_registration_approval');
    expect(legacyLockdown).toContain('from public, anon, authenticated');
  });
});
