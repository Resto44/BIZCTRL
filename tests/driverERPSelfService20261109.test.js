import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const role=read('../src/lib/RoleContext.jsx');
const app=read('../src/App.jsx');
const login=read('../src/pages/ERPLogin.jsx');
const invite=read('../src/components/owner/OwnerStaffProvisioning.jsx');
const ui=read('../src/pages/DriverDashboardERP.jsx');
const mgr=read('../src/components/drivers/DriverDailyReportsReview.jsx');
const bottom=read('../src/components/layout/BottomNav.jsx');
const tour=read('../src/lib/newUserWelcomeTour.js');
const management=read('../src/pages/DriverManagement.jsx');
const schema=read('../supabase/migrations/20261109150000_driver_role_and_invitation_restore.sql');
const reports=read('../supabase/migrations/20261109150500_driver_daily_nonposting_reports.sql');
const snapshot=read('../supabase/migrations/20261109151000_driver_canonical_personal_snapshot.sql');
describe('Driver ERP account and secure login',()=>{
 it('owner invitation is a driver role that leads to a real strictly guarded dashboard',()=>{
  expect(invite).toContain("value: 'driver'");
  expect(role).toContain("DRIVER:          'driver'");
  expect(role).toContain("[ROLES.DRIVER]:          '/driver-dashboard'");
  expect(login).toContain('role: ROLES.DRIVER');
  expect(app).toContain('allowedRoles={[\'driver\']}');
  expect(app).toContain('<DriverDashboardERP />');
  expect(schema).toContain("CHECK (role IN ('manager','employee','supplier','driver'))");
  expect(schema).toContain("CHECK (role IN ('owner','manager','employee','supplier','driver'))");
 });
 it('does not show owner dashboard navigation to Driver, and onboarding stays in driver scope',()=>{
  expect(bottom).toContain("if (role === ROLES.DRIVER) return { visibleNav:");
  expect(bottom).toContain("path: '/driver-dashboard', icon: Truck");
  expect(tour).toContain("driver ? '/driver-dashboard'");
  expect(tour).toContain("driver ? [{ key: 'driverPortal', path: '/driver-dashboard', role: 'driver' }]");
 });
 it('driver has minimal role defaults and must be linked to own branch before login',()=>{
  expect(schema).toContain('when \'driver\' then');
  expect(schema).toContain("d.branch_id = invitation.branch_id");
  expect(schema).toContain('Driver identity belongs to another branch');
  expect(schema).toContain("when 'driver' then '/driver-dashboard'");
  expect(schema).toContain('linked_entity_id');
  expect(schema).not.toContain('UPDATE public.driver_sales_entries');
  expect(schema).not.toContain('DELETE FROM public.drivers');
 });
 it('financial totals never add reports or delivery orders to canonical finalized sales',()=>{
  expect(snapshot).toContain('JOIN public.daily_sales s ON s.id=e.closing_id');
  expect(snapshot).toContain("e.status='finalized'");
  expect(snapshot).toContain("s.closing_state IN ('finalized','locked')");
  expect(snapshot).toContain('e.driver_id=d.id');
  expect(snapshot).toContain('e.restaurant_id=m.restaurant_id');
  expect(snapshot).toContain('e.branch_id=m.branch_id');
  expect(snapshot).toContain("'sales',v_cash+v_network");
  expect(snapshot).toContain("'daily_trend',v_trend");
  expect(snapshot).toContain("'daily_reports',v_reports");
  expect(snapshot).not.toContain('INSERT INTO public.daily_sales');
 });
 it('snapshot hides customer PII and is own-user scoped without client-provided IDs',()=>{
  expect(snapshot).toContain('auth.uid()');
  expect(snapshot).toContain("role='driver'");
  expect(snapshot).toContain('m.linked_entity_id');
  expect(snapshot).toContain('REVOKE ALL ON FUNCTION public.erp_driver_self_snapshot(date,date) FROM PUBLIC,anon');
  expect(snapshot).not.toContain('customer_phone');
  expect(snapshot).not.toContain('customer_address');
  expect(snapshot).not.toContain('p_driver_id');
 });
 it('driver declarations cannot modify cash box, sales closing, source or wallet',()=>{
  expect(reports).toContain('CREATE TABLE IF NOT EXISTS public.driver_daily_reports');
  expect(reports).toContain("status text NOT NULL DEFAULT 'pending'");
  expect(reports).toContain('driver_daily_reports_once_per_day');
  expect(reports).toContain("role='driver'");
  expect(reports).toContain('id=m.linked_entity_id AND restaurant_id=m.restaurant_id');
  expect(reports).toContain('REVIEWED_OR_MATCHED_REPORT_CANNOT_BE_EDITED');
  expect(reports).toContain("round(v_cash,2)<>report.cash_amount");
  expect(reports).toContain("round(v_network,2)<>report.network_amount");
  expect(reports).toContain("s.closing_state IN ('finalized','locked')");
  expect(reports).not.toContain('UPDATE public.daily_sales');
  expect(reports).not.toContain('INSERT INTO public.driver_sales_entries');
  expect(reports).not.toContain('UPDATE public.wallet');
  expect(reports).not.toContain('INSERT INTO public.driver_sales_entries');
 });
 it('driver cannot use supplier or manager reporting APIs to see other branches',()=>{
  expect(reports).toContain("driver_id=public.erp_current_linked_entity_id()");
  expect(reports).toContain('public.erp_can_access_scope_text(restaurant_id::text,branch_id::text)');
  expect(reports).toContain('m.branch_id IS NULL');
  expect(reports).toContain("role IN ('manager','owner')");
  expect(reports).toContain("(role='owner' OR branch_id=report.branch_id)");
  expect(reports).toContain("role IN ('manager','owner')");
  expect(reports).toContain("report.status='matched'");
 });
});
describe('Driver portal responsive functionality',()=>{
 it('has mobile four-tab navigation with 6 period filters and a canonical verified sale chart',()=>{
  expect(ui).toContain('data-testid="driver-erp-portal"');
  expect(ui).toContain('data-testid="driver-tabs"');
  expect(ui).toContain('grid grid-cols-4');
  expect(ui).toContain('data-testid="driver-period-filter"');
  expect(ui).toContain("'today','week','month','three','six','year'");
  expect(ui).toContain('data-testid="driver-trend-chart"');
  expect(ui).toContain('data-testid="driver-finalized-sales"');
  expect(ui).toContain('data-testid="driver-assigned-deliveries"');
  expect(ui).toContain("lang='en'");
  expect(ui).toContain("dir={isRTL?'rtl':'ltr'}");
  expect(ui).toContain('پورتال راننده');
  expect(ui).toContain('بوابة السائق');
 });
 it('posts declaration via nonposting server RPC and refreshes snapshot for driver only',()=>{
  expect(ui).toContain("supabase.rpc('erp_driver_self_snapshot'");
  expect(ui).toContain("supabase.rpc('erp_driver_save_daily_report'");
  expect(ui).toContain("enabled:Boolean(user?.id&&user?.role==='driver')");
  expect(ui).toContain('refetchInterval:15000');
  expect(ui).toContain('save.isPending');
  expect(ui).toContain('amountValid(cash)');
  expect(ui).toContain('Number(cash)+Number(network)<=0');
 });
 it('manager review requires matching existing final closing, role checks and no additional sales posting',()=>{
  expect(management).toContain('<DriverDailyReportsReview');
  expect(mgr).toContain("supabase.rpc('erp_driver_review_daily_report'");
  expect(mgr).toContain("action:'matched'");
  expect(mgr).toContain("action:'rejected'");
  expect(mgr).toContain("action:'reviewed'");
  expect(mgr).toContain("from('driver_daily_reports')");
  expect(mgr).not.toContain("from('daily_sales').insert");
 });
});
