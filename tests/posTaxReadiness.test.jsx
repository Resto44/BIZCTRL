// @vitest-environment jsdom
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
const fixture = vi.hoisted(() => ({branch:'branch-a',lang:'en',rpc:vi.fn()}));
vi.mock('@/lib/TenantContext', () => ({useTenant: () => ({activeRestaurant:{id:'restaurant-a',business_type:'restaurant'}})}));
vi.mock('@/lib/BranchScopeContext', () => ({ALL_BRANCHES:'all',useBranchScope: () => ({selectedBranchId:fixture.branch})}));
vi.mock('@/lib/LanguageContext', () => ({useLanguage: () => ({lang:fixture.lang})}));
vi.mock('@/lib/restaurantPOS', () => ({restaurantRpc:(...args)=>fixture.rpc(...args),isRestaurantPOSPortal:()=>true}));
vi.mock('@/components/settings/ERPSettingsUI', () => ({SettingsCard:({children})=><div>{children}</div>,SettingsSection:({children})=><section>{children}</section>}));
import POSTaxReadiness from '../src/components/settings/POSTaxReadiness';
const response = {profile:null,menu_review:{zero_rate_count:107,active_count:107},observations:[]};
async function render() {
 let tree;
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 await act(async()=>{tree=TestRenderer.create(<QueryClientProvider client={client}><POSTaxReadiness /></QueryClientProvider>);});
 await act(async()=>{await new Promise(r=>setTimeout(r,20));});
 return {tree,client};
}
beforeEach(()=>{fixture.branch='branch-a';fixture.lang='en';fixture.rpc.mockReset();fixture.rpc.mockResolvedValue(response);});
describe('POS tax preparation',()=>{
 it('requires an explicit branch without silently selecting one',async()=>{
  fixture.branch='all';const {tree,client}=await render();
  expect(fixture.rpc).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Select one branch');
  tree.unmount();client.clear();
 });
 it('saves only declared profile fields to the selected tenant and branch',async()=>{
  const {tree,client}=await render();
  const inputs=tree.root.findAllByType('input');
  await act(async()=>{inputs[0].props.onChange({target:{value:'sa'}});});
  await act(async()=>{inputs[1].props.onChange({target:{value:'Test legal name'}});});
  fixture.rpc.mockResolvedValue({...response,profile:{country_code:'SA',legal_name:'Test legal name',registration_status:'unknown',registration_number:'',mode:'disabled',version:1}});
  await act(async()=>{await tree.root.findAllByType('button').find(b=>b.props.children==='Save branch tax profile').props.onClick();});
  expect(fixture.rpc).toHaveBeenLastCalledWith('tax_settings',{p_restaurant_id:'restaurant-a',p_branch_id:'branch-a',p_profile:{country_code:'SA',legal_name:'Test legal name',registration_status:'unknown',registration_number:'',mode:'disabled',version:0}});
  expect(JSON.stringify(tree.toJSON())).toContain('not connected');
  tree.unmount();client.clear();
 });
 it('shows a recoverable load error instead of offering a blank save',async()=>{
  fixture.rpc.mockRejectedValue(new Error('Missing migration'));
  const {tree,client}=await render();
  expect(tree.root.findAllByType('input')).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Retry');
  tree.unmount();client.clear();
 });
 it.each(['fa','ar'])('renders localized connection status for %s',async lang=>{
  fixture.lang=lang;const {tree,client}=await render();
  expect(JSON.stringify(tree.toJSON())).toContain(lang==='fa'?'متصل نیست':'غير متصل');
  tree.unmount();client.clear();
 });
});
