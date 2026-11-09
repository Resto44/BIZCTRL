import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const sql=read('../supabase/migrations/20261109123500_supplier_self_profile_scoped_rpc.sql');
const portal=read('../src/pages/SupplierPortalERP.jsx');
const roles=read('../src/pages/RolePermissionCenter.jsx');

describe('Supplier ERP self profile RLS regression (2026-11-09)',()=>{
 it('binds own identity only, not a user-supplied supplier id or tenant',()=>{
   expect(sql).toContain("m.user_id=(SELECT auth.uid())");
   expect(sql).toContain("m.role='supplier'");
   expect(sql).toContain("m.status='approved'");
   expect(sql).toContain('s.id=m.linked_entity_id');
   expect(sql).toContain('s.restaurant_id=m.restaurant_id');
   expect(sql).toContain('s.branch_id IS NULL OR s.branch_id=m.branch_id');
   expect(sql).toContain('public.erp_subscription_has_erp_access(m.restaurant_id)');
   expect(sql).toContain('COALESCE(s.branch_id,m.branch_id)');
   expect(sql).not.toContain('p_supplier_id');
 });
 it('never grants supplier-wide viewSuppliers management access or expands RLS',()=>{
   expect(sql).not.toContain('CREATE POLICY');
   expect(sql).not.toContain('ALTER POLICY');
   expect(sql).not.toContain('UPDATE public.erp_memberships');
   expect(sql).not.toContain('UPDATE public.suppliers');
   expect(sql).not.toContain('DELETE FROM');
   expect(sql).toContain('REVOKE ALL ON FUNCTION public.erp_supplier_self_profile() FROM PUBLIC, anon;');
   expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.erp_supplier_self_profile() TO authenticated;');
   expect(sql).toContain("SET search_path = ''");
 });
 it('portal calls only dedicated scoped RPC for identity rather than management suppliers table',()=>{
   const section=portal.slice(portal.indexOf('// ── Own linked Supplier identity'),portal.indexOf('// ── Purchase orders for this supplier'));
   expect(section).toContain("supabase.rpc('erp_supplier_self_profile')");
   expect(section).not.toContain("supabase.from('suppliers')");
   expect(section).not.toContain(".eq('email'");
   expect(section).toContain("user?.role==='supplier'");
   expect(portal).toContain('supplierProfile.id');
   expect(portal).toContain(".eq('supplier_id', supplierProfile.id)");
   expect(portal).toContain(".eq('restaurant_id', user.restaurant_id)");
   expect(portal).toContain(".eq('branch_id', user.branch_id)");
 });
 it('missing profile provides actionable branch advice instead of falsely implying account deleted',()=>{
   expect(portal).toContain('Supplier access needs review');
   expect(portal).toContain('No invoices were changed.');
   expect(portal).toContain('Retry supplier profile');
 });
});
describe('Role & Permissions small mobile layout',()=>{
 it('filters display in a mobile two-column grid without vertically stacking status inputs',()=>{
   expect(roles).toContain('data-testid="role-user-filters"');
   expect(roles).toContain('grid-cols-2');
   expect(roles).toContain('col-span-2 min-w-0 sm:col-span-1');
   expect(roles).toContain('h-10 w-full min-w-0 text-sm');
 });
 it('keeps each users action row separate from identity, with usable touch targets',()=>{
   expect(roles).toContain('data-testid="role-user-card"');
   expect(roles).toContain('sm:flex-row sm:items-start');
   expect(roles).toContain('data-testid="role-user-actions"');
   expect(roles).toContain('w-full min-w-0 flex-wrap');
   expect(roles).toContain('h-10 w-10 shrink-0');
   expect(roles).toContain('min-w-0 break-all');
 });
 it('mobile tab navigation fits evenly and all server-owned role changes remain unchanged',()=>{
   expect(roles).toContain('grid-cols-3 gap-1');
   expect(roles).toContain('grid-cols-2 text-xs sm:w-auto');
   expect(roles).toContain("supabase.rpc('update_user_role_and_permissions'");
   expect(roles).toContain('onRoleChange(membership.id, v)');
   expect(roles).toContain('onTransfer(membership)');
   expect(roles).toContain('onRemove(membership)');
 });
});
