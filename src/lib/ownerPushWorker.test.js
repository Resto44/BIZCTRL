import { describe,it,expect,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function worker(){
 const handlers={};
 const self={addEventListener:(event,fn)=>{handlers[event]=fn;},location:{origin:'https://mybizctrl.site'},registration:{showNotification:vi.fn(()=>Promise.resolve())},clients:{matchAll:vi.fn(()=>Promise.resolve([])),openWindow:vi.fn(()=>Promise.resolve())}};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL});
 return {self,handlers};
}
describe('background worker',()=>{
 it('displays incoming push with no open application window',async()=>{
  const {self,handlers}=worker();let pending;
  handlers.push({data:{json:()=>({title:'Sale',body:'Recorded',tag:'event-1'})},waitUntil:p=>{pending=p;}});
  await pending;
  expect(self.registration.showNotification).toHaveBeenCalledWith('Sale',expect.objectContaining({body:'Recorded',tag:'event-1'}));
 });
 it('still displays malformed push instead of silently losing it',async()=>{
  const {self,handlers}=worker();let pending;
  handlers.push({data:{json:()=>{throw new Error('bad JSON');}},waitUntil:p=>{pending=p;}});await pending;
  expect(self.registration.showNotification).toHaveBeenCalledWith('BizCTRL',expect.objectContaining({data:{url:'/notifications'}}));
 });
 it('opens only the same-origin notifications route',async()=>{
  const {self,handlers}=worker();let pending;
  handlers.notificationclick({notification:{close:vi.fn(),data:{url:'https://evil.invalid'}},waitUntil:p=>{pending=p;}});await pending;
  expect(self.clients.openWindow).toHaveBeenCalledWith('https://mybizctrl.site/notifications');
 });
});

import {notificationTarget,recordRoute} from '../../supabase/functions/owner-push/navigation.ts';
const eventId='11111111-1111-4111-8111-111111111111';
async function click(handlers,data,tag) {let pending;handlers.notificationclick({notification:{close:vi.fn(),data,tag},waitUntil:p=>{pending=p;}});await pending;}
describe('record notification navigation',()=>{
 it.each([['daily_sales','/sales'],['driver_sales_entries','/sales'],['sales_invoices','/sales/invoices'],['supplier_invoices','/purchases'],['expenses','/expenses'],['product_categories','/product-management'],['debt_payments','/debt-management'],['network_accounts','/network-management'],['drivers','/driver-management']])('opens %s in its own ERP page',(entity,path)=>{
  expect(notificationTarget({entity,id:eventId})).toBe(`${path}?notification=${eventId}`);
 });
 it('preserves the record link from encrypted push through a cold-start click',async()=>{
  const {self,handlers}=worker();const target=notificationTarget({entity:'expenses',id:eventId});let pending;
  handlers.push({data:{json:()=>({title:'Expense deleted',url:target,eventId})},waitUntil:p=>{pending=p;}});await pending;
  const data=self.registration.showNotification.mock.calls[0][1].data;
  expect(data.url).toBe(target);await click(handlers,data);
  expect(self.clients.openWindow).toHaveBeenCalledWith(`https://mybizctrl.site${target}`);
 });
 it('navigates and focuses an already open app window',async()=>{
  const {self,handlers}=worker();const client={url:'https://mybizctrl.site/dashboard',navigate:vi.fn(),focus:vi.fn()};client.navigate.mockResolvedValue(client);self.clients.matchAll.mockResolvedValue([client]);
  await click(handlers,{url:'/sales?notification='+eventId});
  expect(client.navigate).toHaveBeenCalledWith('https://mybizctrl.site/sales?notification='+eventId);expect(client.focus).toHaveBeenCalledOnce();expect(self.clients.openWindow).not.toHaveBeenCalled();
 });
 it('opens another window if the existing client disappears',async()=>{
  const {self,handlers}=worker();self.clients.matchAll.mockResolvedValue([{url:'https://mybizctrl.site/sales',navigate:vi.fn().mockRejectedValue(new Error('Closed'))}]);
  await click(handlers,{url:'/purchases'});expect(self.clients.openWindow).toHaveBeenCalledWith('https://mybizctrl.site/purchases');
 });
 it.each(['https://evil.invalid/sales','javascript:alert(1)','//evil.invalid/sales','/erp-login?next=https://evil.invalid','/unknown'])('rejects unsafe or unsupported destination %s',async url=>{
  const {self,handlers}=worker();await click(handlers,{url});expect(self.clients.openWindow).toHaveBeenCalledWith('https://mybizctrl.site/notifications');
 });
 it('resolves old notification tags through authenticated event lookup and strips action parameters',async()=>{
  const {self,handlers}=worker();await click(handlers,{url:'/notifications'},eventId);expect(self.clients.openWindow).toHaveBeenLastCalledWith('https://mybizctrl.site/notifications?notification='+eventId);
  await click(handlers,{url:'/sales?create=1&notification='+eventId+'&redirect=https://evil.invalid'});expect(self.clients.openWindow).toHaveBeenLastCalledWith('https://mybizctrl.site/sales?notification='+eventId);
 });
 it('all configured destinations exist as guarded application routes',()=>{
  const app=readFileSync('src/App.jsx','utf8');
  for(const entity of ['daily_sales','sales_invoices','driver_sales_entries','expenses','product_categories','purchases','supplier_invoices','suppliers','supplier_payments','purchase_orders','products','inventory','network_accounts','driver_debts','debt_records','customer_notes','cash_movements','sponsor_transactions','salary_advances','staff_attendance','employees','branches','brand_settings','approval_policies','role_templates','erp_invitations','subscriptions','app_settings','tasks','support_tickets','scheduled_reports','active_alerts','promotions','retail_pos_transactions','orders','unknown']) expect(app).toContain(`path="${recordRoute(entity)}"`);
 });
});
