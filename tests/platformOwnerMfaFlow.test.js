import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const loginPath = new URL('../src/pages/PlatformOwnerLogin.jsx', import.meta.url);
const controlPlanePath = new URL('../src/supabase/20260815_platform_owner_control_plane.sql', import.meta.url);
const reenrollmentMigrationPath = new URL('../src/supabase/20260818_platform_owner_mfa_reenrollment.sql', import.meta.url);
const retiredPasswordFunctionPath = new URL('../supabase/functions/platform-owner-mfa-recovery-password/index.ts', import.meta.url);
const retiredFinalizerPath = new URL('../supabase/functions/platform-owner-mfa-recovery-finalize/index.ts', import.meta.url);

describe('Platform Owner native MFA re-enrollment flow', () => {
  it('uses a real server-backed Google Authenticator enrollment and never persists a setup secret', async () => {
    const login = await readFile(loginPath, 'utf8');

    expect(login).toContain("factorType: 'totp'");
    expect(login).toContain("friendlyName: 'BizCTRL Platform Owner — mybizctrl.site'");
    expect(login).toContain('Google Authenticator setup QR code');
    expect(login).toContain('enrollment?.qr_code');
    expect(login).toContain('enrollment.secret');
    expect(login).toContain("mfaStage === 'enroll'");
    expect(login).toContain('recoveryAuthorized');
    expect(login).toContain("supabase.auth.mfa.challenge({ factorId: mfaFactor.id })");
    expect(login).toContain('supabase.auth.mfa.verify({');
    expect(login).toContain('code: mfaCode.trim()');
    expect(login).not.toMatch(/localStorage\.(setItem|getItem).*enrollment/i);
    expect(login).not.toMatch(/console\.(log|warn|error).*enrollment\.(secret|uri|qr_code)/i);
    expect(login).not.toContain('enrollment.uri');
  });

  it('uses a native Supabase password-recovery session as the approved recovery mechanism and keeps it on the canonical domain', async () => {
    const login = await readFile(loginPath, 'utf8');

    expect(login).toContain('supabase.auth.resetPasswordForEmail(email.trim(), {');
    expect(login).toContain('redirectTo: getPlatformOwnerRecoveryRedirectUrl()');
    expect(login).toContain('event === \'PASSWORD_RECOVERY\'');
    expect(login).toContain("window.history.replaceState(null, document.title, '/platform-owner/recover')");
    expect(login).toContain('supabase.auth.updateUser({ password })');
    expect(login).toContain("supabase.rpc('platform_owner_authorize_mfa_reenrollment')");
    expect(login).not.toContain("supabase.functions.invoke('platform-owner-mfa-recovery-password'");
    expect(login).not.toContain("supabase.functions.invoke('platform-owner-mfa-recovery-finalize'");
  });

  it('enforces server-side Platform Owner authorization for recovery enrollment and retains old factors until the new TOTP factor verifies', async () => {
    const [login, migration] = await Promise.all([
      readFile(loginPath, 'utf8'),
      readFile(reenrollmentMigrationPath, 'utf8'),
    ]);

    expect(login).toContain('platformOwnerApi.snapshot()');
    expect(login).toContain('snapshot?.authorized');
    expect(login).toContain('snapshot.mfa_required');
    expect(login).toContain('snapshot.mfa_verified');
    expect(login).toContain('setPriorFactorIds(verifiedFactors.map((factor) => factor.id))');
    expect(login).toContain("mfaStage === 'enroll'");
    expect(login.indexOf('supabase.auth.mfa.verify({')).toBeLessThan(login.indexOf('await retirePriorFactors(mfaFactor.id)'));
    expect(login).toContain("supabase.rpc('platform_owner_record_mfa_reenrollment_verified'");
    expect(login).toContain('supabase.auth.mfa.unenroll({ factorId })');
    expect(login).toContain("supabase.rpc('platform_owner_record_mfa_reenrollment_completed'");
    expect(login).toContain("await supabase.auth.signOut({ scope: 'local' })");

    expect(migration).toContain('public.platform_owner_is_authorized()');
    expect(migration).toContain("auth.jwt() ->> 'aal', 'aal1'");
    expect(migration).toContain("platform_owner_mfa_recovery_amr_present('recovery')");
    expect(migration).toContain("platform_owner_mfa_recovery_amr_present('totp')");
    expect(migration).toContain('status = \'verified\'');
    expect(migration).toContain('PLATFORM_OWNER_MFA_RECOVERY_RETIREMENT_INCOMPLETE');
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.platform_owner_prepare_mfa_recovery() FROM authenticated;');
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.platform_owner_claim_mfa_recovery(uuid, uuid) FROM authenticated;');
  });

  it('keeps normal Platform Owner authorization and MFA enforcement separate from tenant access', async () => {
    const sql = await readFile(controlPlanePath, 'utf8');
    expect(sql).toContain("v_aal := coalesce(auth.jwt() ->> 'aal', 'aal1');");
    expect(sql).toContain("IF v_mfa_required AND v_aal <> 'aal2' THEN");
    expect(sql).toContain("MESSAGE = 'PLATFORM_OWNER_MFA_REQUIRED'");
  });

  it('contains no raw TOTP secret, QR data, recovery token, or service-role key in persistence, audit calls, or active recovery functions', async () => {
    const [login, migration, passwordFunction, finalizer] = await Promise.all([
      readFile(loginPath, 'utf8'),
      readFile(reenrollmentMigrationPath, 'utf8'),
      readFile(retiredPasswordFunctionPath, 'utf8'),
      readFile(retiredFinalizerPath, 'utf8'),
    ]);

    expect(migration).not.toMatch(/\b(secret|qr_code|otpauth|access_token|refresh_token)\b\s+(text|jsonb|varchar)/i);
    expect(login).not.toMatch(/console\.(log|warn|error).*?(secret|qr|token|authorization)/i);
    expect(login).not.toContain('enrollment.uri');
    expect(passwordFunction).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(finalizer).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(passwordFunction).not.toContain('createClient');
    expect(finalizer).not.toContain('createClient');
    expect(passwordFunction).toContain('MFA_RECOVERY_FLOW_RETIRED');
    expect(finalizer).toContain('MFA_RECOVERY_FLOW_RETIRED');
  });
});
