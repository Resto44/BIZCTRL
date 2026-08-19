import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL('../src/supabase/20260819_platform_owner_clean_auth_provisioning.sql', import.meta.url);
const triggerGuardPath = new URL('../src/supabase/20260819_platform_owner_clean_auth_trigger_guard.sql', import.meta.url);
const triggerTicketGuardPath = new URL('../src/supabase/20260819_platform_owner_clean_auth_trigger_ticket_guard.sql', import.meta.url);
const provisionerPath = new URL('../supabase/functions/platform-owner-clean-auth-provision/index.ts', import.meta.url);
const loginPath = new URL('../src/pages/PlatformOwnerLogin.jsx', import.meta.url);
const appPath = new URL('../src/App.jsx', import.meta.url);

describe('Platform Owner clean Auth provisioning contract', () => {
  it('records a non-secret rollback point and changes only the Platform Owner Auth binding', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain('platform_owner_clean_auth_rebind_jobs');
    expect(migration).toContain('old_user_id uuid NOT NULL REFERENCES auth.users(id)');
    expect(migration).toContain('new_user_id uuid UNIQUE REFERENCES auth.users(id)');
    expect(migration).toContain('invocation_nonce_hash text NOT NULL UNIQUE');
    expect(migration).toContain('business_baseline jsonb NOT NULL');
    expect(migration).toContain('UPDATE public.platform_owner_accounts');
    expect(migration).toContain('SET user_id = p_new_user_id');
    expect(migration).not.toContain('DELETE FROM public.restaurants');
    expect(migration).not.toContain('DELETE FROM public.branches');
    expect(migration).not.toContain('DELETE FROM public.products');
    expect(migration).not.toContain('DELETE FROM public.inventory');
    expect(migration).not.toContain('DELETE FROM public.sales_invoices');
    expect(migration).not.toContain('DELETE FROM public.purchases');
    expect(migration).not.toContain('DELETE FROM public.expenses');
  });

  it('uses a one-time server-only provisioner to create the clean Auth user and dispatch normal account setup', async () => {
    const [provisioner, triggerGuard, triggerTicketGuard] = await Promise.all([
      readFile(provisionerPath, 'utf8'),
      readFile(triggerGuardPath, 'utf8'),
      readFile(triggerTicketGuardPath, 'utf8'),
    ]);

    expect(provisioner).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(provisioner).toContain('service.auth.admin.updateUserById');
    expect(provisioner).toContain('service.auth.admin.createUser');
    expect(provisioner).toContain('temporaryServerPassword()');
    expect(provisioner).toContain('crypto.getRandomValues');
    expect(provisioner).toContain('email_confirm: true');
    expect(provisioner).toContain('app_metadata: { platform_owner_clean_provisioning: true }');
    expect(provisioner).toContain('user_metadata: { platform_owner_clean_provisioning_nonce: nonce }');
    expect(provisioner).toContain('user_metadata: { platform_owner_clean_provisioning_nonce: null }');
    expect(triggerGuard).toContain("NEW.raw_app_meta_data ->> ''platform_owner_clean_provisioning''");
    expect(triggerTicketGuard).toContain("NEW.raw_user_meta_data ->> ''platform_owner_clean_provisioning_nonce''");
    expect(triggerTicketGuard).toContain("j.status IN (''pending'', ''provisioning'')");
    expect(triggerGuard).toContain('RETURN NEW;');
    expect(triggerGuard).not.toContain('DELETE FROM public.restaurants');
    expect(provisioner).toContain('platform_owner_claim_clean_auth_rebind');
    expect(provisioner).toContain('platform_owner_bind_clean_auth_rebind');
    expect(provisioner).toContain('platform_owner_record_clean_auth_setup_delivery');
    expect(provisioner).toContain('redirectTo: `${CANONICAL_ORIGIN}/platform-owner/new-owner-setup`');
    expect(provisioner).toContain('x-platform-owner-provision-nonce');
    expect(provisioner).not.toContain('req.json');
    expect(provisioner).not.toMatch(/console\.(log|warn|error|info).*?(password|nonce|email|serviceRoleKey)/i);
  });

  it('uses normal authenticated password setup and TOTP enrollment on the isolated new-owner route instead of recovery-session MFA authorization', async () => {
    const [login, app] = await Promise.all([
      readFile(loginPath, 'utf8'),
      readFile(appPath, 'utf8'),
    ]);

    expect(login).toContain("location.pathname === '/platform-owner/new-owner-setup'");
    expect(app).toContain('<Route path="/platform-owner/new-owner-setup" element={<Suspense fallback={<PageLoader />}><PlatformOwnerLogin /></Suspense>} />');
    expect(app).toContain("useNavigate } from 'react-router-dom'");
    expect(app).toContain('function RootEntryRoute()');
    expect(app).toContain("supabase.rpc('platform_owner_session_snapshot')");
    expect(app).toContain("navigate(snapshot.mfa_required && !snapshot.mfa_verified ? '/platform-owner/login' : '/platform-owner', { replace: true })");
    expect(app).toContain("navigate('/erp-login', { replace: true })");
    expect(app).toContain("setDecision('authorization-error')");
    expect(app).toContain('Authorization check unavailable');
    expect(app).toContain('<Route path="/" element={<RootEntryRoute />} />');
    expect(login).toContain('if (cleanOwnerSetupMode) {');
    expect(login).toContain('supabase.auth.updateUser({ password })');
    expect(login).toContain('await beginMfa();');
    expect(login).toContain("factorType: 'totp'");
    expect(login).toContain("supabase.auth.mfa.verify({");
    expect(login).toContain('cleanOwnerSetupMode ? text.cleanSetupTitle');
    expect(login).not.toContain('cleanOwnerSetupMode ? await assertRecoveryEnrollmentAuthorized');
  });
});
