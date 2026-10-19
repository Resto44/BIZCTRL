import {describe,expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {walletPartiesForKind,walletAccountReference,recentWalletActivity} from '../src/lib/walletPersonalActivity.js';
import WalletUnifiedActivity from '../src/components/settlement/WalletUnifiedActivity.jsx';

const accountId='57069fe2-c0af-47d1-b1a2-8e8f86efa1cb';
const accountReference=walletAccountReference(accountId);
const businessName='مطاعم شمعة الريان';
const parties={accountReference,businessName};
const get=path=>readFileSync(path,'utf8');
describe('Canonical wallet transfer identity: person account ↔ business legal display name',()=>{
 it.each([
  ['owner_advance_to_sponsor','incoming',businessName,accountReference],
  ['sponsor_repay_owner','outgoing',accountReference,businessName],
  ['sponsor_advance_to_owner','outgoing',accountReference,businessName],
  ['owner_repay_sponsor','incoming',businessName,accountReference],
  ['custody_received','incoming',businessName,accountReference],
  ['custody_returned','outgoing',accountReference,businessName],
 ])('%s keeps audited debit/credit party identity', (kind,direction,from,to)=>{
   expect(walletPartiesForKind(kind,parties)).toMatchObject({direction,from,to});
 });
 it('does not use invented or unsecured counterparty names for incomplete accounts',()=>{
   expect(walletPartiesForKind('sponsor_repay_owner',{accountReference,businessName:''})).toBeNull();
   expect(walletPartiesForKind('owner_repay_sponsor',{accountReference:'',businessName})).toBeNull();
   expect(walletPartiesForKind('another_kind',parties)).toBeNull();
   expect(accountReference).toBe('WLT-57069FE2C0AF47D1B1A28E8F86EFA1CB');
 });
 it.each(['en','ar','fa'])('renders correct payer and payee with account ID and real business name in %s',lang=>{
   const loans=[
     {id:'ownerpay',kind:'owner_advance_to_sponsor',amount:45,currency:'SAR',effective_date:'2026-10-19',payment_method:'network',confirmed_at:null},
     {id:'personpay',kind:'sponsor_repay_owner',amount:15,currency:'SAR',effective_date:'2026-10-18',payment_method:'network',confirmed_at:'2026-10-19T11:00:00+03:00'},
   ];
   const html=renderToStaticMarkup(React.createElement(WalletUnifiedActivity,{loans,currency:'SAR',lang,account:{id:accountId,business:businessName},onStatement:()=>{},onRequests:()=>{}}));
   expect(html).toContain(accountReference);
   expect(html).toContain(businessName);
   expect(html.match(new RegExp(accountReference,'g')).toHaveLength(2);
   expect(html.match(new RegExp(businessName,'g')).toHaveLength(2);
   const locale=lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US';
   const fmt=n=>new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
   expect(html).toContain('−'+fmt(15));
   expect(html).toContain('+'+fmt(45));
   expect(html).not.toContain('Account or business identity is unavailable');
 });
 it('shows pending custody request as unposted, not received/spendable',()=>{
   const html=renderToStaticMarkup(React.createElement(WalletUnifiedActivity,{
     account:{id:accountId,business:businessName},
     currency:'SAR',lang:'en',onStatement:()=>{},onRequests:()=>{},
     custody:[{id:'pending',kind:'custody_received',amount:200,currency:'SAR',status:'pending',effective_date:'2026-10-19'}]
   }));
   expect(html).toContain('Awaiting owner approval');
   expect(html).toContain('200.00');
   expect(html).not.toContain('+200.00');
   expect(html).not.toContain('Posted');
 });
 it('does not mutate financial source rows nor assume source owner is the person',()=>{
   const row={id:'repay',kind:'sponsor_repay_owner',currency:'SAR',amount:15,effective_date:'2026-10-19'};
   const copy={...row};
   const records=recentWalletActivity({loans:[row],currency:'SAR'});
   expect(records).toHaveLength(1);
   expect(records[0].direction).toBe('outgoing');
   expect(row).toEqual(copy);
   const user=get('src/components/settlement/WalletPortalERPOverview.jsx');
   const owner=get('src/components/settlement/OwnerWalletPersonActivity.jsx');
   const center=get('src/components/settlement/PartnerTreasuryCenter.jsx');
   expect(user).toContain('account={partner}');
   expect(owner).toContain('account={{id:person.id,account_reference:walletAccountReference(person.id),business:businessName}}');
   expect(center).toContain("businessName={activeRestaurant?.name||''}");
   expect(user).not.toContain("supabase.from('wallet_transactions').insert");
 });
});
