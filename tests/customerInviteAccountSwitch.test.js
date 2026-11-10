import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { customerInviteTokenFromHash, resolveCustomerInviteToken } from '../src/lib/customerInviteLink.js';

const oldToken = 'a'.repeat(64);
const freshToken = 'b'.repeat(64);
const portalFile = new URL('../src/pages/CustomerPortal.jsx', import.meta.url);
const ownerInviteFile = new URL('../src/components/customer/CustomerPortalInvitation.jsx', import.meta.url);
const textsFile = new URL('../src/lib/customerPortal.js', import.meta.url);

describe('Customer invitation email mismatch & iPhone Safari refresh recovery', () => {
  it('prioritizes a freshly opened invitation over a stale browser token', () => {
    expect(resolveCustomerInviteToken('#invite=' + freshToken, oldToken)).toBe(freshToken);
    expect(resolveCustomerInviteToken('', oldToken)).toBe(oldToken);
    expect(resolveCustomerInviteToken('#somethingElse=1', oldToken)).toBe(oldToken);
    expect(customerInviteTokenFromHash('#invite=' + freshToken)).toBe(freshToken);
  });

  it('rejects malformed tokens and Supabase Auth fragments', () => {
    for (const hash of ['#invite=', '#invite=short', '#access_token=secret',
      '#invite=' + ('x'.repeat(64)), '#invite=' + ('a'.repeat(63))]) {
      expect(customerInviteTokenFromHash(hash)).toBe('');
    }
    expect(resolveCustomerInviteToken('#invite=short', '')).toBe('');
  });

  it('reacts to same-page hash changes and Safari pageshow without removing a valid invite', async () => {
    const page = await readFile(portalFile, 'utf8');
    expect(page).toContain("window.addEventListener('hashchange', syncInvitationFromUrl)");
    expect(page).toContain("window.addEventListener('pageshow', syncInvitationFromUrl)");
    expect(page).toContain("sessionStorage.setItem('customer:invite', newest)");
    expect(page).toContain('setInvite(previous => previous === newest ? previous : newest)');
    expect(page).toContain('resolveCustomerInviteToken(window.location.hash');
    expect(page).toContain('setInvite(\'\')');
  });

  it('preserves invitation while signing out and switching to the actual invited email', async () => {
    const page = await readFile(portalFile, 'utf8');
    const texts = await readFile(textsFile, 'utf8');
    expect(page).toContain('signOutForInvitation');
    expect(page).toContain('await supabase.auth.signOut()');
    expect(page).toContain('{t.switchAccount}');
    expect(page).toContain('{t.customerInviteHelp}');
    for (const key of ['accountMismatchHelp', 'signoutSwitchHelp', 'switchAccount', 'customerInviteHelp']) {
      expect(texts).toContain(key);
    }
  });

  it('shows owner the email actually bound to the invite', async () => {
    const code = await readFile(ownerInviteFile, 'utf8');
    expect(code).toContain('{t.inviteRecipientLabel}');
    expect(code).toContain('email.trim().toLowerCase()');
    expect(code).toContain('p_email: email.trim()');
  });
});
