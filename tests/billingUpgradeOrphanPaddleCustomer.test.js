import {describe,it,expect,vi,beforeEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {planCapacityGaps,recommendedCapacityPlan} from '../src/lib/billingUpgradeCapacity.js';
import {PaddlePaymentProvider} from '../src/lib/payment/PaymentProvider.js';
import {beginPaddleCheckout} from '@/lib/paddleBilling';

vi.mock('@/lib/paddle',()=>({isPaddleClientConfigured:()=>true}));
vi.mock('@/lib/paddleBilling',()=>({
  beginPaddleCheckout:vi.fn(async(planId,customerId,interval)=>({transactionId:'new-checkout',planId,customerId,interval})),
  getPaddleCustomerPortalUrl:vi.fn(async()=>'https://checkout.paddle.com/portal')
}));
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
describe('Upgrade with 4 branches and a failed prior Paddle payment',()=>{
 beforeEach(()=>vi.clearAllMocks());
 const plans=[
  {id:'starter_20',display_name:'Starter',monthly_price_cents:1000,max_branches:1,max_users:3,max_employees:5},
  {id:'growth_40',display_name:'Growth',monthly_price_cents:2000,max_branches:3,max_users:10,max_employees:15},
  {id:'enterprise_100',display_name:'Enterprise',monthly_price_cents:5000,max_branches:10,max_users:30,max_employees:50}
 ];
 it('recommends Enterprise rather than a plan with less capacity than used',()=>{
  const usage={branches:4,users:2,employees:2};
  expect(recommendedCapacityPlan(plans,usage).id).toBe('enterprise_100');
  expect(planCapacityGaps(plans[0],usage)).toMatchObject([{resource:'branches',used:4,limit:1}]);
  expect(planCapacityGaps(plans[1],usage)).toMatchObject([{resource:'branches',used:4,limit:3}]);
  expect(planCapacityGaps(plans[2],usage)).toEqual([]);
 });
 it('opens a new transaction after failed Paddle checkout if customer has NO subscription',async()=>{
  const provider=new PaddlePaymentProvider({summary:{
    payment_provider:'paddle',paddle_customer_id:'ctm_0123456789abcdefghijklmnop',
    paddle_subscription_id:null,status:'PAST_DUE'
  }});
  provider.openCustomerPortal=vi.fn(async()=>{throw new Error('portal must not be called');});
  const result=await provider.createCheckout('enterprise_100','year');
  expect(result).toMatchObject({transactionId:'new-checkout',planId:'enterprise_100',interval:'year'});
  expect(beginPaddleCheckout).toHaveBeenCalledWith('enterprise_100',
    'ctm_0123456789abcdefghijklmnop','year');
  expect(provider.openCustomerPortal).not.toHaveBeenCalled();
 });
 it('keeps a genuinely linked customer and subscription on managed Paddle path',async()=>{
  const provider=new PaddlePaymentProvider({summary:{
    payment_provider:'paddle',paddle_customer_id:'ctm_0123456789abcdefghijklmnop',
    paddle_subscription_id:'sub_0123456789abcdefghijklmnop',status:'ACTIVE'
  }});
  provider.openCustomerPortal=vi.fn(async()=> 'https://checkout.paddle.com/portal');
  await expect(provider.createCheckout('enterprise_100','year')).resolves.toEqual({
    flow:'manage_existing_subscription',url:'https://checkout.paddle.com/portal'
  });
  expect(beginPaddleCheckout).not.toHaveBeenCalled();
 });
 it('preserves active trial during pending checkout and failed Paddle attempt without subscription',()=>{
  const source=read('../supabase/migrations/20261101171500_paddle_upgrade_preserve_existing_entitlements.sql');
  const parts=source.split('CREATE OR REPLACE FUNCTION public.paddle_apply_webhook_event');
  expect(parts).toHaveLength(2);
  expect(parts[0]).toContain('CREATE OR REPLACE FUNCTION public.paddle_create_checkout_context');
  expect(parts[0]).not.toContain('UPDATE public.subscriptions');
  expect(parts[0]).toContain("'paddle_checkout_requested'");
  expect(parts[1]).toContain("p_event_type IN ('transaction.payment_failed','transaction.past_due')");
  expect(parts[1]).toContain("nullif(v_subscription.paddle_subscription_id,'') IS NULL");
  expect(parts[1]).toContain('UPDATE public.subscription_payments');
 });
 it('does not auto-pay when clicking upgrade recommendation; requires deliberate plan choice',()=>{
  const billing=read('../src/pages/Billing.jsx');
  expect(billing).toContain('target?.scrollIntoView');
  expect(billing).toContain('const shortfall=planCapacityGaps(candidate,usage)');
  expect(billing).toContain('cannotCoverUsage ||');
  expect(billing).toContain('onClick={() => beginManualPayment(item.id)}');
 });
});
