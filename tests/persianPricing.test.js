import { describe, expect, it } from 'vitest';
import { billingProductLabel, discountLabel, money, monthlyLabel, planCapacities, planFeatures, trialDisclosure } from '../src/lib/pricingCatalog';
const plan={display_name:'Starter',billing_product_key:'starter_monthly',billing_period_months:1,monthly_price_cents:1000,original_price_cents:4000,discount_active:true,discount_percent:75,discount_label:'75% OFF',trial_days:30,max_users:3,max_branches:1,max_employees:5,feature_flags:['expenses','inventory']};
describe('localized subscription copy',()=>{
 it('localizes Persian capacities, trial terms and feature labels while preserving actual prices and periods',()=>{
   expect(monthlyLabel(plan,'fa')).toBe('/ماه');
   expect(planCapacities(plan,'fa')).toEqual(['3 کاربر','1 شعبه','5 کارمند']);
   expect(planFeatures(plan,'fa')).toEqual(['مدیریت هزینه‌ها','مدیریت موجودی']);
   expect(discountLabel(plan,'fa')).toBe('75٪ تخفیف');
   expect(billingProductLabel(plan,'fa')).toBe('ابتدایی · /ماه');
   expect(trialDisclosure(plan,'fa')).toContain('30 روز آزمایشی');
   expect(trialDisclosure(plan,'fa')).toContain(money(1000,'fa'));
   expect(monthlyLabel({...plan,billing_period_months:3},'fa')).toBe('هر 3 ماه');
   expect(plan.monthly_price_cents).toBe(1000);
 });
 it('retains English compatibility and localizes Arabic recurring periods',()=>{
   expect(trialDisclosure(plan)).toContain('$10/month');
   expect(planCapacities(plan)).toEqual(['3 users','1 branches','5 employees']);
   expect(monthlyLabel(plan,'ar')).toBe('/شهر');
   expect(trialDisclosure({...plan,trial_days:0},'fa')).toBe('');
 });
});

it('localizes Arabic subscription features and prices without changing billing data', () => {
  expect(planFeatures(plan,'ar')).toEqual(['إدارة المصروفات','إدارة المخزون']);
  expect(billingProductLabel(plan,'ar')).toBe('الباقة المبدئية · /شهر');
  expect(discountLabel(plan,'ar')).toBe('75٪ خصم');
  expect(planCapacities(plan,'ar')).toEqual(['3 مستخدمين','1 فروع','5 موظفين']);
  expect(trialDisclosure(plan,'ar')).toContain(money(1000,'ar'));
  expect(trialDisclosure(plan,'ar')).not.toMatch(/free|month|unless|cancelled/);
  expect(plan.monthly_price_cents).toBe(1000);
});
