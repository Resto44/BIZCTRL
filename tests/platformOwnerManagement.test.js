import {describe,it,expect} from 'vitest';
import {formatPlatformMoney, validPlatformPlan, validPlatformPromotion, validTrialDays} from '../src/lib/platformOwnerManagement';
const plan={id:'growth_40',displayName:'Growth',currency:'USD',monthlyPriceCents:4000,yearlyPriceCents:40000,originalPriceCents:4000,billingPeriodMonths:1,trialDays:14,limits:{users:5,products:-1}};
describe('Platform management validation',()=>{
 it('preserves the recorded currency and fractional amount',()=>{
  expect(formatPlatformMoney(12345,'en','sar')).toMatch(/SAR.*123.45/);
  expect(formatPlatformMoney(12345,'en','usd')).toMatch(/USD.*123.45/);
  expect(formatPlatformMoney(null)).toBe('—');
 });
 it('accepts a valid plan and unlimited entitlement',()=>expect(validPlatformPlan(plan)).toBe(true));
 it.each([{yearlyPriceCents:-1},{monthlyPriceCents:1.5},{yearlyPriceCents:2147483648},{originalPriceCents:1},{billingPeriodMonths:13},{trialDays:91},{limits:{users:-2}},{limits:{users:''}},{limits:{users:null}},{currency:'$'},{displayName:'  '}])('rejects invalid plan fields %j',change=>expect(validPlatformPlan({...plan,...change})).toBe(false));
 const promo={name:'Offer',planId:'growth_40',percentOff:20,startsAt:'2026-10-12T12:00',endsAt:'2026-10-13T12:00',maxRedemptions:''};
 it('accepts a bounded promotion against an existing active plan',()=>expect(validPlatformPromotion(promo,[{id:'growth_40'}])).toBe(true));
 it.each([{endsAt:'2026-10-11T12:00'},{endsAt:'invalid'},{percentOff:101},{percentOff:0},{percentOff:2.5},{maxRedemptions:'0'},{planId:'missing'}])('rejects invalid promotion %j',change=>expect(validPlatformPromotion({...promo,...change},[{id:'growth_40'}])).toBe(false));
 it('blocks promotions for disabled plans',()=>expect(validPlatformPromotion(promo,[{id:'growth_40',is_active:false}])).toBe(false));
 it('bounds trial extension to whole days',()=>{
  expect(validTrialDays(90)).toBe(true);
  for(const days of [0,91,1.5,'',null]) expect(validTrialDays(days)).toBe(false);
 });
});
