import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const register=read('../src/pages/ERPRegister.jsx');
const owner=read('../src/components/owner/OwnerStaffProvisioning.jsx');
const migration=read('../supabase/migrations/20261109080500_block_erp_invite_for_existing_identity.sql');

describe('Existing BizControl ERP account invited again as Supplier',()=>{
 it('does not display a fake email-sent message for repeat signup / obfuscated identities',()=>{
  expect(register).toContain("Array.isArray(data.user.identities) && data.user.identities.length===0");
  expect(register).toContain("setAwaitingEmail(false);");
  expect(register).toContain("setMode('signin');");
  expect(register).toContain("may already be registered");
  expect(register).not.toContain("toast.success('Verify the email sent");
  expect(register).toContain("if (emailMode && !data?.user?.id)");
 });
 it('allows explicit confirmation resend only after a new non-session signup, with bounded client cadence',()=>{
  expect(register).toContain('const resendInvitationEmail = async () => {');
  expect(register).toContain("type:'signup'");
  expect(register).toContain('emailRedirectTo:');
  expect(register).toContain("lastConfirmationResendAt.current < 60000");
  expect(register).toContain('disabled={resendingEmail}');
  expect(register).toContain('Already have a BizControl account? Sign in');
  expect(register).not.toContain('setInterval(resendInvitationEmail');
 });
 it('explains cross-organization existing accounts without deleting or hijacking owner roles',()=>{
  expect(register).toContain('This email already belongs to a BizControl ERP account.');
  expect(register).toContain('Your existing account is unchanged.');
  expect(register).toContain('another unused email');
  expect(migration).not.toContain('DELETE FROM auth.users');
  expect(migration).not.toContain('UPDATE public.profiles SET role');
  expect(migration).not.toContain('UPDATE public.erp_memberships SET role');
 });
 it('checks existing ERP membership only inside owner-authenticated invitation issuance',()=>{
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_erp_invitation');
  expect(migration).toContain('SECURITY DEFINER');
  expect(migration).toContain("role = 'owner'");
  expect(migration).toContain("status = 'approved'");
  expect(migration).toContain('INVITEE_ALREADY_HAS_ERP_ACCOUNT_USE_NEW_EMAIL');
  expect(migration).toContain('FROM auth.users u');
  expect(migration).toContain('FROM public.erp_memberships m WHERE m.user_id = u.id');
  expect(migration).toContain('FROM public.profiles p WHERE p.id = u.id');
  expect(migration.indexOf('INVITEE_ALREADY_HAS_ERP_ACCOUNT_USE_NEW_EMAIL')).toBeLessThan(migration.indexOf('UPDATE public.erp_invitations'));
 });
 it('owner UI gives actionable message before share or renew, no confusing generic RPC error',()=>{
  expect(owner).toContain('const inviteErrorMessage = error =>');
  expect(owner).toContain('INVITEE_ALREADY_HAS_ERP_ACCOUNT_USE_NEW_EMAIL');
  expect(owner).toContain('toast.error(inviteErrorMessage(error));');
  expect(owner).toContain('Use an email that is not already registered as a BizControl Owner or staff member.');
  expect(owner).toContain('Sharing this link does not itself send a verification email');
 });
 it('leaves token validation and single-tenant role safety intact',()=>{
  expect(migration).toContain('token_hash');
  expect(migration).toContain('pg_advisory_xact_lock');
  expect(migration).toContain('erp_subscription_capacity_state');
  expect(register).toContain("supabase.rpc('activate_erp_invitation'");
  expect(register).toContain('emailRedirectTo:');
  expect(register).toContain('activationUrl');
 });
});
