import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFERENCES, renderNotification, preferencesForLanguage, needsFinancialSummary, validTemplate } from '../supabase/functions/owner-push/preferences.ts';
import { buildDriverSalesAnalytics, isFinalizedDriverSale } from '../src/lib/driverAnalytics';
const business={name:'Business',currency:'SAR'},branch={name:'North'};
const render=(event,language='en',extra={})=>renderNotification(preferencesForLanguage({...DEFAULT_PREFERENCES,...extra},language),event,business,branch,{date:'2026-10-07',currency:'SAR',sales:865,delivery_sales:610,delivery_cash:365,delivery_network:245});
describe('record-specific push',()=>{
 it.each([
  ['en','Expense','Deleted'],['ar','مصروف','تم الحذف'],['fa','مصرف','حذف شد'],
 ])('names deleted expense in %s from retained event snapshot',(language,entity,action)=>{
  const result=render({entity:'expenses',action:'delete',reference:'Rent',context:{amount:650}},language);
  expect(result.body.startsWith(`${entity} · ${action}`)).toBe(true);
  expect(result.body).toContain('Rent');
  expect(result.body).toContain(new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(650));
 });
 it('distinguishes purchase, sale, product and category operations',()=>{
  for(const [entity,label] of [['supplier_invoices','Purchase invoice'],['sales_invoices','Sales invoice'],['products','Product'],['product_categories','Product category']]) {
   for(const [action,verb] of [['insert','Created'],['update','Updated'],['delete','Deleted']]) expect(render({entity,action}).body.split('\n')[0]).toBe(`${label} · ${verb}`);
  }
 });
 it('does not attach sales totals to non-financial events or lose custom prose',()=>{
  const event={entity:'products',action:'delete'};
  expect(needsFinancialSummary(DEFAULT_PREFERENCES,event)).toBe(false);
  expect(render(event).body).not.toContain('Sales:');
  expect(render(event,'en',{body_template:'My note\nSales: {sales}'}).body).toContain('My note');
 });
 it('shows both collected payment amounts and delivery sales without relabeling as cash',()=>{
  const body=render({entity:'driver_sales_entries',action:'insert',reference:'Driver One',context:{amount:300,cash:100,network:200,status:'draft'}}).body;
  expect(body).toContain('Delivery sale · Created');expect(body).toContain('Cash collected: 100.00 SAR');expect(body).toContain('Network collected: 200.00 SAR');
  expect(body).toContain('Status: Draft');expect(body).toContain('Delivery sales: 610.00 SAR');
 });
 it('keeps actual action first even with a long financial-only template and hides private reference',()=>{
  const result=render({entity:'expenses',action:'delete',reference:'Private'},'en',{body_template:'x'.repeat(499),show_reference:false});
  expect(result.body.startsWith('Expense · Deleted')).toBe(true);
  expect(result.body).not.toContain('Private');expect(result.body.length).toBeLessThanOrEqual(1000);
 });
 it('accepts delivery tokens and keeps missing values distinct from zero',()=>{
  expect(validTemplate('{delivery_sales} {delivery_cash} {delivery_network}',500)).toBe(true);
  const settings={...DEFAULT_PREFERENCES,financial_summary:false,body_template:'{delivery_sales} / {delivery_cash}'};
  expect(renderNotification(settings,{},business,branch,{delivery_sales:null,delivery_cash:0}).body).toBe('— / 0.00 SAR');
 });
});
describe('delivery accounting',()=>{
 it('counts cash plus network once, includes locked closings and excludes draft or cancelled rows',()=>{
  const base={driver_id:'driver',branch_id:'branch',date:'2026-10-07',status:'finalized',closing_state:'finalized',cash_amount:365,network_amount:245,total_amount:610};
  const result=buildDriverSalesAnalytics({drivers:[{id:'driver',full_name:'Driver',branch_id:'branch'}],branchId:'branch',driverEntries:[base,{...base,status:'draft',finalized_at:'2026-10-07'}, {...base,closing_state:'cancelled'}, {...base,branch_id:'other'}, {...base,closing_state:'locked',cash_amount:10,network_amount:20,total_amount:30}]});
  expect(result.totals).toMatchObject({orders:2,cash:375,network:265,revenue:640});
  expect(isFinalizedDriverSale({...base,status:'cancelled'})).toBe(false);
 });
});
