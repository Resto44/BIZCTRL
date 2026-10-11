import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {formatTreasuryCurrency,normalizeTreasuryCurrency,resolveTreasuryCurrency,treasuryCurrencyWarning} from '../src/lib/treasuryCurrency.js';
import {reconcileSalesToTreasury,reconcileExplicitSponsorFlows} from '../src/lib/treasuryReconciliation.js';
const file=path=>readFile(new URL(path,import.meta.url),'utf8');
describe('Treasury follows BizCTRL selected currency without relabeling genuine FX',()=>{
 it('legacy dollar and Saudi-symbol records adopt SAR display preference (no data mutation)',()=>{
  expect(normalizeTreasuryCurrency('$','SAR')).toBe('SAR');
  expect(normalizeTreasuryCurrency('ر.س','SAR')).toBe('SAR');
  expect(normalizeTreasuryCurrency('SR','SAR')).toBe('SAR');
  expect(resolveTreasuryCurrency({appCurrency:'SAR',restaurantCurrency:'$'}).code).toBe('SAR');
  expect(resolveTreasuryCurrency({appCurrency:'SAR',restaurantCurrency:'$',accountCurrency:'$'}).code).toBe('SAR');
  for(const lang of ['en','ar','fa']){
    const rendered=formatTreasuryCurrency(1234.5,{
      appCurrency:'SAR',restaurantCurrency:'$',accountCurrency:'$',lang,
    });
    expect(rendered).toContain('SAR');
    expect(rendered).not.toContain('$');
  }
 });
 it('finance base and actual ISO account currency override display without dishonest conversion',()=>{
  expect(resolveTreasuryCurrency({appCurrency:'SAR',restaurantCurrency:'$',financeCurrency:'USD'}).code).toBe('USD');
  expect(resolveTreasuryCurrency({appCurrency:'SAR',restaurantCurrency:'$',financeCurrency:'SAR',accountCurrency:'USD'}).code).toBe('USD');
  expect(formatTreasuryCurrency(1234.5,{
    appCurrency:'SAR',restaurantCurrency:'$',financeCurrency:'SAR',accountCurrency:'USD',
  })).toContain('USD');
  expect(treasuryCurrencyWarning({
    appCurrency:'SAR',financeCurrency:'USD',lang:'fa',
  })).toContain('USD');
 });
 it('uses app currency when legacy stored restaurant unit is ambiguous in Arabic Persian English',()=>{
  for(const code of ['SAR','AFN','EUR']){
    expect(resolveTreasuryCurrency({appCurrency:code,restaurantCurrency:'$'}).code).toBe(code);
  }
 });
 it('wires selected display preference to overview, account tiles, chart labels, and funding panels',async()=>{
  const page=await file('../src/pages/Treasury.jsx');
  const overview=await file('../src/components/treasury/TreasuryERPOverview.jsx');
  expect(page).toContain('const displayCurrency=normalizeTreasuryCurrency(currency)');
  expect(page).toContain('const ledgerCurrency=resolveTreasuryCurrency(');
  expect(page).toContain('formatTreasuryCurrency(v,moneyOptions)');
  expect(page).not.toContain('const ledgerCurrency=activeRestaurant?.currency||currency');
  expect(page).not.toContain('currency={activeRestaurant?.currency||currency}');
  expect(overview).toContain('formatTreasuryCurrency(value,{');
  expect(overview).not.toContain('const unit=account.currency||currency');
 });
});
describe('Canonical sales Closing vs Treasury reconciliation',()=>{
 const sales=[{id:'c1',date:'2026-10-10',closing_state:'finalized',
  restaurant_cash:100,restaurant_network:400,branch:'rayyan'}];
 it('matches genuine legacy and v2 reference postings using real columns',()=>{
   const tx=[
     {id:'t1',transaction_date:'2026-10-10',transaction_type:'cash_sales_branch',
       reference_id:'c1',auto_generated:true,direction:'in',amount:100,branch:'rayyan'},
     {id:'t2',transaction_date:'2026-10-10',transaction_type:'network_sales_auto_v2',
       reference_id:'c1',auto_generated:true,direction:'in',amount:400,branch:'rayyan'},
   ];
   const rows=reconcileSalesToTreasury({sales,transactions:tx,from:'2026-10-01',to:'2026-10-31'});
   expect(rows).toHaveLength(2);
   expect(rows.every(row=>row.status==='matched')).toBe(true);
 });
 it('duplicate postings are discrepancies even when each is half the expected amount',()=>{
   const tx=[{id:'a',transaction_date:'2026-10-10',transaction_type:'network_sales_auto',
       reference_id:'c1',direction:'in',amount:200,branch:'rayyan'},
     {id:'b',transaction_date:'2026-10-10',transaction_type:'network_sales_auto_v2',
       reference_id:'c1',direction:'in',amount:200,branch:'rayyan'}];
   const rows=reconcileSalesToTreasury({sales,transactions:tx});
   expect(rows.find(r=>r.type==='Network sales ledger')).toMatchObject({
     status:'discrepancy',postingCount:2,deposited:400,
   });
 });
 it('draft sales and unmatched posts are never silently marked as bank deposits',()=>{
   const rows=reconcileSalesToTreasury({sales:[{...sales[0],closing_state:'draft'}],
     transactions:[{id:'bad',transaction_date:'2026-10-10',transaction_type:'network_sales_auto',
       reference_id:'c1',direction:'in',amount:400,branch:'rayyan'}]});
   expect(rows).toHaveLength(1);
   expect(rows[0].status).toBe('unaccounted');
 });
 it('does not treat absence of sponsor transfer as a shortage of owner network sales',()=>{
   expect(reconcileExplicitSponsorFlows({sales,sponsorTransactions:[]})).toEqual([]);
 });
});