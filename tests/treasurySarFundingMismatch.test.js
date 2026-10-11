import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {normalizeTreasuryCurrency,resolveTreasuryCurrency,formatTreasuryCurrency} from '../src/lib/treasuryCurrency.js';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
describe('Treasury Riyal denomination and Owner funding',()=>{
 it('normalizes Saudi Riyal legacy aliases to SAR independent of selected display currency',()=>{
   for(const a of ['SAR','SR','S.R','SAR.','ر.س','ر.س.']){
     expect(normalizeTreasuryCurrency(a,'USD')).toBe('SAR');
   }
   expect(normalizeTreasuryCurrency('USD','SAR')).toBe('USD');
 });
 it('shows 337 as SAR in AR, FA and EN without altering numeric amount',()=>{
   for(const lang of ['en','ar','fa']){
     const result=formatTreasuryCurrency(337,{appCurrency:'SAR',accountCurrency:'SR',lang});
     expect(result).toContain('SAR');
     expect(result).not.toContain('USD');
   }
 });
 it('preserves genuine foreign currency rather than relabeling it as SAR',()=>{
   expect(resolveTreasuryCurrency({
     appCurrency:'SAR',restaurantCurrency:'SAR',accountCurrency:'USD',
   }).code).toBe('USD');
 });
 it('guards funding between distinct currencies and translates the server error',async()=>{
   const component=await read('../src/components/treasury/CentralOwnerTreasuryPanel.jsx');
   expect(component).toContain('fundingCurrencyMismatch');
   expect(component).toContain('!fundingCurrencyMismatch');
   expect(component).toContain('normalizeTreasuryCurrency(chosenSource.currency,currency)');
   expect(component).toContain("rawMessage.includes('OWNER_FUNDING_CURRENCY_MISMATCH')");
 });
 it('only corrects Rayyan tenant currency metadata, without changing monetary amounts',async()=>{
   const migration=await read('../supabase/migrations/20261011225500_rayyan_treasury_sar_metadata_repair.sql');
   expect(migration).toContain('TENANT_HAS_OTHER_CURRENCY_ACCOUNTS');
   expect(migration).toContain('SYSTEM_NETWORK_HAS_MANUAL_POSTINGS_REVIEW_REQUIRED');
   expect(migration).toContain("UPDATE public.restaurants SET currency='SAR'");
   expect(migration).toContain("UPDATE public.treasury_accounts SET currency='SAR'");
   expect(migration).not.toMatch(/UPDATE\s+public\.(wallet_transactions|daily_sales)\s+SET/i);
 });
});
