import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const loginPath = new URL('../src/pages/PlatformOwnerLogin.jsx', import.meta.url);
const controlPlanePath = new URL('../src/supabase/20260815_platform_owner_control_plane.sql', import.meta.url);

describe('Platform Owner recovery and MFA flow', () => {
  it('keeps recovery password updates separate from authenticated AAL2 verification', async () => {
    const login = await readFile(loginPath, 'utf8');
    expect(login).toContain("supabase.auth.updateUser({ password })");
    expect(login).toContain("supabase.auth.mfa.listFactors()");
    expect(login).toContain("supabase.auth.mfa.enroll({ factorType: 'totp'");
    expect(login).toContain("factor.status === 'unverified'");
    expect(login).toContain("setMfaStage('discard')");
    expect(login).toContain("supabase.auth.mfa.unenroll({ factorId: mfaFactor.id })");
    expect(login).toContain("discardAndReEnroll");
    expect(login).toContain("supabase.auth.mfa.challenge({ factorId: mfaFactor.id })");
    expect(login).toContain("supabase.auth.mfa.verify({ factorId: mfaFactor.id, challengeId: challenge.id, code: mfaCode.trim() })");
    expect(login).toContain("await beginMfa();");
    expect(login).toContain('type="submit"');
    expect(login).toContain("supabase.auth.getSession()");
    expect(login).toContain('recoverySessionRequired');
    expect(login).not.toContain("await supabase.auth.signOut();\n      setRecovery(false);");
  });

  it('uses Supabase-backed Google Authenticator enrollment only when no verified factor exists and never persists the setup secret', async () => {
    const login = await readFile(loginPath, 'utf8');
    const beginMfa = login.indexOf('const beginMfa = async');
    const discardAndReEnroll = login.indexOf('const discardAndReEnroll');
    const beginMfaSource = login.slice(beginMfa, discardAndReEnroll);
    expect(login).toContain("enrollTitle: 'Set up Google Authenticator'");
    expect(login).toContain('Scan this QR code with Google Authenticator, then enter the 6-digit verification code.');
    expect(login).toContain("enrollMfa: 'Verify & Enable MFA'");
    expect(login).toContain('Google Authenticator setup QR code');
    expect(beginMfaSource).toContain("factor.status === 'verified'");
    expect(beginMfaSource).toContain("setMfaStage('verify')");
    expect(beginMfaSource).not.toContain('unenroll');
    expect(login).not.toMatch(/localStorage\.(setItem|getItem).*enrollment/i);
    expect(login).not.toMatch(/console\.(log|warn|error).*enrollment\.secret/i);
  });

  it('does not call the AAL2-protected dashboard route until MFA is verified', async () => {
    const login = await readFile(loginPath, 'utf8');
    const beginMfa = login.indexOf('const beginMfa = async');
    const completeMfa = login.indexOf('const completeMfa = async');
    const beginMfaSource = login.slice(beginMfa, completeMfa);
    expect(beginMfaSource).toContain("platformOwnerApi.snapshot()");
    expect(beginMfaSource).toContain("snapshot.mfa_required");
    expect(beginMfaSource).toContain("setMfaStage('verify')");
    expect(beginMfaSource).toContain("setMfaStage('enroll')");
    expect(beginMfaSource).not.toContain("platformOwnerApi.dashboard()");
    expect(login).toContain("await verify();");
  });

  it('preserves server-side AAL2 enforcement in the Platform Owner assertion', async () => {
    const sql = await readFile(controlPlanePath, 'utf8');
    expect(sql).toContain("v_aal := coalesce(auth.jwt() ->> 'aal', 'aal1');");
    expect(sql).toContain("IF v_mfa_required AND v_aal <> 'aal2' THEN");
    expect(sql).toContain("MESSAGE = 'PLATFORM_OWNER_MFA_REQUIRED'");
  });
});

const mfaFlowContract = true;
void mfaFlowContract;
