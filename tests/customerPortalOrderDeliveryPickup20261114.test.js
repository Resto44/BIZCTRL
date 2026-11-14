import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  customerOrderCart,customerOrderCartTotal,customerOrderDeliveryValid,customerOrderValidPhone,
} from '../src/lib/customerOrderCheckout.js';
import {PORTAL_ORDER_ALL,portalOrderCategories,selectedPortalCategory,filterPortalOrderProducts} from '../src/lib/portalOrderCategories.js';

const sql=readFileSync('supabase/migrations/20261114171000_customer_portal_delivery_pickup_intake.sql','utf8');
const orderUI=readFileSync('src/components/customer/CustomerOrderEntry.jsx','utf8');
const portal=readFileSync('src/pages/CustomerPortal.jsx','utf8');
const inbox=readFileSync('src/components/portal-orders/PortalOrderInbox.jsx','utf8');
const catalog=[
 {id:'rice',name:'Rice Bukhari',name_ar:'الأرز البخاري',name_fa:'برنج بخاری',price:6,category_key:'id:rice',category_ar:'أرز'},
 {id:'chicken',name:'Chicken',name_ar:'دجاج',name_fa:'مرغ',price:40.5,category_key:'id:meat',category_fa:'گوشت'},
];

describe('Customer Portal: verified customer pickup and delivery ERP workflow',()=>{
 it('keeps selected products across categories and computes cents without additional delivery fee',()=>{
  const cart={rice:2,chicken:1};
  const selected=customerOrderCart(catalog,cart);
  expect(selected).toHaveLength(2);
  expect(selected.map(x=>x.id)).toEqual(['rice','chicken']);
  expect(customerOrderCartTotal(selected)).toBe(52.5);
  const categories=portalOrderCategories(catalog,'fa');
  expect(selectedPortalCategory(categories,'')).toBe('id:rice');
  expect(filterPortalOrderProducts(catalog,'id:rice','بخاری')).toHaveLength(1);
  expect(filterPortalOrderProducts(catalog,'id:meat')).toHaveLength(1);
  expect(filterPortalOrderProducts(catalog,PORTAL_ORDER_ALL)).toHaveLength(2);
  expect(customerOrderCart(catalog,{rice:0,chicken:21,missing:5})).toEqual([]);
 });
 it('requires delivery address and a phone but not for collection from the restaurant',()=>{
  expect(customerOrderDeliveryValid('pickup','','')).toBe(true);
  expect(customerOrderDeliveryValid('delivery','','+966501234567')).toBe(false);
  expect(customerOrderDeliveryValid('delivery','حي الريان','+966501234567')).toBe(false);
  expect(customerOrderDeliveryValid('delivery','حي الريان شارع الملك فهد','bad phone')).toBe(false);
  expect(customerOrderDeliveryValid('delivery','حي الريان شارع الملك فهد','+966501234567')).toBe(true);
  expect(customerOrderValidPhone('0501234567')).toBe(true);
  expect(customerOrderValidPhone('')).toBe(false);
  expect(customerOrderDeliveryValid('unknown','عنوان كامل','0501234567')).toBe(false);
 });
 it('uses independent customer invitation authentication, never assumes ERP staff membership',()=>{
  expect(sql).toContain('a.user_id=auth.uid() and a.active is true');
  expect(sql).toContain('u.email_confirmed_at is not null');
  expect(sql).toContain('customer.is_active is true');
  expect(sql).toContain('CUSTOMER_ORDER_ACCOUNT_FORBIDDEN');
  expect(sql).toContain("customer_portal_private.order_customer(p_customer_id)");
  expect(sql).toContain("customer_portal_private.order_branch(c,p_branch_id)");
  expect(sql).toContain("where restaurant_id=c.restaurant_id and role='customer'");
  expect(sql).not.toContain('join public.erp_memberships');
  expect(sql).toContain('CUSTOMER_ORDER_BRANCH_FORBIDDEN');
  expect(sql).toContain("branch_id=b or branch_id is null");
  expect(sql).toContain("q.branch_id=b and q.active is true");
  expect(sql).toContain("public.erp_customer_portal_order_submit");
 });
 it('server validates fulfillment, delivery contact and owner-configured manager route',()=>{
  expect(sql).toContain("p_fulfillment not in ('delivery','pickup')");
  expect(sql).toContain("address_text is null or char_length(address_text) not between 10 and 400");
  expect(sql).toContain('phone_text is null or phone_text !~');
  expect(sql).toContain("if p_fulfillment='pickup' then address_text:=null;phone_text:=null");
  expect(sql).toContain('DELIVERY_NEEDS_MANAGER_ROUTE');
  expect(sql).toContain("recipient:=case when coalesce(routes.allow_manager,false) then 'manager' else 'kitchen' end");
  expect(sql).toContain('CUSTOMER_ORDER_NOT_ENABLED');
  expect(sql).toContain('CUSTOMER_ORDER_RATE_LIMIT');
  expect(sql).toContain('CUSTOMER_ORDER_DUPLICATE_LINE');
 });
 it('enforces retry idempotency and authoritative server-side catalog prices',()=>{
  expect(sql).toContain('id=p_request_id');
  expect(sql).toContain('CUSTOMER_ORDER_ID_REUSED');
  expect(sql).toContain('on conflict(id) do nothing returning id into new_id');
  expect(sql).toContain('price:=menu.price');
  expect(sql).toContain('price:=greatest(0,coalesce(product.selling_price,product.default_price,0))');
  expect(sql).toContain('units>100');
  expect(sql).toContain('qty<1 or qty>20');
  expect(sql).toContain('CUSTOMER_ORDER_PRODUCT_FORBIDDEN');
  expect(sql).toContain("'posted_to_sales',false");
  expect(sql).toContain("'inventory_debited',false");
  expect(sql).toContain("'delivery_fee_quote',null");
  expect(sql).toContain("'payment_status','NOT_PAID'");
  expect(sql).not.toMatch(/insert\s+into\s+(public\.)?(orders|sales|inventory|daily_sales)/i);
 });
 it('does not leak customer phone/address to kitchen or customer outside their own account',()=>{
  expect(sql).toContain('case when privileged then delivery_address else null::text');
  expect(sql).toContain('case when privileged then contact_phone else null::text');
  expect(sql).toContain("case when privileged or actor_role <> 'customer' then notes else ''");
  expect(sql).toContain('customer_id=c.id and actor_id=auth.uid()');
  expect(sql).toContain('and restaurant_id=c.restaurant_id and branch_id=b');
  expect(sql).toContain('revoke all on function public.erp_customer_portal_order_context');
  expect(sql).toContain('to authenticated');
  expect(inbox).toContain('o.fulfillment_mode');
  expect(inbox).toContain('manager&&');
  expect(inbox).toContain('o.delivery_address');
  expect(inbox).toContain('o.contact_phone');
 });
 it('embeds checkout inside verified Customer Portal, not the staff ordering page',()=>{
  expect(portal).toContain("lazy(() => import('@/components/customer/CustomerOrderEntry'))");
  expect(portal).toContain("<CustomerOrderEntry key={'customer-order-'+account.id} account={account} lang={lang}/>");
  expect(orderUI).toContain("['pickup','delivery']");
  expect(orderUI).toContain("data-testid={'customer-order-'+mode}");
  expect(orderUI).toContain('data-testid="customer-order-category"');
  expect(orderUI).toContain('data-testid="customer-order-cart"');
  expect(orderUI).toContain('data-testid="customer-order-history"');
  expect(orderUI).toContain('p_customer_id:account.id');
  expect(orderUI).toContain('p_fulfillment:fulfillment');
  expect(orderUI).toContain("p_items:selected.map(x=>({id:x.id,quantity:x.quantity}))");
  expect(orderUI).not.toContain('markAsPaid');
 });
});
