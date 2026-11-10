import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

describe('Customer portal email and invitation recovery', () => {
 it('sends an owner-created customer invitation without deleting the manual fallback', async () => {
  const code = await read('../src/components/customer/CustomerPortalInvitation.jsx');
  expect(code).toContain("customerPortalRpc('erp_customer_portal_invite'");
  expect(code).toContain("supabase.functions.invoke('customer-portal-invitation-email'");
  expect(code).toContain('customer_id: customer.id, token: invitationToken');
  expect(code).toContain('await deliver(data.token)');
  expect(code).toContain("setEmailState('accepted')");
  expect(code).toContain("setEmailState('failed')");
  expect(code).toContain('navigator.clipboard.writeText(link)');
  expect(code).toContain("onClick={()=>deliver(token)}");
 });

 it('server verifies owner membership, customer and token hash before sending', async () => {
  const code = await read('../supabase/functions/customer-portal-invitation-email/index.ts');
  expect(code).toContain('caller.auth.getUser()');
  expect(code).toContain(".eq('user_id', user.id).eq('restaurant_id', customer.restaurant_id)");
  expect(code).toContain(".eq('role', 'owner').eq('status', 'approved')");
  expect(code).toContain("admin.from('customer_portal_access')");
  expect(code).toContain('digest !== invitation.token_hash');
  expect(code).toContain("to: [invitation.invited_email]");
  expect(code).toContain('Idempotency-Key');
  expect(code).toContain('delivery_confirmed: false');
  expect(code).not.toContain('input.email');
  expect(code).not.toContain('service_role:');
 });

 it('offers Supabase signup confirmation resend, separate from invitation delivery', async () => {
  const [page, text] = await Promise.all([
   read('../src/pages/CustomerPortal.jsx'), read('../src/lib/customerPortal.js')
  ]);
  expect(page).toContain("supabase.auth.resend({type:'signup'");
  expect(page).toContain('customerPortalErrorMessage(err,t)');
  expect(page).toContain('setEmailPending(true)');
  expect(text).toContain('CUSTOMER_PORTAL_INVITATION_INVALID');
  expect(text).toContain('CUSTOMER_PORTAL_VERIFIED_EMAIL_REQUIRED');
  for (const phrase of ['retryEmail', 'emailAccepted', 'emailFailed', 'resendConfirmation', 'inviteInvalid']) {
   expect(text).toContain(phrase);
  }
 });
});
