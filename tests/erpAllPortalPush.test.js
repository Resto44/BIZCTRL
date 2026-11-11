import { describe,expect,it } from 'vitest';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

describe('ERP Web Push for every business role and Customer Portal',()=>{
 it('supports all six supported business/customer portals with a real opt-in and role-based device enrollment',async()=>{
  const [ui,layout,customer]=await Promise.all([
   read('../src/components/notifications/PortalPushSettings.jsx'),
   read('../src/components/layout/AppLayout.jsx'),
   read('../src/pages/CustomerPortal.jsx')
  ]);
  for(const role of ['owner','manager','employee','supplier','driver','customer'])
   expect(ui).toContain("'"+role+"'");
  expect(ui).toContain('Notification.requestPermission()');
  expect(ui).toContain("pushRequest('subscribe'");
  expect(ui).toContain("pushRequest('status'");
  expect(ui).toContain("'unsubscribe'");
  expect(ui).toContain("'test'");
  expect(ui).toContain('applicati'+'onKey(key)');
  expect(ui).toContain('userVisibleOnly:true');
  expect(ui).toContain('currentPushSubscription');
  expect(ui).toContain('Add to Home Screen');
  expect(ui).toContain('iOS 16.4+');
  expect(ui).not.toContain('new Notification(');
  expect(layout).toContain('<PortalPushSettings role={role} restaurantId={activeRestaurant.id} language={lang} />');
  expect(customer).toContain('<PortalPushSettings key={');
  expect(customer).toContain('role="customer" customerId={account.id}');
 });
 it('keeps the owner and wallet delivery integrations in place',async()=>{
  const [owner,wallet,ui]=await Promise.all([
   read('../src/components/notifications/OwnerPushSettings.jsx'),
   read('../src/components/wallet-banking/WalletPushSettings.jsx'),
   read('../src/components/notifications/PortalPushSettings.jsx')
  ]);
  expect(owner).toContain("pushRequest('subscribe'");
  expect(wallet).toContain("'wallet-push'");
  expect(ui).toContain("'erp-portal-push'");
  expect(ui).not.toContain('sub.unsubscribe()');
  expect(ui).toContain('t.privacy');
 });
 it('enforces tenant, role, branch and customer ownership at registration AND delivery',async()=>{
  const [sql,edge]=await Promise.all([
   read('../supabase/migrations/20261111114500_erp_all_portal_web_push.sql'),
   read('../supabase/functions/erp-portal-push/index.ts')
  ]);
  expect(sql).toContain('a.user_id=p_user AND a.active');
  expect(sql).toContain("m.role=p_role AND m.status='approved'");
  expect(sql).toContain('b.restaurant_id=tenant');
  expect(sql).toContain('m.linked_entity_id=NEW.supplier_id');
  expect(sql).toContain('m.linked_entity_id=NEW.employee_id');
  expect(sql).toContain('m.linked_entity_id=NEW.driver_id');
  expect(sql).toContain("c.id=NEW.customer_id");
  expect(sql).toContain('m.selected_branch_ids');
  expect(sql).toContain('public.erp_portal_push_can_access');
  expect(sql).toContain('REVOKE ALL ON public.erp_portal_push_devices FROM PUBLIC,anon,authenticated');
  expect(sql).toContain('REVOKE ALL ON public.erp_portal_push_events FROM PUBLIC,anon,authenticated');
  expect(sql).toContain('REVOKE ALL ON public.erp_portal_push_deliveries FROM PUBLIC,anon,authenticated');
  expect(edge).toContain('db.auth.getUser(token)');
  expect(edge).toContain('erp_portal_push_can_access');
  expect(edge).toContain('stillAuthorized(device,event)');
  expect(edge).toContain("eq('user_id',user.id)");
  expect(edge).toContain('PUSH_DEVICE_ACCOUNT_CONFLICT');
  expect(edge).toContain("body.role");
  expect(edge).not.toContain('db.auth.admin.updateUserById');
 });
 it('queues automatic events only for authenticated authorized recipients, with durable dispatch/retry',async()=>{
  const [sql,edge]=await Promise.all([
   read('../supabase/migrations/20261111114500_erp_all_portal_web_push.sql'),
   read('../supabase/functions/erp-portal-push/index.ts')
  ]);
  for(const table of ['notifications','orders','supplier_invoices','attendance_shift_sessions',
                        'driver_requests','debt_records','debt_payments'])
   expect(sql).toContain('ON public.'+table);
  expect(sql).toContain("SELECT cron.schedule('erp-portal-push-dispatch'");
  expect(sql).toContain('source_state');
  expect(sql).toContain('ON CONFLICT');
  expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  expect(sql).toContain('vault.decrypted_secrets');
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.erp_portal_push_claim() TO service_role");
  expect(edge).toContain("import webpush from 'npm:web-push@3.6.7'");
  expect(edge).toContain("redirect:'error'");
  expect(edge).toContain('validSubscription');
  expect(edge).toContain('Math.min(3600,30*2**job.attempts)');
  expect(edge).toContain("if([404,410].includes");
  expect(edge).toContain("['en','ar','fa']");
 });
 it('keeps private payment/attendance details off lock screens and links to safe portals',async()=>{
  const [edge,worker]=await Promise.all([
   read('../supabase/functions/erp-portal-push/index.ts'),
   read('../public/sw.js')
  ]);
  for(const path of ['/customer-portal','/manager-dashboard','/employee-dashboard','/supplier-portal',
    '/driver-dashboard','/owner-command-center'])expect(worker).toContain("'"+path+"'");
  expect(worker).toContain('target.origin !== self.location.origin');
  expect(edge).toContain("title:'BizControl'");
  expect(edge).toContain('body:words[normalizedLanguage(lang)][category]');
  expect(edge).not.toContain("body:body.message");
  expect(edge).not.toContain('amount:');
  expect(edge).not.toContain('password');
  expect(edge).toContain('delivery_confirmed:false');
 });
});
