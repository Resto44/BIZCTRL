import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const loginPath = new URL('../src/pages/PlatformOwnerLogin.jsx', import.meta.url);
const controlPlanePath = new URL('../src/supabase/20260815_platform_owner_control_plane.sql', import.meta.url);
const recoveryMigrationPath = new URL('../src/supabase/20260818_platform_owner_mfa_recovery.sql', import.meta.url);
const recoveryFinalizerPath = new URL('../supabase/functions/platform-owner-mfa-recovery-finalize/index.ts', import.meta.url);
const recoveryPasswordPath = new URL('../supabase/functions/platform-owner-mfa-recovery-password/index.ts', import.meta.url);
const recoveryPasswordMigrationPath = new URL('../src/supabase/20260818_platform_owner_mfa_recovery_password_stage.sql', import.meta.url);
const recoveryEmailBindingMigrationPath = new URL('../src/supabase/20260818_platform_owner_mfa_recovery_email_binding.sql', import.meta.url);

describe('Platform Owner recovery and MFA flow', () => {
  it('uses Supabase-backed Google Authenticator enrollment and never persists a setup secret', async () => {
    const login = await readFile(loginPath, 'utf8');
    const beginMfa = login.indexOf('const beginMfa = async');
    const discardAndReEnroll = login.indexOf('const discardAndReEnroll');
    const beginMfaSource = login.slice(beginMfa, discardAndReEnroll);

    expect(login).toContain("enrollTitle: 'Set up Google Authenticator'");
    expect(login).toContain('Scan this QR code with Google Authenticator, then enter the 6-digit verification code.');
    expect(login).toContain("enrollMfa: 'Verify & Enable MFA'");
    expect(login).toContain("friendlyName: 'BizCTRL Platform Owner — mybizctrl.site'");
    expect(login).toContain('Google Authenticator setup QR code');
    expect(beginMfaSource).toContain("factor.status === 'verified'");
    expect(beginMfaSource).toContain("setMfaStage('verify')");
    expect(beginMfaSource).toContain('recoveryEnrollment');
    expect(beginMfaSource).not.toContain('unenroll');
    expect(login).not.toMatch(/localStorage\.(setItem|getItem).*enrollment/i);
    expect(login).not.toMatch(/console\.(log|warn|error).*enrollment\.(secret|uri|qr_code)/i);
  });

  it('requires a Supabase email-recovery session before a recovery-only server endpoint can update the password and allow new-factor enrollment', async () => {
    const [login, passwordEndpoint, passwordMigration, emailBindingMigration] = await Promise.all([
      readFile(loginPath, 'utf8'),
      readFile(recoveryPasswordPath, 'utf8'),
      readFile(recoveryPasswordMigrationPath, 'utf8'),
      readFile(recoveryEmailBindingMigrationPath, 'utf8'),
    ]);
    const completeRecovery = login.slice(login.indexOf('const completeRecovery'), login.indexOf('const submit'));

    expect(login).toContain("supabase.rpc('platform_owner_prepare_mfa_recovery')");
    expect(login).toContain("resetPasswordForEmail(email.trim(), { redirectTo: getPlatformOwnerRecoveryRedirectUrl() })");
    expect(login).toContain("await supabase.auth.signOut({ scope: 'local' })");
    expect(completeRecovery).toContain("supabase.functions.invoke('platform-owner-mfa-recovery-password'");
    expect(completeRecovery).not.toContain('supabase.auth.updateUser({ password })');
    expect(completeRecovery).toContain("await beginMfa({ recoveryEnrollment: true })");
    expect(completeRecovery).toContain('mfaRecoveryReady');
    expect(passwordEndpoint).toContain('caller.auth.getUser()');
    expect(passwordEndpoint).toContain('caller.rpc("platform_owner_begin_mfa_recovery")');
    expect(passwordEndpoint).toContain('service.auth.admin.updateUserById');
    expect(passwordEndpoint.indexOf('platform_owner_begin_mfa_recovery')).toBeLessThan(passwordEndpoint.indexOf('updateUserById'));
    expect(passwordEndpoint).toContain('caller.rpc("platform_owner_mark_mfa_recovery_password_updated", {');
    expect(passwordMigration).toContain("status IN ('authorized', 'password_updated', 'finalizing', 'completed', 'expired', 'failed')");
    expect(passwordMigration).toContain("status = 'password_updated'");
    expect(emailBindingMigration).toContain("status IN ('email_requested', 'authorized', 'password_updated', 'finalizing', 'completed', 'expired', 'failed')");
    expect(emailBindingMigration).toContain('platform_owner_prepare_mfa_recovery');
    expect(emailBindingMigration).toContain("platform_owner_mfa_recovery_amr_present('password')");
    expect(emailBindingMigration).toContain("platform_owner_mfa_recovery_amr_present('recovery')");
    expect(emailBindingMigration).toContain('recovery_sent_at');
    expect(emailBindingMigration).toContain("v_request.session_id = v_session_id");
    expect(emailBindingMigration).toContain("status = 'email_requested'");
    expect(login.indexOf("resetPasswordForEmail(email.trim(), { redirectTo: getPlatformOwnerRecoveryRedirectUrl() })")).toBeLessThan(login.indexOf("await supabase.auth.signOut({ scope: 'local' })"));
  });

  it('retires a prior factor only after a new factor was verified and the recovery session has stepped up to AAL2', async () => {
    const login = await readFile(loginPath, 'utf8');
    const sql = await readFile(recoveryMigrationPath, 'utf8');
    const finalizer = await readFile(recoveryFinalizerPath, 'utf8');

    expect(login).toContain("supabase.auth.mfa.verify({ factorId: mfaFactor.id, challengeId: challenge.id, code: mfaCode.trim() })");
    expect(login).toContain('await finalizeMfaRecovery(mfaFactor.id)');
    expect(sql).toContain("platform_owner_mfa_recovery_amr_present('recovery')");
    expect(sql).toContain("platform_owner_mfa_recovery_amr_present('totp')");
    expect(sql).toContain('PERFORM public.platform_owner_assert();');
    expect(sql).toContain("p_new_factor_id uuid");
    expect(finalizer).toContain("platform_owner_claim_mfa_recovery");
    expect(finalizer).toContain("factor.id === newFactorId");
    expect(finalizer).toContain('service.auth.admin.mfa.deleteFactor');
    expect(finalizer.indexOf('platform_owner_claim_mfa_recovery')).toBeLessThan(finalizer.indexOf('service.auth.admin.mfa.deleteFactor'));
    expect(login).toContain("await supabase.auth.signOut()");
  });

  it('keeps Platform Owner authorization and MFA enforcement separate from tenant access', async () => {
    const sql = await readFile(controlPlanePath, 'utf8');
    expect(sql).toContain("v_aal := coalesce(auth.jwt() ->> 'aal', 'aal1');");
    expect(sql).toContain("IF v_mfa_required AND v_aal <> 'aal2' THEN");
    expect(sql).toContain("MESSAGE = 'PLATFORM_OWNER_MFA_REQUIRED'");
  });

  it('contains no raw TOTP secret, QR data, recovery token, or service-role key in recovery persistence or response payloads', async () => {
    const sql = await readFile(recoveryMigrationPath, 'utf8');
    const [finalizer, passwordEndpoint, emailBindingMigration] = await Promise.all([
      readFile(recoveryFinalizerPath, 'utf8'),
      readFile(recoveryPasswordPath, 'utf8'),
      readFile(recoveryEmailBindingMigrationPath, 'utf8'),
    ]);

    expect(sql).not.toMatch(/\b(secret|qr_code|otpauth|access_token|refresh_token)\b\s+(text|jsonb|varchar)/i);
    expect(finalizer).not.toMatch(/console\.(log|warn|error).*?(secret|qr|token|authorization)/i);
    expect(finalizer).not.toContain('replacement.secret');
    expect(finalizer).not.toContain('replacement.uri');
    expect(passwordEndpoint).not.toMatch(/console\.(log|warn|error).*?(password|secret|qr|token|authorization)/i);
    expect(passwordEndpoint).not.toMatch(/JSON\.stringify\([^)]*newPassword/);
    expect(emailBindingMigration).not.toMatch(/\b(secret|qr_code|otpauth|access_token|refresh_token)\b\s+(text|jsonb|varchar)/i);
  });
});

const mfaFlowContract = true;
void mfaFlowContract;
