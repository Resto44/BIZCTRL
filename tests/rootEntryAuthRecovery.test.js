import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifiedERPRootHome } from '../src/lib/rootEntryDecision.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const home = {
  owner: '/owner-command-center',
  manager: '/manager-dashboard',
  employee: '/employee-dashboard',
  supplier: '/supplier-portal',
};

describe('safe iOS root auth recovery', () => {
  it('resolves only a canonical server-provided ERP role to its fixed protected route', () => {
    for (const [role, path] of Object.entries(home)) {
      expect(verifiedERPRootHome({ role }, home)).toBe(path);
    }
    expect(verifiedERPRootHome({ role: 'platform_owner' }, home)).toBe(null);
    expect(verifiedERPRootHome({ role: 'admin' }, home)).toBe(null);
    expect(verifiedERPRootHome({ role: 'owner', home_path: 'https://evil.example/redirect' }, home)).toBe(home.owner);
    expect(verifiedERPRootHome({ home_path: '/owner-command-center' }, home)).toBe(null);
    expect(verifiedERPRootHome(null, home)).toBe(null);
    expect(verifiedERPRootHome({ role: 'owner' }, { owner: '//evil.example' })).toBe(null);
  });

  it('verifies Supabase Auth identity before attempting either server authority', () => {
    const verified = app.indexOf('if (userData?.user?.id !== session.user.id)');
    const owner = app.indexOf("supabase.rpc('platform_owner_session_snapshot')", app.indexOf('function RootEntryRoute()'));
    const erp = app.indexOf("supabase.rpc('erp_get_session_context')", app.indexOf('function RootEntryRoute()'));
    expect(verified).toBeGreaterThan(-1);
    expect(owner).toBeGreaterThan(verified);
    expect(erp).toBeGreaterThan(verified);
    expect(app).toContain("withStartupDeadline(supabase.auth.getUser(session.access_token), 9000, 'ROOT_VERIFY_USER_TIMEOUT')");
  });

  it('keeps platform MFA priority and independently verifies ERP membership when Platform Owner lookup fails', () => {
    expect(app).toContain("const erpContextLookup = withStartupDeadline(");
    expect(app).toContain("supabase.rpc('erp_get_session_context'), 9000, 'ROOT_ERP_AUTHORIZATION_TIMEOUT'");
    expect(app).toContain("withStartupDeadline(supabase.rpc('platform_owner_session_snapshot'), 9000, 'ROOT_OWNER_AUTHORIZATION_TIMEOUT')");
    expect(app).toContain("navigate(snapshot.mfa_required && !snapshot.mfa_verified ? '/platform-owner/login' : '/platform-owner', { replace: true })");
    expect(app).toContain("verifiedERPRootHome(erpContext, ROLE_HOME)");
    expect(app).toContain("if (erpHome)");
    expect(app).toContain("navigate(erpHome, { replace: true })");
    expect(app).toContain("navigate('/erp-login', { replace: true })");
    expect(app).toContain("throw snapshotError || erpError");
  });

  it('never downgrades an unresolved session to unauthenticated public content and always provides safe escape', () => {
    expect(app).toContain("setDecision('authorization-error')");
    expect(app).toContain('href="/erp-login"');
    expect(app).toContain('Retry authorization check');
    expect(app).not.toContain('localStorage.clear()');
    expect(app).not.toContain('supabase.auth.admin');
    expect(app).not.toMatch(/delete\s+from\s+(auth\.users|public\.erp_memberships)/i);
  });
});
