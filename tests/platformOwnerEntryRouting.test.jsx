// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({snapshot:vi.fn(),dashboard:vi.fn(),signOut:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{auth:{signOut:mocks.signOut}}}));
vi.mock('@/lib/platformOwnerApi',()=>({platformOwnerApi:{snapshot:mocks.snapshot,dashboard:mocks.dashboard}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en',dir:'ltr',setLang:vi.fn()})}));
import PlatformOwnerPortal from '../src/pages/PlatformOwnerPortal';
async function render(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 let tree;
 await act(async()=>{
  tree=create(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/platform-owner']}><Routes>
   <Route path="/platform-owner" element={<PlatformOwnerPortal/>}/>
   <Route path="/platform-owner/login" element={<div data-testid="login">Owner sign in</div>}/>
  </Routes></MemoryRouter></QueryClientProvider>);
 });
 await act(async()=>{await new Promise(r=>setTimeout(r,25));});
 return {tree,client};
}
describe('Platform Owner entry routing',()=>{
 beforeEach(()=>vi.resetAllMocks());
 it.each([
  {authenticated:false,authorized:false},
  {authenticated:true,authorized:false},
  {authenticated:true,authorized:true,mfa_required:true,mfa_verified:false},
 ])('routes to login without signing out or fetching privileged data: %j',async snapshot=>{
  mocks.snapshot.mockResolvedValue(snapshot);
  const {tree,client}=await render();
  expect(tree.root.findByProps({'data-testid':'login'}).children).toEqual(['Owner sign in']);
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(mocks.dashboard).not.toHaveBeenCalled();
  tree.unmount();client.clear();
 });
 it('offers retry and a sign-in escape on actual service failures',async()=>{
  mocks.snapshot.mockRejectedValue(new Error('Network unavailable'));
  const {tree,client}=await render();
  expect(tree.root.findByProps({role:'alert'})).toBeTruthy();
  const back=tree.root.findAllByType('button').find(b=>b.children.includes('Back to Platform Owner sign in'));
  await act(async()=>{back.props.onClick();});
  expect(tree.root.findByProps({'data-testid':'login'})).toBeTruthy();
  expect(mocks.dashboard).not.toHaveBeenCalled();
  tree.unmount();client.clear();
 });
});
