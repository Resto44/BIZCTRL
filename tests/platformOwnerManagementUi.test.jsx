// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const api=vi.hoisted(()=>Object.fromEntries(['snapshot','dashboard','users','organizations','subscriptions','payments','plans','controlCenter','manualPaymentSettings','saveManualPaymentSettings'].map(k=>[k,vi.fn()])));
vi.mock('@/api/supabaseClient',()=>({supabase:{auth:{signOut:vi.fn()}}}));
vi.mock('@/lib/platformOwnerApi',()=>({platformOwnerApi:api}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en',dir:'ltr',setLang:vi.fn()})}));
import PlatformOwnerPortal from '../src/pages/PlatformOwnerPortal';
let tree,client;
const settle=()=>act(async()=>{await new Promise(r=>setTimeout(r,25));});
const button=label=>tree.root.findAllByType('button').find(b=>b.children.includes(label));
async function click(label){await act(async()=>button(label).props.onClick());await settle();}
async function change(node,value){await act(async()=>node.props.onChange({target:{value}}));await settle();}
beforeEach(async()=>{
 vi.resetAllMocks();
 api.snapshot.mockResolvedValue({authenticated:true,authorized:true});
 api.dashboard.mockResolvedValue({});
 api.users.mockResolvedValue({items:[],total:60});
 api.payments.mockResolvedValue({items:[],total:60});
 api.subscriptions.mockResolvedValue({items:[],total:0});
 api.controlCenter.mockResolvedValue({plans:[],modules:[]});
 client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 await act(async()=>{tree=create(<QueryClientProvider client={client}><MemoryRouter><PlatformOwnerPortal/></MemoryRouter></QueryClientProvider>);});
 await settle();
});
afterEach(()=>{tree.unmount();client.clear();});
describe('Platform owner management interactions',()=>{
 it('retains the pending filter when drilling into payments from the dashboard',async()=>{
  const card=tree.root.findByProps({'aria-label':'Platform overview'}).findAllByType('button')[3];
  await act(async()=>card.props.onClick());await settle();
  expect(api.payments.mock.lastCall).toEqual(['pending',25,0]);
 });
 it('uses approval status for users and resets pagination after search or status changes',async()=>{
  await click('Users');
  const selector=tree.root.findByProps({'aria-label':'Status',value:''});
  expect(selector.findAllByType('option').map(n=>n.props.value)).toEqual(['','approved','pending','rejected']);
  await act(async()=>tree.root.findByProps({'aria-label':'Next page',size:'icon'}).props.onClick());await settle();
  expect(api.users.mock.lastCall[3]).toBeGreaterThan(0);
  await change(tree.root.findByType('input'),'Alice');
  expect(api.users.mock.lastCall).toEqual(['Alice','',25,0]);
  await change(tree.root.findByProps({'aria-label':'Status',value:''}),'approved');
  expect(api.users.mock.lastCall).toEqual(['Alice','approved',25,0]);
 });
 it('uses payment statuses, omits unsupported search, and keeps navigation on empty pages',async()=>{
  await click('Payments & IBAN proofs');
  expect(tree.root.findAllByType('input')).toHaveLength(0);
  const selector=tree.root.findByProps({'aria-label':'Status',value:''});
  expect(selector.findAllByType('option').map(n=>n.props.value)).toContain('paid');
  await act(async()=>tree.root.findByProps({'aria-label':'Next page',size:'icon'}).props.onClick());await settle();
  expect(tree.root.findByProps({'aria-label':'Previous page',size:'icon'}).props.disabled).toBe(false);
  await change(tree.root.findByProps({'aria-label':'Status',value:''}),'paid');
  expect(api.payments.mock.lastCall).toEqual(['paid',25,0]);
 });
 it('does not permit saving blank settings when the stored settings failed to load',async()=>{
  api.manualPaymentSettings.mockRejectedValue(new Error('Unavailable'));
  await click('Owner settings');
  expect(button('Save').props.disabled).toBe(true);
  expect(api.saveManualPaymentSettings).not.toHaveBeenCalled();
 });
});
