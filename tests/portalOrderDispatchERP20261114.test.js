import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read = name => readFileSync(name,'utf8');
const migration=read('supabase/migrations/20261114141500_portal_order_dispatch_safe_intake.sql');
const page=read('src/pages/PortalOrderDispatch.jsx');
const inbox=read('src/components/portal-orders/PortalOrderInbox.jsx');
const driver=read('src/pages/DriverDashboardERP.jsx');
const kitchen=read('src/pages/restaurant/KitchenDisplayERP.jsx');
const app=read('src/App.jsx');
const nav=read('src/components/layout/ERPSidebar.jsx');

describe('Driver and multi-portal order routing ERP IQ200',()=>{
 it('owner opt-in per role defaults OFF; kitchen restricted to restaurants/cafes',()=>{
  expect(migration).toContain("allow_manager boolean not null default false");
  expect(migration).toContain("allow_kitchen boolean not null default false");
  expect(migration).toContain("'driver','employee','manager','supplier','customer','owner'");
  expect(migration).toContain("m.role<>'owner'");
  expect(migration).toContain('OWNER_ONLY_SETTING');
  expect(migration).toContain('KITCHEN_ONLY_FOR_RESTAURANT');
  expect(page).toContain("erp_portal_order_configure");
  expect(page).toContain("role_settings");
  expect(page).toContain("data-testid=\"portal-order-owner-settings\"");
  expect(page).toContain("data-testid=\"portal-order-disabled\"");
 });
 it('derives driver identity, approved membership, branch and subscription server-side',()=>{
  expect(migration).toContain("auth.uid() is null");
  expect(migration).toContain("x.user_id=auth.uid() and x.status='approved'");
  expect(migration).toContain("erp_subscription_has_erp_access(m.restaurant_id)");
  expect(migration).toContain("ACTIVE_LINKED_DRIVER_REQUIRED");
  expect(migration).toContain("d.id=m.linked_entity_id");
  expect(migration).toContain("d.branch_id=m.branch_id");
  expect(migration).toContain("portal_order_private.branch_for(m,p_branch_id)");
  expect(migration).toContain('OTHER_BRANCH_DENIED');
  expect(migration).toContain("p.branch_id=b or p.branch_id is null");
  expect(migration).toContain("q.branch_id=b");
 });
 it('does not let a driver insert into POS finance, wallet, closing or inventory tables',()=>{
  expect(migration).toContain('NON_POSTING_REQUEST_ONLY');
  expect(migration).toContain("'posted_to_sales',false");
  expect(migration).toContain("'inventory_debited',false");
  expect(migration).toContain('from restaurant_pos_private.menu');
  expect(migration).toContain('unit_price:=menu.price');
  expect(migration).toContain("coalesce(product.selling_price,product.default_price,0)");
  expect(migration).not.toMatch(/insert\s+into\s+(public\.)?(daily_sales|inventory|wallet_transactions|sales_closings)/i);
  expect(migration).not.toMatch(/insert\s+into\s+restaurant_pos_private\.orders/i);
  expect(migration).not.toMatch(/delete\s+from\s+public\./i);
  expect(migration).not.toMatch(/update\s+public\.(products|inventory|daily_sales)/i);
 });
 it('has strict idempotency and validation against bad/stale requests',()=>{
  expect(migration).toContain('id uuid primary key');
  expect(migration).toContain("request_digest:=md5(");
  expect(migration).toContain("prev.actor_id<>auth.uid()");
  expect(migration).toContain("prev.request_hash<>request_digest");
  expect(migration).toContain('REQUEST_ID_REUSED');
  expect(migration).toContain("jsonb_array_length(p_items) not between 1 and 25");
  expect(migration).toContain("if qty<1 or qty>20");
  expect(migration).toContain("if n>100");
  expect(migration).toContain("PRODUCT_NOT_IN_AUTHORIZED_BRANCH");
  expect(page).toContain('requestId.current');
  expect(page).toContain('crypto.randomUUID()');
 });
 it('only returns kitchen preparation details to employees and never prices',()=>{
  expect(migration).toContain("not (m.role='employee' and public.erp_has_any_permission(array['viewOrders']))");
  expect(migration).toContain("case when privileged then items else");
  expect(migration).toContain("x.value-'unit_price'-'line_total'");
  expect(migration).toContain("case when privileged then total_quote else null::numeric");
  expect(migration).toContain("when privileged then customer_reference else ''");
  expect(migration).toContain("status in ('queued','preparing','ready')");
  expect(inbox).toContain("line['name_'+lang]||line.name");
  expect(inbox).toContain('data-testid="portal-order-ticket"');
 });
 it('enforces manager approval and kitchen transition order on the database',()=>{
  expect(migration).toContain("p_action='approve' and o.status='awaiting_manager'");
  expect(migration).toContain("case when o.order_kind='restaurant' then 'queued' else 'accepted'");
  expect(migration).toContain("p_action='preparing' and o.status='queued'");
  expect(migration).toContain("p_action='ready' and o.status='preparing'");
  expect(migration).toContain("p_action='complete' and o.status in ('ready','accepted')");
  expect(migration).toContain("ORDER_ACTION_NOT_PERMITTED_OR_STALE");
  expect(migration).toContain('for update;');
  expect(inbox).toContain('!connected||action.isPending');
  expect(inbox).toContain('refetchInterval:7000');
 });
 it('blocks all direct table access while authorizing authenticated RPCs only',()=>{
  expect(migration).toContain("enable row level security");
  expect(migration).toContain("revoke all on all tables in schema portal_order_private from public,anon,authenticated");
  expect(migration).toContain("revoke all on schema portal_order_private from public, anon, authenticated");
  expect(migration).toContain("public.erp_portal_order_submit(uuid,uuid,uuid,text,jsonb,text,text)");
  expect(migration).toContain("public.erp_portal_order_action(uuid,text) to authenticated");
  expect(migration).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+portal_order_private/i);
 });
 it('includes driver, manager, employee, supplier, and KDS entry points with mobile RTL support',()=>{
  expect(driver).toContain('to="/portal-order-entry"');
  expect(driver).toContain('data-testid="driver-new-customer-order"');
  expect(kitchen).toContain('<PortalOrderInbox restaurantId={id} branchId={branchId} lang={lang} dark kitchenOnly/>');
  expect(app).toContain('path="/portal-order-entry"');
  expect(nav).toContain("path: '/portal-order-entry'");
  expect(page).toContain("dir={isRTL?'rtl':'ltr'}");
  expect(page).toContain("fa:{title:'ثبت سفارش مشتری'");
  expect(page).toContain("ar:{title:'إرسال طلب العميل'");
  expect(page).toContain('data-testid="portal-order-entry"');
  expect(page).toContain('p_recipient:chosenDestination');
  expect(page).toContain('p_items:lines');
  expect(page).toContain('p_restaurant_id:data.restaurant_id');
 });
});
