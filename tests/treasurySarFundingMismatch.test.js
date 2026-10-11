import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {normalizeTreasuryCurrency,isUnverifiedTreasuryCurrency,resolveTreasuryCurrency,formatTreasuryCurrency,treasuryCurrencyWarning} from '../src/lib/treasuryCurrency.js';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
describe('Treasury SAR source ledger and funding denomination regression',()=>{
 it('always interprets SR and Saudi Riyal aliases as SAR, not as whichever display currency is selected',()=>{
  for(const a of ['SAR','SR','S.R','SAR.','ر.س','ر.س.']){
    expect(normalizeTreasuryCurrency(a,'USD')).toBe('SAR');
    expect(normalizeTreasuryCurrency(a,'AFN')).toBe('SAR');
  }
  expect(normalizeTreasuryCurrency('USD','SAR')).toBe('USD');
  expect(normalizeTreasuryCurrency('AFN','SAR')).toBe('AFN');
 });
 it('treats legacy dollar symbol as ambiguous instead of a verified USD or SAR account',()=>{
  expect(isUnverifiedTreasuryCurrency('$')).toBe(true);
  expect(isUnverifiedTreasuryCurrency('﷼')).toBe(true);
  expect(isUnverifiedTreasuryCurrency('SAR')).toBe(false);
  expect(isUnverifiedTreasuryCurrency('SR')).toBe(false);
  expect(treasuryCurrencyWarning({appCurrency:'SAR',financeCurrency:'SAR',accountCurrency:'$',lang:'en'}))
    .toContain('ambiguous');
 });
 it('formats supported account SAR faithfully in all languages, but never relabels genuine USD',()=>{
  for(const lang of ['ar','fa','en']){
   expect(formatTreasuryCurrency(337,{appCurrency:'SAR',financeCurrency:'SAR',accountCurrency:'SR',lang})).toContain('SAR');
   expect(formatTreasuryCurrency(337,{appCurrency:'SAR',financeCurrency:'SAR',accountCurrency:'USD',lang})).toContain('USD');
  }
  expect(resolveTreasuryCurrency({appCurrency:'USD',financeCurrency:'SAR',accountCurrency:'SAR'}).code).toBe('SAR');
 });
 it('source and destination account currencies are compared before RPC, unverified blocks save',async()=>{
  const source=await read('../src/components/treasury/CentralOwnerTreasuryPanel.jsx');
  expect(source).toContain('const currencyMismatch=Boolean');
  expect(source).toContain('sourceCode!==destinationCode');
  expect(source).toContain('isUnverifiedTreasuryCurrency(chosenSource.currency)');
  expect(source).toContain('!currencyMismatch&&!insufficientFunds');
  expect(source).toContain("rawMessage.includes('OWNER_FUNDING_CURRENCY_MISMATCH')");
  expect(source).toContain("normalizeTreasuryCurrency(code,currency)");
  expect(source).toContain("supabase.rpc('erp_owner_fund_branch'");
 });
 it('new Treasury accounts must store canonical currency codes',async()=>{
  const source=await read('../src/pages/Treasury.jsx');
  expect(source).toContain('const canonicalAccountCurrency=normalizeTreasuryCurrency');
  expect(source).toContain('isUnverifiedTreasuryCurrency(enteredCurrency)');
  expect(source).toContain('currency: canonicalAccountCurrency');
 });
 it('guarded tenant repair updates only currency metadata, never numeric amounts or other tenants',async()=>{
  const migration=await read('../supabase/migrations/20261011225500_rayyan_treasury_sar_metadata_repair.sql');
  expect(migration).toContain("v_tenant constant uuid");
  expect(migration).toContain('TENANT_HAS_OTHER_CURRENCY_ACCOUNTS');
  expect(migration).toContain('SYSTEM_NETWORK_HAS_MANUAL_POSTINGS_REVIEW_REQUIRED');
  expect(migration).toContain("UPDATE public.restaurants SET currency='SAR'");
  expect(migration).toContain("UPDATE public.treasury_accounts SET currency='SAR'");
  expect(migration).not.toMatch(/UPDATE\s+public\.(?:wallet_transactions|daily_sales)\s+SET/i);
  expect(migration).toContain('COMMIT');
 });
});
