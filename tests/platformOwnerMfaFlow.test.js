import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const loginPath = new URL('../src/pages/PlatformOwnerLogin.jsx', import.meta.url);
const appUrlPath = new URL('../src/lib/appUrl.js', import.meta.url);
const controlPlanePath = new URL('../src/supabase/20260815_platform_owner_control_plane.sql', import.meta.url);

describe('Platform Owner clean password setup and normal MFA contract', () => {
  it('sends standard password-reset email links to the dedicated clean owner setup route', async () => {
    const [login, appUrl] = await Promise.all([
      readFile(loginPath, 'utf8'),
      readFile(appUrlPath, 'utf8'),
    ]);

    expect(login).toContain('supabase.auth.resetPasswordForEmail(email.trim()');
    expect(login).toContain('redirectTo: getPlatformOwnerRecoveryRedirectUrl()');
    expect(login).toContain("location.pathname === '/platform-owner/new-owner-setup'");
    expect(appUrl).toContain('/platform-owner/new-owner-setup');
    expect(appUrl).not.toContain('/platform-owner/recover');
  });

  it('updates the password from the valid recovery session, then enters normal MFA handling', async () => {
    const login = await readFile(loginPath, 'utf8');

    expect(login).toContain('supabase.auth.updateUser({ password })');
    expect(login).toContain('await beginMfa();');
    expect(login).toContain("const verifiedFactor = (factors?.totp || []).find((factor) => factor.status === 'verified')");
    expect(login).toContain("setMfaStage('verify')");
    expect(login).not.toContain('recoveryEnrollment');
    expect(login).not.toContain('setRecoveryAuthorized');
    expect(login).not.toContain('platform_owner_authorize_mfa_reenrollment');
    expect(login).not.toContain('platform-owner-mfa-recovery-session');
    expect(login).not.toContain('invokeAuthenticatedMfaRecovery');
  });

  it('keeps normal Supabase TOTP verification and never removes an existing factor during password setup', async () => {
    const login = await readFile(loginPath, 'utf8');

    expect(login).toContain("factorType: 'totp'");
    expect(login).toContain("friendlyName: 'BizCTRL Platform Owner — mybizctrl.site'");
    expect(login).toContain("supabase.auth.mfa.challenge({ factorId: mfaFactor.id })");
    expect(login).toContain('supabase.auth.mfa.verify({');
    expect(login).toContain('code: mfaCode.trim()');
    expect(login).toContain("await verifyPortalAccess()");
    expect(login).not.toContain('retirePriorFactors');
    expect(login).not.toContain('setPriorFactorIds');
    expect(login).not.toContain('supabase.auth.mfa.unenroll({ factorId })');
  });

  it('retains server-side Platform Owner authorization and AAL2 enforcement', async () => {
    const controlPlane = await readFile(controlPlanePath, 'utf8');

    expect(controlPlane).toContain("IF v_mfa_required AND v_aal <> 'aal2' THEN");
    expect(controlPlane).toContain("MESSAGE = 'PLATFORM_OWNER_MFA_REQUIRED'");
    expect(controlPlane).toContain("'authorized', coalesce(v_account.status = 'active', false)");
    expect(controlPlane).toContain("'mfa_verified', v_aal = 'aal2'");
  });
});
