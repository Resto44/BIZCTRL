import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const invitationPath = new URL('../src/components/owner/OwnerStaffProvisioning.jsx', import.meta.url);
const appPath = new URL('../src/App.jsx', import.meta.url);
const accessSettingsPath = new URL('../src/pages/UsersAccessSettings.jsx', import.meta.url);

describe('Quick owner user invitations', () => {
  it('uses one contact field with explicit email and phone modes', async () => {
    const source = await readFile(invitationPath, 'utf8');
    expect(source).toContain("const [contactMode, setContactMode] = useState('email')");
    expect(source).toContain('id="invite-contact"');
    expect(source).toContain('Invite by email');
    expect(source).toContain('Invite by phone');
    expect(source).toContain("contactMode === 'email' ? identity.toLowerCase() : null");
    expect(source).toContain("contactMode === 'phone' ? identity : null");
  });

  it('keeps invitation creation and revocation on the secure owner RPCs', async () => {
    const source = await readFile(invitationPath, 'utf8');
    expect(source).toContain("supabase.rpc('create_erp_invitation'");
    expect(source).toContain("supabase.rpc('revoke_erp_invitation'");
    expect(source).toContain('p_permissions: {}');
    expect(source).toContain('subscriptionLimitErrorMessage');
  });

  it('supports immediate mobile sharing and manual copy fallback', async () => {
    const source = await readFile(invitationPath, 'utf8');
    expect(source).toContain("typeof navigator.share === 'function'");
    expect(source).toContain('await navigator.share(shareData)');
    expect(source).toContain('navigator.clipboard.writeText');
    expect(source).toContain('Share now');
  });

  it('renews a real token instead of claiming an unreadable old token was resent', async () => {
    const source = await readFile(invitationPath, 'utf8');
    expect(source).toContain('reissueInvitation');
    expect(source).toContain('Renew link');
    expect(source).toContain('A new one-time link replaced the previous invitation.');
    expect(source).not.toContain('Resend link');
  });

  it('protects the route with user-management access and states the real server expiry', async () => {
    const [appSource, accessSource] = await Promise.all([
      readFile(appPath, 'utf8'),
      readFile(accessSettingsPath, 'utf8'),
    ]);
    expect(appSource).toContain('RoleGuard permission="manageUsers"><StaffInvitations');
    expect(accessSource).toContain('7 days · server enforced');
    expect(accessSource).not.toContain('Auto-expire invitations');
  });

  it('uses responsive, non-overflowing mobile controls', async () => {
    const source = await readFile(invitationPath, 'utf8');
    expect(source).toContain('min-w-0 space-y-4');
    expect(source).toContain('grid grid-cols-3 gap-2');
    expect(source).toContain('sm:grid-cols-2');
    expect(source).toContain('sm:flex-row');
  });
});
