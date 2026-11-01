import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {formatOwnerSubscriptionDate,ownerSubscriptionDate} from '../src/lib/platformOwnerSubscriptionDates.js';

describe('Platform Owner subscription dates match customer Billing',()=>{
 const trial={subscription_status:'TRIAL',trial_start:'2026-10-01',trial_end:'2026-12-01',current_period_end:'2026-10-31',payment_provider:'none'};
 it('shows the trial end, not the stale old monthly date or a bill',()=>{
  expect(ownerSubscriptionDate(trial)).toEqual({kind:'trialEnd',value:'2026-12-01'});
  expect(formatOwnerSubscriptionDate(ownerSubscriptionDate(trial).value,'en')).toBe('Dec 1, 2026');
 });
 it('formats SQL DATE as calendar day without a phantom 3AM from Riyadh UTC conversion',()=>{
  expect(formatOwnerSubscriptionDate('2026-12-01','en')).toBe('Dec 1, 2026');
  expect(formatOwnerSubscriptionDate('2026-10-31','en')).toBe('Oct 31, 2026');
  expect(formatOwnerSubscriptionDate('2026-02-30')).toBe('—');
  expect(formatOwnerSubscriptionDate('2026-11-01T03:00:00Z')).toBe('—');
  expect(formatOwnerSubscriptionDate(null)).toBe('—');
 });
 it('only claims a next scheduled bill for an active Paddle subscription',()=>{
  expect(ownerSubscriptionDate({...trial,subscription_status:'ACTIVE',payment_provider:'paddle'}))
    .toEqual({kind:'nextBilling',value:'2026-10-31'});
  expect(ownerSubscriptionDate({...trial,subscription_status:'ACTIVE',payment_provider:'manual_iban'}))
    .toEqual({kind:'accessThrough',value:'2026-10-31'});
  for(const status of ['EXPIRED','CANCELED','PAST_DUE','SUSPENDED','PENDING_PAYMENT'])
    expect(ownerSubscriptionDate({...trial,subscription_status:status})).toEqual({kind:'none',value:null});
 });
 it('uses same milestone helper for mobile cards and desktop table, never dateTime(current_period_end)',()=>{
  const content=readFileSync(new URL('../src/pages/PlatformOwnerPortal.jsx',import.meta.url),'utf8');
  expect(content).toContain('<SubscriptionMilestone item={item} t={t} lang={lang}/>');
  expect(content.match(/<SubscriptionMilestone item={item} t={t} lang={lang}\/>/g)).toHaveLength(2);
  expect(content).toContain('formatOwnerSubscriptionDate(item.trial_end, lang)');
  expect(content).not.toContain('dateTime(item.current_period_end, lang)');
  expect(content).toContain('noScheduledBilling');
 });
});
