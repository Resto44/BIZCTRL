// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {MemoryRouter} from 'react-router-dom';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({me:vi.fn(),listener:null}));
vi.mock('@/api/base44Client',()=>({base44:{auth:{me:mocks.me}}}));
vi.mock('@/api/supabaseClient',()=>({supabase:{auth:{onAuthStateChange:fn=>{mocks.listener=fn;return {data:{subscription:{unsubscribe(){}}}};},signOut:vi.fn().mockResolvedValue({})}}}));
vi.mock('@/lib/ownerPush',()=>({disableDevicePush:vi.fn().mockResolvedValue(undefined)}));
import {AuthProvider,useAuth} from '@/lib/AuthContext';
let snapshot,tree;
function Consumer(){snapshot=useAuth();return null;}
async function mount(){await act(async()=>{tree=create(<MemoryRouter><AuthProvider><Consumer/></AuthProvider></MemoryRouter>);});}
beforeEach(()=>{mocks.me.mockReset();snapshot=null;});
afterEach(()=>{if(tree)act(()=>tree.unmount());});
describe('portal auth lifecycle',()=>{
 it('does not resurrect a user when a slow lookup resolves after signout',async()=>{
  let resolve;mocks.me.mockReturnValue(new Promise(r=>{resolve=r;}));await mount();
  await act(async()=>mocks.listener('SIGNED_OUT',null));
  await act(async()=>resolve({id:'old-user'}));
  expect(snapshot.user).toBe(null);expect(snapshot.isAuthenticated).toBe(false);expect(snapshot.authChecked).toBe(true);
 });
 it('clears the previous user when revalidation fails',async()=>{
  mocks.me.mockResolvedValue({id:'user'});await mount();expect(snapshot.isAuthenticated).toBe(true);
  mocks.me.mockRejectedValue(new Error('expired'));await act(async()=>snapshot.checkUserAuth());
  expect(snapshot.user).toBe(null);expect(snapshot.isAuthenticated).toBe(false);
 });
 it('does not authenticate a null profile',async()=>{
  mocks.me.mockResolvedValue(null);await mount();await act(async()=>snapshot.checkUserAuth());
  expect(snapshot.isAuthenticated).toBe(false);expect(snapshot.authError.type).toBe('auth_required');
 });
});
