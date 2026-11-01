import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {centsToDollarInput,dollarInputToCents} from '../src/lib/platformOwnerPriceInputs.js';
import {validPlatformPlan} from '../src/lib/platformOwnerManagement.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const plan={
 id:'starter_20', displayName:'Starter',currency:'USD',
 monthlyPriceCents:1000,yearlyPriceCents:8400,originalPriceCents:4000,
 billingPeriodMonths:1,trialDays:30,limits:{branches:3,users:10,employees:20}
};
describe('Platform Owner USD editor avoids showing raw cents',()=>{
 it('shows monthly 1000, annual 8400, original 4000 as dollars',()=>{
  expect([1000,8400,4000,16800,42000,0].map(centsToDollarInput))
   .toEqual(['10.00','84.00','40.00','168.00','420.00','0.00']);
 });
 it('converts US dollar inputs to integer cents without floating-point rounding',()=>{
  expect(['10.00','84.00','40.00','12.5','0.01','0','21474836.47']
    .map(dollarInputToCents)).toEqual([1000,8400,4000,1250,1,0,2147483647]);
 });
 it('rejects invalid/incomplete monetary inputs; bad values fail plan validation',()=>{
  for(const entry of ['', '10.', '1.999', '-1', '1e3', '$10', '0,25','abc','21474836.48','99999999999999']){
   expect(dollarInputToCents(entry)).toBeNull();
   expect(validPlatformPlan({...plan,monthlyPriceCents:dollarInputToCents(entry)})).toBe(false);
  }
  expect(validPlatformPlan({...plan,originalPriceCents:dollarInputToCents('40.00')})).toBe(true);
 });
 it('keeps API request values in integer cents and locks linked Paddle rates',()=>{
  const page=read('../src/pages/PlatformOwnerPortal.jsx');
  const api=read('../src/lib/platformOwnerApi.js');
  expect(page).toContain("centsToDollarInput(monthly)");
  expect(page).toContain("centsToDollarInput(yearly)");
  expect(page).toContain("centsToDollarInput(original)");
  expect(page).toContain('dollarInputToCents(value)');
  expect(page).toContain('inputMode="decimal"');
  expect(page).toContain("form.currency==='USD'?'$':form.currency");
  expect(page).not.toContain('Monthly price (cents)');
  expect(page).not.toContain('Yearly price (cents)');
  expect(page).not.toContain('Original price (cents)');
  for(const key of ['monthlyPriceCents','yearlyPriceCents','originalPriceCents']){
   expect(api).toContain(`Number(plan.${key} || 0)`);
  }
  expect(page).toContain("disabled={paddlePriceLinked && draftKey!=='original'}");
 });
});
