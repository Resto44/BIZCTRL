import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

describe('Customer approvals in Owner Approval Center', () => {
 it('offers Customer as sixth independent role, never through ERP staff or Wallet authorization',async()=>{
  const [owner,center]=await Promise.all([
   read('../src/components/owner/OwnerStaffProvisioning.jsx'),
   read('../src/pages/OwnerApprovalCenter.jsx'),
  ]);
  for(const role of ['manager','employee','supplier','driver','wallet','customer'])
   expect(owner).toContain("value: '"+role+"'");
  expect(owner).toContain("form.role === 'customer'");
  expect(owner).toContain("<CustomerApprovalInvitations");
  expect(owner).toContain("role === 'customer') throw new Error");
  expect(owner).toContain("form.role === 'wallet'");
  expect(owner).toContain("<WalletJoinInvitation");
  expect(owner).toContain("supabase.rpc('create_erp_invitation'");
  expect(owner).not.toContain("p_role: 'customer'");
  expect(center).toContain("OwnerStaffProvisioning");
 });
 it('lists only approved owner authorized restaurant and branch customer records, without secrets',async()=>{
  const sql=await read('../supabase/migrations/20261111161000_customer_approval_owner_directory.sql');
  expect(sql).toContain('public.erp_customer_portal_owner_directory');
  expect(sql).toContain('NOT public.erp_is_approved_owner(p_restaurant_id)');
  expect(sql).toContain('b.id=p_branch_id AND b.restaurant_id=p_restaurant_id');
  expect(sql).toContain('c.restaurant_id=p_restaurant_id AND c.is_active IS TRUE');
  expect(sql).toContain('c.branch_id=p_branch_id OR c.branch_id IS NULL');
  expect(sql).toContain('LEFT JOIN public.customer_portal_access a');
  expect(sql).toContain("a.active IS TRUE AND a.user_id IS NOT NULL THEN 'activated'");
  expect(sql).toContain("a.token_hash IS NOT NULL AND a.expires_at>now() THEN 'pending'");
  expect(sql).toContain("a.token_hash IS NOT NULL AND a.expires_at<=now() THEN 'expired'");
  expect(sql).toContain("'customers',v_items");
  expect(sql).toContain("greatest(1,least(coalesce(p_limit,100),150))");
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.erp_customer_portal_owner_directory');
  expect(sql).toContain('FROM PUBLIC,anon');
  expect(sql).toContain('TO authenticated');
  expect(sql).not.toMatch(/(?:DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+public\.customers|ALTER\s+TABLE)/i);
  expect(sql).not.toContain("'token_hash',");
  expect(sql).not.toContain("'token',");
 });
 it('issues owner-authorized customer invite only with confirmed email, not as a new ERP user',async()=>{
  const [ui,api]=await Promise.all([
   read('../src/components/owner/CustomerApprovalInvitations.jsx'),
   read('../src/lib/customerPortal.js')
  ]);
  expect(ui).toContain("customerPortalRpc('erp_customer_portal_owner_directory'");
  expect(ui).toContain("customerPortalRpc('erp_customer_portal_invite'");
  expect(ui).toContain('p_customer_id:selected.id');
  expect(ui).toContain('p_email:address,p_revoke:false');
  expect(ui).toContain('p_revoke:true');
  expect(ui).toContain("supabase.functions.invoke('customer-portal-invitation-email'");
  expect(ui).toContain('customer_id:customerId,token:inviteToken');
  expect(ui).toContain('/customer-portal#invite=');
  expect(ui).toContain('window.location.origin');
  expect(ui).toContain("selected.status==='activated'");
  expect(ui).toContain('confirm:\'Confirm revoke\'');
  expect(ui).toContain('if(!selected||!revokeConfirm||busy)return;');
  expect(ui).toContain('setEmailState(\'failed\')');
  expect(ui).toContain('navigator.clipboard.writeText(link)');
  expect(ui).toContain('provider_accepted');
  expect(api).toContain("'erp_customer_portal_owner_directory'");
  expect(ui).not.toContain("create_erp_invitation");
  expect(ui).not.toContain("erp_decide_membership");
  expect(ui).not.toContain("localStorage");
  expect(ui).not.toContain('password');
 });
 it('keeps mobile layout, direct filtering and multilingual approval terminology without nested forms',async()=>{
  const ui=await read('../src/components/owner/CustomerApprovalInvitations.jsx');
  expect(ui).toContain('const COPY = {');
  expect(ui).toContain("en: {");
  expect(ui).toContain("ar: {");
  expect(ui).toContain("fa: {");
  expect(ui).toContain('grid grid-cols-2 gap-2 sm:grid-cols-4');
  expect(ui).toContain('max-h-72 space-y-2 overflow-y-auto');
  expect(ui).toContain('min-w-0 flex-1 basis-44');
  expect(ui).not.toContain('<form');
  expect(ui).not.toContain('overflow-x-auto');
 });
});
