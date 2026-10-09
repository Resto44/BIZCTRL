import { describe, expect, it } from 'vitest';
import { readablePushReference, recordDetails } from '../supabase/functions/owner-push/events.ts';
import { DEFAULT_PREFERENCES, renderNotification, preferencesForLanguage, financialTemplate, validTemplate, pushCurrency } from '../supabase/functions/owner-push/preferences.ts';

const business={name:'مطاعم شمعة الريان',currency:'SAR',timezone:'Asia/Riyadh'};
const branch={name:'فرع الريان',id:'b1',branch_key:'ry'};
const metrics={date:'2026-10-09',currency:'SAR',sales:885,purchases:578,expenses:0,net_profit:307,network_sales:440,credit_sales:45,receivables:110};

describe('Owner push iPhone financial readability',()=>{
 const uuid='6bd730da-86ce-4c04-b30f-29dae40d0c0a';
 it('never displays raw UUIDs or opaque machine keys, but keeps real invoice numbers',()=>{
  expect(readablePushReference(uuid)).toBe('');
  expect(readablePushReference('a'.repeat(64))).toBe('');
  expect(readablePushReference('192.168.1.1')).toBe('');
  expect(readablePushReference('PUR-20261009-0005')).toBe('PUR-20261009-0005');
  const event={entity:'daily_cash_settlements',action:'update',reference:uuid,branch:uuid,context:{status:'draft'}};
  const result=renderNotification(preferencesForLanguage(DEFAULT_PREFERENCES,'ar'),event,business,null,metrics);
  expect(result.body).not.toContain(uuid);
  expect(result.body).not.toContain('192.168');
  expect(result.body).toContain('تسوية نقدية');
 });
 it('summarizes sales purchases network credit and outstanding customer debt on separate compact lines',()=>{
  const event={entity:'supplier_invoices',action:'update',reference:'PUR-20261009-0005',context:{amount:289,status:'auto_approved'}};
  const result=renderNotification(preferencesForLanguage(DEFAULT_PREFERENCES,'ar'),event,business,branch,metrics);
  expect(result.title).toBe(business.name);
  expect(result.body).toContain('PUR-20261009-0005');
  expect(result.body).toContain('289 SAR');
  for(const label of ['المبيعات','المشتريات','الشبكة','الآجل','ديون العملاء','ربح'])expect(result.body).toContain(label);
  expect(result.body).not.toContain('Record amount:');
  expect(result.body.split('\n').length).toBeLessThanOrEqual(5);
 });
 it('switches to loss with a positive absolute loss amount and preserves missing values as missing',()=>{
  const loss=renderNotification(preferencesForLanguage(DEFAULT_PREFERENCES,'fa'),{entity:'daily_sales',action:'update'},business,branch,{...metrics,net_profit:-55,receivables:null});
  expect(loss.body).toContain('نقصان: ۵۵');
  expect(loss.body).toContain('طلب مشتری: —');
  expect(loss.body).not.toContain('فایده: -');
 });
 it('follows device language for built-in financial presets and accepts editable credit tokens',()=>{
  for(const lang of ['en','ar','fa']){
   const prefs=preferencesForLanguage({...DEFAULT_PREFERENCES,body_template:financialTemplate('en')},lang);
   expect(prefs.body_template).toBe(financialTemplate(lang));
   expect(renderNotification(prefs,{entity:'expenses',action:'insert'},business,branch,metrics).body).toContain(lang==='ar'?'المشتريات':lang==='fa'?'خرید':'Purchases');
  }
  expect(validTemplate('Credit {credit_sales} Debt {receivables}',500)).toBe(true);
  expect(pushCurrency('$')).toBe('USD');
  expect(pushCurrency('SAR')).toBe('SAR');
 });
 it('never invents financial values when branch metrics are missing',()=>{
  const body=renderNotification(preferencesForLanguage(DEFAULT_PREFERENCES,'en'),{entity:'wallet_transactions',action:'insert'},business,branch,null).body;
  expect(body).not.toContain('Sales: 0');
  expect(body).not.toContain(uuid);
 });
 it('preserves custom notification prose without forcing a preset',()=>{
  const p={...DEFAULT_PREFERENCES,financial_summary:false,body_template:'Custom {reference} / {branch}',show_reference:true,language:'en'};
  const out=renderNotification(p,{entity:'products',action:'update',reference:uuid},business,branch);
  expect(out.body).toContain('Custom  / فرع الريان');
  expect(out.body).not.toContain(uuid);
  expect(recordDetails({reference:uuid,context:{}},'en','SAR',true)).toEqual([]);
 });
});
