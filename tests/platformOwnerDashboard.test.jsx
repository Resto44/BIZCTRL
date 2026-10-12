import React from 'react';
import {create,act} from 'react-test-renderer';
import {describe,it,expect,vi} from 'vitest';
import PlatformDashboard, {PlatformRevenue} from '../src/components/platform-owner/PlatformDashboard';
const data={total_users:65,active_users:60,total_organizations:36,active_organizations:30,total_subscriptions:36,active_subscriptions:0,pending_payments:10,reviewable_payments:4,trials_ending_7_days:2,subscription_counts:{TRIAL:30,EXPIRED:6},financial_by_currency:[{currency:'SAR',monthly_collected_cents:12345,total_collected_cents:25000,monthly_plan_value_cents:0,pending_cents:1000},{currency:'USD',monthly_collected_cents:2000,total_collected_cents:4000,monthly_plan_value_cents:0,pending_cents:0}]};
describe('Platform dashboard',()=>{
 it('separates all subscriptions from active subscriptions and links pending payments with the correct filter',()=>{
  const navigate=vi.fn();let tree;act(()=>{tree=create(<PlatformDashboard data={data} onNavigate={navigate}/>);});
  const cards=tree.root.findByProps({'aria-label':'Platform overview'}).findAllByType('button');
  expect(cards).toHaveLength(4);
  expect(cards[2].findAllByType('p').map(p=>p.children.join('')).join(' ')).toContain('36');
  expect(cards[2].findAllByType('p').map(p=>p.children.join('')).join(' ')).toContain('Active: 0');
  act(()=>cards[3].props.onClick());expect(navigate).toHaveBeenCalledWith('payments','pending');tree.unmount();
 });
 it('keeps currencies separate instead of summing dollar and riyal amounts',()=>{
  const tree=create(<PlatformRevenue data={data}/>),text=JSON.stringify(tree.toJSON());
  expect(text).toContain('SAR');expect(text).toContain('123.45');expect(text).toContain('USD');expect(text).toContain('20.00');expect(text).not.toContain('143.45');tree.unmount();
 });
 it('does not invent zero financials when the endpoint is missing its data',()=>{
  const tree=create(<PlatformRevenue data={{}}/>);expect(JSON.stringify(tree.toJSON())).toContain('Unavailable');tree.unmount();
 });
 it.each(['en','fa','ar'])('renders localized dashboard with two mobile columns in %s',lang=>{
  const tree=create(<PlatformDashboard data={data} lang={lang} updatedAt={1791792000000} onNavigate={()=>{}}/>);
  expect(tree.root.findAllByType('section')[0].props.className).toContain('grid-cols-2');
  expect(tree.root.findAllByType('time')).toHaveLength(1);tree.unmount();
 });
});
