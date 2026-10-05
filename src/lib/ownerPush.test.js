import { describe, it, expect } from 'vitest';
import { validSubscription,eventMessage } from '../../supabase/functions/owner-push/policy.ts';
const sub=(endpoint)=>({endpoint,keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}});
describe('owner push delivery boundaries',()=>{
 it('accepts the browser push providers',()=>{
  for(const url of ['https://fcm.googleapis.com/fcm/send/abc','https://web.push.apple.com/Q/abc','https://updates.push.services.mozilla.com/wpush/v2/abc'])expect(validSubscription(sub(url))).toBe(true);
 });
 it('rejects private hosts, HTTP, credentials, ports and lookalike domains',()=>{
  for(const url of ['https://127.0.0.1/a','http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.com/a','https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','https://evilpush.apple.com/a'])expect(validSubscription(sub(url))).toBe(false);
 });
 it('rejects missing or malformed encryption keys',()=>{
  expect(validSubscription({endpoint:'https://fcm.googleapis.com/a'})).toBe(false);
  expect(validSubscription({...sub('https://fcm.googleapis.com/a'),keys:{p256dh:'x',auth:'y'}})).toBe(false);
 });
 it('bounds notification text and includes the operation and branch',()=>{
  const text=eventMessage({action:'delete',entity:'daily_sales',reference:'Receipt 42',branch:'Main'});
  expect(text).toContain('Deleted');expect(text).toContain('daily sales');expect(text).toContain('Main');
  expect(eventMessage({action:'insert',entity:'products',reference:'x'.repeat(500)}).length).toBeLessThanOrEqual(350);
 });
});

import { DEFAULT_PREFERENCES, renderNotification, shouldDeliver, moduleFor, validTemplate, resolveBranch } from '../../supabase/functions/owner-push/preferences.ts';
describe('ERP push customization',()=>{
 const event={action:'insert',entity:'sales_invoices',reference:'INV-77',branch:'north',created_at:'2026-10-01T10:00:00Z'};
 const branch={id:'branch-1',name:'North',branch_key:'north'};
 it('preserves delivery defaults without a saved preference',()=>{
  expect(shouldDeliver(null,event,branch)).toBe(true);
 });
 it('honors pause, operations, sections and branch restrictions independently',()=>{
  for(const p of [{enabled:false},{actions:['delete']},{modules:['inventory']},{branch_ids:['branch-2']}])expect(shouldDeliver({...DEFAULT_PREFERENCES,...p},event,branch)).toBe(false);
  expect(shouldDeliver({...DEFAULT_PREFERENCES,branch_ids:['branch-1']},event,branch)).toBe(true);
  expect(shouldDeliver({...DEFAULT_PREFERENCES,branch_ids:['branch-1']},event,null)).toBe(false);
  expect(shouldDeliver({...DEFAULT_PREFERENCES,actions:[]},event,branch)).toBe(false);
 });
 it('resolves legacy branch keys but does not guess ambiguous names',()=>{
  expect(resolveBranch(event,[branch])).toEqual(branch);
  expect(resolveBranch({branch:'branch-1'},[branch])).toEqual(branch);
  expect(resolveBranch({branch:'North'},[branch,{...branch,id:'branch-2',branch_key:'other'}])).toBeUndefined();
 });
 it('renders custom text literally, localizes actions and hides the reference when requested',()=>{
  const p={...DEFAULT_PREFERENCES,language:'fa',financial_summary:false,title_template:'{business} / {branch}',body_template:'{action}: {reference}',show_reference:false};
  const text=renderNotification(p,event,{name:'My {reference}'},branch);
  expect(text.title).toBe('My {reference} / North');
  expect(text.body).toBe('ثبت شد: ');
  expect(renderNotification({...p,show_reference:true},event,{},branch).body).toContain('INV-77');
 });
 it('rejects unsupported tokens and blank templates and bounds rendered output',()=>{
  expect(validTemplate('{business} {time}',100)).toBe(true);
  for(const value of ['','   ','{password}','{business','x'.repeat(101)])expect(validTemplate(value,100)).toBe(false);
  expect(renderNotification(DEFAULT_PREFERENCES,event,{name:'x'.repeat(300)},branch).title.length).toBe(100);
 });
 it('categorizes the main ERP record types including supermarket POS',()=>{
  expect(moduleFor('retail_pos_transactions')).toBe('sales');
  expect(moduleFor('supplier_payments')).toBe('purchases');
  expect(moduleFor('inventory_batches')).toBe('inventory');
  expect(moduleFor('customer_collections')).toBe('finance');
  expect(moduleFor('staff_attendance')).toBe('people');
  expect(moduleFor('workspace_settings')).toBe('other');
 });
});

