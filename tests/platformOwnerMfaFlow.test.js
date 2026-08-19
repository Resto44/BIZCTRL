import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const loginPath = new URL('../src/pages/PlatformOwnerLogin.jsx', import.meta.url);
const controlPlanePath = new URL('../src/supabase/20260815_platform_owner_control_plane.sql', import.meta.url);
const sessionAuthorizationMigrationPath = new URL('../src/supabase/20260818_platform_owner_mfa_recovery_session_authorization.sql', import.meta.url);
const recoveryBindingMigrationPath = new URL('../src/supabase/20260818_platform_owner_mfa_recovery_email_binding.sql', import.meta.url);
const sessionAuthorityFunctionPath = new URL('../supabase/functions/platform-owner-mfa-recovery-session/index.ts', import.meta.url);
const retiredPasswordFunctionPath = new URL('../supabase/functions/platform-owner-mfa-recovery-password/index.ts', import.meta.url);
const retiredFinalizerPath = new URL('../supabase/functions/platform-owner-mfa-recovery-finalize/index.ts', import.meta.url);

describe('Platform Owner recovery-session MFA re-enrollment contract', () => {
  it('creates recovery email authorization only from the authenticated owner MFA screen and binds it server-side', async () => {
    const [login, recoveryBinding, authority] = await Promise.all([
      readFile(loginPath, 'utf8'),
      readFile(recoveryBindingMigrationPath, 'utf8'),
      readFile(sessionAuthorityFunctionPath, 'utf8'),
    ]);

    expect(login).toContain("supabase.functions.invoke('platform-owner-mfa-recovery-session'");
    expect(login).toContain('requireLivePlatformOwnerMfaSession');
    expect(login).toContain('supabase.auth.getUser(session.access_token)');
    expect(login).toContain('supabase.functions.setAuth(session.access_token)');
    expect(login).toContain('headers: { Authorization: `Bearer ${session.access_token}` }');
    expect(login).toContain("action: 'request'");
    expect(login).toContain('redirectTo: getPlatformOwnerRecoveryRedirectUrl()');
    expect(authority).toContain('caller.auth.getUser(accessToken)');
    expect(authority).toContain('AUTHENTICATED_OWNER_SESSION_REQUIRED');
    expect(authority).toContain('caller.rpc("platform_owner_session_snapshot")');
    expect(authority).toContain('PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED');
    expect(authority).toContain('caller.rpc("platform_owner_prepare_mfa_recovery")');
    expect(authority).toContain('caller.auth.resetPasswordForEmail');
    expect(authority).toContain('redirectTo !== `${APP_ORIGIN}/platform-owner/recover`');
    expect(authority).toContain('origin !== APP_ORIGIN');
    expect(recoveryBinding).toContain("platform_owner_mfa_recovery_amr_present('password')");
    expect(recoveryBinding).toContain("status = 'email_requested'");
    expect(recoveryBinding).toContain('session_id = v_session_id');
    expect(recoveryBinding).toContain('expires_at > now()');
  });

  it('requires the newest verified recovery session for server-side password replacement and transitions the bound ledger before MFA enrollment', async () => {
    const [login, recoveryBinding, sessionMigration, authority] = await Promise.all([
      readFile(loginPath, 'utf8'),
      readFile(recoveryBindingMigrationPath, 'utf8'),
      readFile(sessionAuthorizationMigrationPath, 'utf8'),
      readFile(sessionAuthorityFunctionPath, 'utf8'),
    ]);

    expect(login).toContain("action: 'complete', newPassword: password");
    expect(login).toContain("throw new Error('MFA_RECOVERY_SESSION_REQUIRED')");
    expect(login).not.toContain('supabase.auth.updateUser({ password })');
    expect(authority).toContain('caller.rpc("platform_owner_begin_mfa_recovery")');
    expect(authority).toContain('service.auth.admin.updateUserById(userData.user.id, { password: newPassword })');
    expect(authority).toContain('caller.rpc("platform_owner_mark_mfa_recovery_password_updated"');
    expect(authority.indexOf('platform_owner_begin_mfa_recovery')).toBeLessThan(authority.indexOf('updateUserById'));
    expect(authority.indexOf('updateUserById')).toBeLessThan(authority.indexOf('platform_owner_mark_mfa_recovery_password_updated'));
    expect(recoveryBinding).toContain("platform_owner_mfa_recovery_amr_present('recovery')");
    expect(recoveryBinding).toContain('recovery_sent_at < v_request.email_requested_at');
    expect(recoveryBinding).toContain("status = 'authorized'");
    expect(sessionMigration).toContain("status = 'password_updated'");
    expect(sessionMigration).toContain('password_updated_at IS NOT NULL');
    expect(sessionMigration).toContain('session_id = v_session_id');
    expect(sessionMigration).toContain('PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED');
    expect(sessionMigration).toContain('PLATFORM_OWNER_MFA_RECOVERY_AAL1_REQUIRED');
  });

  it('generates a real Supabase Auth TOTP enrollment only after server authorization and verifies the six-digit code through Supabase Auth', async () => {
    const login = await readFile(loginPath, 'utf8');

    expect(login).toContain("supabase.rpc('platform_owner_authorize_mfa_reenrollment')");
    expect(login).toContain('if (recoveryEnrollment) {');
    expect(login).toContain('else if (!recoveryAuthorized)');
    expect(login).toContain("factorType: 'totp'");
    expect(login).toContain("friendlyName: 'BizCTRL Platform Owner — mybizctrl.site'");
    expect(login).toContain('Google Authenticator setup QR code');
    expect(login).toContain('enrollment?.qr_code');
    expect(login).toContain('enrollment.secret');
    expect(login).toContain("supabase.auth.mfa.challenge({ factorId: mfaFactor.id })");
    expect(login).toContain('supabase.auth.mfa.verify({');
    expect(login).toContain('code: mfaCode.trim()');
    expect(login).toContain("/^\\d{6}$/.test(mfaCode.trim())");
    expect(login).not.toContain('enrollment.uri');
    expect(login).not.toMatch(/localStorage\.(setItem|getItem).*enrollment/i);
    expect(login).not.toMatch(/console\.(log|warn|error).*enrollment\.(secret|uri|qr_code)/i);
  });

  it('retains the old factor until the new factor is verified, then safely retires it and logs out before a fresh new-factor login', async () => {
    const [login, sessionMigration] = await Promise.all([
      readFile(loginPath, 'utf8'),
      readFile(sessionAuthorizationMigrationPath, 'utf8'),
    ]);

    expect(login).toContain('setPriorFactorIds(verifiedFactors.map((factor) => factor.id))');
    expect(login.indexOf('supabase.auth.mfa.verify({')).toBeLessThan(login.indexOf('await retirePriorFactors(mfaFactor.id)'));
    expect(login).toContain("supabase.rpc('platform_owner_record_mfa_reenrollment_verified'");
    expect(login).toContain('supabase.auth.mfa.unenroll({ factorId })');
    expect(login).toContain("supabase.rpc('platform_owner_record_mfa_reenrollment_completed'");
    expect(login).toContain("await supabase.auth.signOut({ scope: 'local' })");
    expect(login).toContain('await beginMfa();');
    expect(login).toContain('await verifyPortalAccess();');
    expect(sessionMigration).toContain("status = 'finalizing'");
    expect(sessionMigration).toContain("status = 'completed'");
    expect(sessionMigration).toContain('new_factor_id = p_new_factor_id');
    expect(sessionMigration).toContain('v_remaining_verified_factor_count <> 1');
    expect(sessionMigration).toContain("status = 'verified'");
    expect(sessionMigration).toContain('PLATFORM_OWNER_MFA_RECOVERY_RETIREMENT_INCOMPLETE');
  });

  it('keeps Platform Owner authorization and global MFA enforcement intact and isolates all active recovery operations from the retired endpoints', async () => {
    const [controlPlane, login, authority, passwordFunction, finalizer] = await Promise.all([
      readFile(controlPlanePath, 'utf8'),
      readFile(loginPath, 'utf8'),
      readFile(sessionAuthorityFunctionPath, 'utf8'),
      readFile(retiredPasswordFunctionPath, 'utf8'),
      readFile(retiredFinalizerPath, 'utf8'),
    ]);

    expect(controlPlane).toContain("IF v_mfa_required AND v_aal <> 'aal2' THEN");
    expect(controlPlane).toContain("MESSAGE = 'PLATFORM_OWNER_MFA_REQUIRED'");
    expect(login).not.toContain("supabase.functions.invoke('platform-owner-mfa-recovery-password'");
    expect(login).not.toContain("supabase.functions.invoke('platform-owner-mfa-recovery-finalize'");
    expect(authority).not.toMatch(/console\.(log|warn|error).*?(password|token|secret|authorization)/i);
    expect(authority).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(authority).not.toContain('console.');
    expect(passwordFunction).toContain('MFA_RECOVERY_FLOW_RETIRED');
    expect(finalizer).toContain('MFA_RECOVERY_FLOW_RETIRED');
    expect(passwordFunction).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(finalizer).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
