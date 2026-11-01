import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {annualPriceCents,ANNUAL_ADDITIONAL_DISCOUNT_PERCENT} from '../src/lib/pricingCatalog.js';
const text=path=>readFileSync(new URL(path,import.meta.url),'utf8');
describe('Annual Paddle 30 percent additional discount, source of truth',()=>{
 it('discounts already-discounted monthly amounts by 30 percent for one year',()=>{
  expect(ANNUAL_ADDITIONAL_DISCOUNT_PERCENT).toBe(30);
  expect(annualPriceCents({monthly_price_cents:1000})).toBe(8400);
  expect(annualPriceCents({monthly_price_cents:2000})).toBe(16800);
  expect(annualPriceCents({monthly_price_cents:5000})).toBe(42000);
  expect(annualPriceCents({monthly_price_cents:999})).toBe(8392);
  expect(annualPriceCents({monthly_price_cents:null})).toBeNull();
 });
 it('requires server annual quote and price.write catalog provisioning before pending checkout',()=>{
  const edge=text('../supabase/functions/paddle-subscription-checkout/index.ts');
  expect(edge).toContain("caller.rpc('paddle_annual_quote'");
  expect(edge).toContain("monthly?.billing_cycle?.interval!=='month'");
  expect(edge).toContain("Number(monthly?.unit_price?.amount)!==quote.monthly_cents");
  expect(edge).toContain("method:'POST',headers:authHeaders");
  expect(edge).toContain("billing_cycle:{interval:'year',frequency:1}");
  expect(edge).toContain("service.rpc('paddle_register_annual_price'");
  expect(edge.indexOf("caller.rpc('paddle_annual_quote'")).toBeLessThan(edge.indexOf("caller.rpc(\"paddle_create_checkout_context\""));
  expect(edge).toContain('items: [{ price_id: context.paddle_price_id, quantity: 1 }]');
  expect(edge).toContain('bizctrl_billing_interval: interval');
 });
 it('binds annual period, amount and allowed Paddle ID to owner and signed webhook',()=>{
  const sql=text('../supabase/migrations/20261101090000_paddle_annual_billing_30_percent.sql');
  expect(sql).toContain("round(v_plan.monthly_price_cents::numeric*12*0.70)::integer");
  expect(sql).toContain("coalesce(v_existing_payment.metadata->>'billing_interval','month')=v_interval");
  expect(sql).toContain('v_existing_payment.amount_cents=v_amount');
  expect(sql).toContain("v_price_id IS DISTINCT FROM v_plan.paddle_annual_price_id");
  expect(sql).toMatch(/IF auth\.role\(\)\s*<>\s*'service_role'/);
  expect(sql).toContain("'billing_interval',coalesce(v_subscription.billing_interval,'month')");
  expect(sql).not.toContain('PADDLE_SANDBOX');
 });
 it('does not let browser send a price, currency, tenant or discount',()=>{
  const client=text('../src/lib/paddleBilling.js');
  expect(client).toContain('body: { planId, billingInterval }');
  expect(client).not.toContain('monthly_price_cents');
  expect(client).not.toContain('annual_cents');
  const provider=text('../src/lib/payment/PaymentProvider.js');
  expect(provider).toContain("beginPaddleCheckout(planId, summary.paddle_customer_id,billingInterval)");
 });
 it('exposes annual selection on public pricing, Billing and registration return flow',()=>{
  const landing=text('../src/components/marketing/PublicPricingCards.jsx');
  const billing=text('../src/pages/Billing.jsx');
  const registration=text('../src/lib/publicPlanCheckout.js');
  expect(landing).toContain("onStartFree(plan,yearly?'year':'month')");
  expect(landing).toContain('annualPriceCents(plan)');
  expect(billing).toContain("provider.createCheckout(planId,billingInterval)");
  expect(billing).toContain('annualPriceCents(item)');
  expect(registration).toContain('checkout_period=');
 });
});
