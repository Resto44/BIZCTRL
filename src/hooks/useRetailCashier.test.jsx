// @vitest-environment jsdom
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRetailCashier } from './useRetailCashier';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), subscribe: vi.fn(() => vi.fn()) }));
vi.mock('@/api/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/cashierBroadcast', () => ({ subscribeCashierBroadcast: mocks.subscribe }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let api; let root; let container; let state;
function Harness({ active = true, autoOrder = false }) { api = useRetailCashier('lane-1', 'tenant:owner', active, undefined, autoOrder); return <div>{api.snapshot?.cart?.revision}</div>; }
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks();
  state = { device: { id: 'lane-1' }, cart: { id: 'cart-1', revision: 0, lines: [] } };
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name.endsWith('_command')) { state = { ...state, cart: { ...state.cart, revision: args.p_payload.revision + 1 } }; }
    return { data: structuredClone(state), error: null };
  });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
describe('cashier mutation queue', () => {
  it('serializes rapid scans against each new server revision', async () => {
    await act(async () => root.render(<StrictMode><Harness /></StrictMode>)); await flush();
    await act(async () => { await Promise.all([api.command('scan', { code: '001' }), api.command('scan', { code: '001' }), api.command('scan', { code: '001' })]); });
    const calls = mocks.rpc.mock.calls.filter(([name]) => name.endsWith('_command'));
    expect(calls.map(([, args]) => args.p_payload.revision)).toEqual([0, 1, 2]);
    expect(new Set(calls.map(([, args]) => args.p_request_id)).size).toBe(3);
    expect(api.snapshot.cart.revision).toBe(3); expect(api.busy).toBe(0);
  });
  it('retries an interrupted payment with exactly the same id and payload', async () => {
    await act(async () => root.render(<Harness />)); await flush();
    mocks.rpc.mockImplementationOnce(async () => ({ data: null, error: { message: 'Failed to fetch' } }));
    await act(async () => { await expect(api.command('checkout', { payments: [{ payment_method: 'cash', amount: 20 }] })).rejects.toMatchObject({ message: 'Failed to fetch' }); });
    const first = mocks.rpc.mock.calls.find(([, args]) => args.p_command === 'checkout')[1];
    expect(api.pending.id).toBe(first.p_request_id); expect(sessionStorage.getItem('cashier-pending:tenant:owner:lane-1')).toContain(first.p_request_id);
    await act(async () => { await expect(api.command('scan', { code: '001' })).rejects.toThrow('previous action'); });
    await act(async () => { await api.retry(); });
    const calls = mocks.rpc.mock.calls.filter(([, args]) => args.p_command === 'checkout');
    expect(calls).toHaveLength(2); expect(calls[1][1]).toEqual(first); expect(api.pending).toBeNull();
  });
  it('does not let a late background snapshot overwrite a committed scan', async () => {
    await act(async () => root.render(<Harness />)); await flush();
    let release;
    mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    let refresh; await act(async () => { refresh = api.refresh(); });
    await act(async () => { await api.command('scan', { code: '001' }); });
    await act(async () => { release({ data: { ...state, cart: { ...state.cart, revision: 0 } }, error: null }); await refresh; });
    expect(api.snapshot.cart.revision).toBe(1);
  });
  it('rejects queued mutations when a cached workspace is inactive', async () => {
    await act(async () => root.render(<Harness active={false} />));
    await act(async () => { await expect(api.command('scan', { code: '001' })).rejects.toThrow('inactive'); });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

it('starts an order with the first food and prepares the next only after confirmed checkout', async () => {
 state = {device:{id:'lane-1'},cart:null};
 mocks.rpc.mockImplementation(async (name,args) => {
  if(args.p_command==='new_sale') state={...state,cart:{id:'next',revision:0,lines:[]}};
  if(args.p_command==='checkout') {state={...state,cart:null};return {data:{...state,receipt:{id:'paid'}},error:null};}
  return {data:structuredClone(state),error:null};
 });
 await act(async()=>root.render(<Harness autoOrder/>));await flush();
 await act(async()=>{await Promise.all([api.command('quantity',{}),api.command('quantity',{})]);});
 expect(mocks.rpc.mock.calls.filter(([,a])=>a.p_command==='new_sale')).toHaveLength(1);
 await act(async()=>{const result=await api.command('checkout',{});expect(result.receipt.id).toBe('paid');});
 expect(api.snapshot.cart.id).toBe('next');
 expect(mocks.rpc.mock.calls.filter(([,a])=>a.p_command==='new_sale')).toHaveLength(2);
});
it('recovers an uncertain checkout then retries only the interrupted next order', async () => {
 let failPayment=true, failOrder=true;
 mocks.rpc.mockImplementation(async(name,args)=>{
  if(args.p_command==='checkout') {
   if(failPayment){failPayment=false;return {error:{message:'Failed to fetch'}};}
   state={...state,cart:null};return {data:{...state,receipt:{id:'paid'}},error:null};
  }
  if(args.p_command==='new_sale') {
   if(failOrder){failOrder=false;return {error:{message:'Failed to fetch'}};}
   state={...state,cart:{id:'next',revision:0,lines:[]}};
  }
  return {data:structuredClone(state),error:null};
 });
 await act(async()=>root.render(<Harness autoOrder/>));await flush();
 await act(async()=>{await expect(api.command('checkout',{})).rejects.toThrow();});
 expect(mocks.rpc.mock.calls.filter(([,a])=>a.p_command==='new_sale')).toHaveLength(0);
 await act(async()=>{expect((await api.retry()).receipt.id).toBe('paid');});
 expect(api.pending.command).toBe('new_sale');
 const request=api.pending.id;
 await act(async()=>{await api.retry();});
 expect(api.pending).toBeNull();expect(api.snapshot.cart.id).toBe('next');
 const payments=mocks.rpc.mock.calls.filter(([,a])=>a.p_command==='checkout');
 expect(payments).toHaveLength(2);expect(payments[0][1]).toEqual(payments[1][1]);
 expect(mocks.rpc.mock.calls.filter(([,a])=>a.p_command==='new_sale').map(([,a])=>a.p_request_id)).toEqual([request,request]);
});
