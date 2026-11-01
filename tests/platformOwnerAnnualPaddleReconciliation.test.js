import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {expectedAnnualPriceCents,ownerAnnualCatalogState,ownerBillingInterval} from '../src/lib/platformAnnualBilling.js';

const source=(name)=>readFileSync(new URL(name,import.meta.url),'utf8');
const ids=['pri_01m0hthmjx6etgf554b26t14g7','pri_01m0hthmppwwpscxth3144zwgk','pri_01m0hthmv60gd2hmrmcahr19fj'];
const annualIds=['pri_01m6bax5b0hys34kvzz8kwzypm','pri_01m6bax67cbsrg2dt4d5myqv9d','pri_01m6bax73yy3yrab1mzz4gm3bt'];
const plans=[1000,2000,5000].map((monthly_price_cents,i)=>({
 currency:'USD',monthly_price_cents,yearly_price_cents:[8400,16800,42000][i],
 paddle_price_id:ids[i],paddle_annual_price_id:annualIds[i]
}));
describe('Platform Owner annual Paddle billing ERP reconciliation',()=>{
 it('quotes $84/$168/$420 annual from existing discounted monthly prices',()=>{
  expect(plans.map(expectedAnnualPriceCents)).toEqual([8400,16800,42000]);
  expect(plans.map(p=>ownerAnnualCatalogState(p).kind)).toEqual(['linked','linked','linked']);
  expect(ownerAnnualCatalogState({...plans[0],yearly_price_cents:8300}).kind).toBe('mismatch');
  expect(ownerAnnualCatalogState({...plans[0],paddle_annual_price_id:null}).kind).toBe('unlinked');
 });
 it('only labels verified active subscription intervals; trial is not called paid annual',()=>{
  expect(ownerBillingInterval({subscription_status:'ACTIVE',billing_interval:'year'})).toBe('year');
  expect(ownerBillingInterval({subscription_status:'ACTIVE',billing_interval:'month'})).toBe('month');
  expect(ownerBillingInterval({subscription_status:'TRIAL',billing_interval:'year'})).toBe('trial');
  expect(ownerBillingInterval({subscription_status:'PAST_DUE',billing_interval:'year'})).toBe('none');
 });
 it('backfills real annual values and rejects edits mismatching linked Paddle prices',()=>{
  const migration=source('../supabase/migrations/20261101202500_platform_owner_paddle_annual_catalog_consistency.sql');
  expect(migration).toContain('round(p.monthly_price_cents::numeric * 12 * 0.70)::integer');
  expect(migration).toContain('v_yearly IS DISTINCT FROM v_existing.yearly_price_cents');
  expect(migration).toContain('PADDLE_LINKED_PLAN_PRICE_LOCKED');
  expect(migration).toContain('PADDLE_SUBSCRIPTION_PLAN_CHANGE_REQUIRES_PROVIDER');
  expect(migration).toContain('platform_owner_assert()');
  expect(migration).toContain('subscription.billing_interval');
  expect(migration).toContain('has_paddle_subscription');
  expect(migration).not.toMatch(/DELETE FROM public\.(subscriptions|subscription_payments)/);
 });
 it('Platform Owner cards show correct annual price and connected Paddle ID; editor locks pricing, not quotas',()=>{
  const cards=source('../src/components/platform-owner/PlatformPlanPricing.jsx');
  const page=source('../src/pages/PlatformOwnerPortal.jsx');
  expect(cards).toContain("onClick={()=>setPeriod('year')}");
  expect(cards).toContain('formatPlatformMoney(amount,lang,plan.currency)');
  expect(cards).toContain('ownerAnnualCatalogState(plan)');
  expect(page).toContain('<PlatformPlanPricing plan={plan} lang={lang}/>');
  expect(page).toContain('disabled={paddlePriceLinked} value={form.yearlyPriceCents}');
  expect(page).toContain('disabled={paddlePriceLinked} value={form.monthlyPriceCents}');
  expect(page).toContain('<SubscriptionInterval item={item} lang={lang}/>');
  expect(page).toContain("item.paddle_annual_price_id");
  expect(page).toContain('limits: { max_restaurants:');
 });
 it('normalizes annual MRR to monthly equivalent without modifying cash or payment history',()=>{
  const migration=source('../supabase/migrations/20261101203500_platform_owner_annual_mrr_normalization.sql');
  expect(migration).toContain("subscription.billing_interval='year'");
  expect(migration).toContain("s.billing_interval='year'");
  expect(migration).toContain("p.yearly_price_cents");
  expect(migration).toContain("plan.yearly_price_cents");
  expect(migration).toContain("WHERE status = 'paid'");
  expect([8400,16800,42000].map(x=>Math.round(x/12))).toEqual([700,1400,3500]);
  expect(migration).not.toContain('UPDATE public.subscription_payments');
 });
});
