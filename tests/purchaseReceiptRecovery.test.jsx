// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { receiptRecoveryKey, readPendingReceipt, hasPendingReceipt } from '../src/lib/purchaseReceiptRecovery';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invalidateQueries: vi.fn().mockResolvedValue(), user: { id: 'owner' } }));
vi.mock('@/api/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mocks }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ lang: 'en' }) }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ activeRestaurant: { id: 'tenant' } }) }));
vi.mock('@/lib/productImportAccess', () => ({ isSupermarketProductPortal: () => false }));
vi.mock('@/hooks/useRetailInventory', () => ({ useRetailInventory: () => ({}) }));
vi.mock('@/components/retail-inventory/InventoryDocumentForm', () => ({ default: () => null }));
vi.mock('@/components/retail-inventory/InventoryDocumentDetail', () => ({ default: () => null }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: ({children}) => <div>{children}</div>, DialogContent: ({children}) => <div>{children}</div>, DialogHeader: ({children}) => <div>{children}</div>, DialogTitle: ({children}) => <h2>{children}</h2> }));
import ReceiveOrderDialog from '../src/components/purchase-orders/ReceiveOrderDialog';
const order = { id: 'order', restaurant_id: 'tenant', branch_id: 'branch', status: 'sent', items: [{ product_id: 'product', qty: 10 }] };
const key = receiptRecoveryKey('owner', order);
let tree, progress, receiptResult, close;
const pending = () => ({p_order_id:'order',p_request_id:'original-request',p_receipt_date:'2026-11-19',p_items:[{line_index:0,received_qty:4}]});
const mount = async () => act(async () => { tree = create(<ReceiveOrderDialog order={order} open onClose={close} />); });
const button = () => tree.root.findAllByType('button').find(b => /Confirm|Retry/.test(String(b.props.children)));
const submit = async () => act(async () => { await button().props.onClick(); });
const posts = () => mocks.rpc.mock.calls.filter(([name]) => name === 'erp_receive_purchase_order');
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); close = vi.fn();
  progress = { id: 'order', lines: [{line_index:0,ordered_qty:10,received_qty:0,remaining_qty:10}], legacy_partial:false };
  receiptResult = { data: {receipt_id:'receipt'} };
  mocks.rpc.mockImplementation((name) => ({abortSignal: () => Promise.resolve(name === 'erp_purchase_order_receipt_progress' ? {data:progress} : receiptResult)}));
});
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; vi.restoreAllMocks(); });
describe('purchase receipt recovery', () => {
  it('persists before posting and replays the exact payload after a lost response and remount', async () => {
    receiptResult = {error: {message:'Gateway response lost'}};
    await mount();
    act(() => tree.root.findByProps({type:'number'}).props.onChange({target:{value:'4'}}));
    await submit();
    const original = posts()[0][1];
    expect(readPendingReceipt(key,order.id)).toEqual(original);
    expect(close).not.toHaveBeenCalled();
    act(() => tree.unmount());
    progress.lines[0] = {line_index:0,ordered_qty:10,received_qty:10,remaining_qty:0};
    await mount();
    expect(tree.root.findByProps({type:'number'}).props.value).toBe('4');
    expect(tree.root.findByProps({type:'number'}).props.disabled).toBe(true);
    receiptResult = {data:{receipt_id:'receipt',already_processed:true}};
    await submit();
    expect(posts()[1][1]).toEqual(original);
    expect(localStorage.getItem(key)).toBe(null);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('allows replay when progress read is unavailable and prevents same-tick duplicate submits', async () => {
    localStorage.setItem(key,JSON.stringify(pending()));
    mocks.rpc.mockImplementation(name => ({abortSignal: () => Promise.resolve(name === 'erp_purchase_order_receipt_progress' ? {error: new Error('offline')} : receiptResult)}));
    await mount();
    expect(button().props.disabled).toBe(false);
    await act(async () => { const click = button().props.onClick; await Promise.all([click(),click()]); });
    expect(posts()).toHaveLength(1);
    expect(posts()[0][1]).toEqual(pending());
  });
  it('clears only explicit transaction rejections and allows correction', async () => {
    receiptResult = {error:{code:'23514',message:'PO_RECEIPT_EXCEEDS_REMAINING_QUANTITY'}};
    await mount(); await submit();
    expect(localStorage.getItem(key)).toBe(null);
    expect(tree.root.findByProps({type:'number'}).props.disabled).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });
  it('retains the payload for malformed success responses', async () => {
    receiptResult = {data:{}};
    await mount(); await submit();
    expect(readPendingReceipt(key,order.id)).toEqual(posts()[0][1]);
    expect(tree.root.findByProps({type:'number'}).props.disabled).toBe(true);
  });
  it('blocks a new write if browser persistence fails', async () => {
    await mount();
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => {throw new Error('quota');});
    await submit(); expect(posts()).toHaveLength(0);
    expect(button().props.disabled).toBe(true);
  });
  it('fails closed on corrupt saved data rather than forgetting it', async () => {
    localStorage.setItem(key,'broken'); await mount();
    expect(button().props.disabled).toBe(true); expect(posts()).toHaveLength(0);
    expect(localStorage.getItem(key)).toBe('broken');
  });
  it('isolates recovery by user, tenant, branch and order, including completed orders', () => {
    localStorage.setItem(key,JSON.stringify(pending()));
    expect(hasPendingReceipt('owner',{...order,status:'received'})).toBe(true);
    expect(hasPendingReceipt('other',order)).toBe(false);
    for (const field of ['id','restaurant_id','branch_id']) expect(hasPendingReceipt('owner',{...order,[field]:'other'})).toBe(false);
  });
  it('does not misreport successful receipt when query refresh fails', async () => {
    mocks.invalidateQueries.mockRejectedValueOnce(new Error('refresh failed'));
    await mount(); await submit();
    expect(close).toHaveBeenCalledTimes(1); expect(localStorage.getItem(key)).toBe(null);
  });
});

import PurchaseOrderDetail from '../src/components/purchase-orders/PurchaseOrderDetail';
it.each([false, true])('shows purchase order lines from both JSONB and legacy JSON strings (encoded=%s)', async encoded => {
  const items = [{product_id:'rice',product_name:'Rice',qty:2,unit:'kg',unit_price:5}];
  await act(async () => {tree = create(<PurchaseOrderDetail order={{...order,items:encoded ? JSON.stringify(items) : items,total_amount:10}} onBack={()=>{}} />);});
  expect(JSON.stringify(tree.toJSON())).toContain('Rice');
});