import { financialTemplate, needsFinancialSummary } from '../../supabase/functions/owner-push/preferences.ts';
describe('financial push layout',()=>{
 const financial={date:'2026-10-05',currency:'SAR',network_sales:2000,pos_sales:3500,source_sales:1500,sales:5000,purchases:2000,expenses:750,net_profit:2250};
 it('renders business, branch and daily amounts with a localized editable preset',()=>{
  const p={...DEFAULT_PREFERENCES,title_template:'{business}',body_template:financialTemplate('en')};
  const result=renderNotification(p,{}, {name:'Market'}, {name:'North'},financial);
  expect(result.title).toBe('Market');
  expect(result.body).toBe('North · 2026-10-05\nSales: 5,000.00 SAR\nPurchases: 2,000.00 SAR\nExpenses: 750.00 SAR\nNetwork sales: 2,000.00 SAR\nPOS sales: 3,500.00 SAR\nSales Sources: 1,500.00 SAR\nNet profit: 2,250.00 SAR');
 });
 it('appends summary to existing custom templates without duplicating financial templates',()=>{
  const result=renderNotification({...DEFAULT_PREFERENCES,body_template:'Record saved'}, {},{}, {name:'North'},financial);
  expect(result.body).toContain('Record saved\nNorth');
  expect(result.body.match(/Net profit/g)).toHaveLength(1);
 });
 it('preserves losses and never substitutes a fake zero for unavailable totals',()=>{
  const p={...DEFAULT_PREFERENCES,body_template:'{net_profit}'};
  expect(renderNotification(p,{}, {},{}, {...financial,net_profit:-150}).body).toBe('-150.00 SAR');
  expect(renderNotification(p,{}, {},{}, null).body).toBe('—');
 });
 it('supports financial tokens, disabled summary and explicit custom financial fields',()=>{
  expect(validTemplate('{sales} {expenses} {net_profit} {purchases} {date} {currency} {network_sales} {pos_sales} {source_sales}',500)).toBe(true);
  const p={...DEFAULT_PREFERENCES,financial_summary:false,body_template:'Record saved'};
  expect(needsFinancialSummary(p)).toBe(false);
  expect(needsFinancialSummary({...p,body_template:'{sales}'})).toBe(true);
 });
});

it('loads totals for channel-only custom templates and renders zero distinctly from unavailable',()=>{
 const p={...DEFAULT_PREFERENCES,financial_summary:false,body_template:'{network_sales} / {pos_sales} / {source_sales}'};
 expect(needsFinancialSummary(p)).toBe(true);
 expect(renderNotification(p,{}, {},null,{currency:'SAR',network_sales:0,pos_sales:150,source_sales:-5}).body).toBe('0.00 SAR / 150.00 SAR / -5.00 SAR');
 expect(renderNotification(p,{}, {},null,null).body).toBe('— / — / —');
});

import { preferencesForLanguage, appPushLanguage } from '../../supabase/functions/owner-push/preferences.ts';
describe('push follows each device app language',()=>{
 it.each(['en','ar','fa'])('translates a saved English financial preset into %s',language=>{
  const p=preferencesForLanguage({...DEFAULT_PREFERENCES,title_template:'مطاعم شمعة الريان'},language);
  expect(p.body_template).toBe(financialTemplate(language));
  expect(p.title_template).toBe('مطاعم شمعة الريان');
  expect(p.language).toBe(language);
 });
 it('switches an Arabic template to Persian and back without changing placeholders or custom names',()=>{
  const p=preferencesForLanguage({...DEFAULT_PREFERENCES,body_template:financialTemplate('ar')},'fa');
  expect(p.body_template).toBe(financialTemplate('fa'));
  expect(preferencesForLanguage(p,'en').body_template).toBe(financialTemplate('en'));
  expect(preferencesForLanguage({...p,body_template:'My custom message: {sales}'},'ar').body_template).toBe('My custom message: {sales}');
 });
 it('localizes actions and dates while different devices keep their own language',()=>{
  const saved={...DEFAULT_PREFERENCES,financial_summary:false,body_template:'{action}'};
  expect(renderNotification(preferencesForLanguage(saved,'fa'),{action:'insert'},{},null).body).toBe('ثبت شد');
  expect(renderNotification(preferencesForLanguage(saved,'ar'),{action:'insert'},{},null).body).toBe('تمت الإضافة');
  expect(saved.language).toBe('en');
  expect(appPushLanguage('invalid')).toBe('en');
 });
});
