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
import {queryClientInstance} from '@/lib/query-client';
let snapshot,tree;
function Consumer(){snapshot=useAuth();return null;}
async function mount(){await act(async()=>{tree=create(<MemoryRouter><AuthProvider><Consumer/></AuthProvider></MemoryRouter>);});}
beforeEach(()=>{mocks.me.mockReset();snapshot=null;});
afterEach(()=>{if(tree)act(()=>tree.unmount());queryClientInstance.clear();});
describe('portal auth lifecycle',()=>{
 it('defers auth SDK work outside the auth callback and cancels queued refresh on signout',async()=>{
  vi.useFakeTimers();
  try {
   mocks.me.mockResolvedValue({id:'user'});await mount();
   const initialCalls=mocks.me.mock.calls.length;
   await act(async()=>mocks.listener('SIGNED_IN',{user:{id:'user'}}));
   expect(mocks.me).toHaveBeenCalledTimes(initialCalls);
   await act(async()=>vi.advanceTimersByTimeAsync(0));
   expect(mocks.me).toHaveBeenCalledTimes(initialCalls+1);
   await act(async()=>mocks.listener('TOKEN_REFRESHED',{user:{id:'user'}}));
   await act(async()=>mocks.listener('SIGNED_OUT',null));
   await act(async()=>vi.advanceTimersByTimeAsync(0));
   expect(mocks.me).toHaveBeenCalledTimes(initialCalls+1);
   expect(snapshot.isAuthenticated).toBe(false);
  } finally {vi.useRealTimers();}
 });
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
 it('clears cached portal records immediately on account switch and ignores late reads',async()=>{
  mocks.me.mockResolvedValue({id:'a',restaurant_id:'restaurant-a'});await mount();
  queryClientInstance.setQueryData(['platform-owner','snapshot'],{private:'a'});
  let finish;
  const pending=queryClientInstance.fetchQuery({queryKey:['slow-finance'],queryFn:()=>new Promise(resolve=>{finish=resolve;})}).catch(()=>{});
  vi.useFakeTimers();
  try {
   mocks.me.mockResolvedValue({id:'b',restaurant_id:'restaurant-b'});
   await act(async()=>mocks.listener('SIGNED_IN',{user:{id:'b'}}));
   expect(snapshot.user).toBe(null);
   expect(queryClientInstance.getQueryData(['platform-owner','snapshot'])).toBeUndefined();
   await act(async()=>vi.advanceTimersByTimeAsync(0));
   expect(snapshot.user.id).toBe('b');
   finish({private:'a'});await pending;
   expect(queryClientInstance.getQueryData(['slow-finance'])).toBeUndefined();
  } finally {vi.useRealTimers();}
 });
 it('keeps same-scope refresh data but clears it after branch reassignment',async()=>{
  mocks.me.mockResolvedValue({id:'a',restaurant_id:'r',branch_id:'one'});await mount();
  queryClientInstance.setQueryData(['finance'],{total:100});
  await act(async()=>snapshot.checkUserAuth());
  expect(queryClientInstance.getQueryData(['finance'])).toEqual({total:100});
  mocks.me.mockResolvedValue({id:'a',restaurant_id:'r',branch_id:'two'});
  await act(async()=>snapshot.checkUserAuth());
  expect(queryClientInstance.getQueryData(['finance'])).toBeUndefined();
 });
 it('clears cache on explicit logout and remote signout',async()=>{
  mocks.me.mockResolvedValue({id:'a'});await mount();
  queryClientInstance.setQueryData(['finance'],{total:100});
  await act(async()=>snapshot.logout());
  expect(queryClientInstance.getQueryData(['finance'])).toBeUndefined();
  queryClientInstance.setQueryData(['finance'],{total:200});
  await act(async()=>mocks.listener('SIGNED_OUT',null));
  expect(queryClientInstance.getQueryData(['finance'])).toBeUndefined();
 });

});
