// @vitest-environment jsdom
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RealtimeClient } from '@supabase/supabase-js';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import OwnerWorkspaceTabs from '@/components/layout/OwnerWorkspaceTabs';
import RetailInventory from '@/pages/retail/inventory/RetailInventory';
import RetailInventoryRoute from '@/components/retail-inventory/RetailInventoryRoute';
import { BranchScopeProvider } from '@/lib/BranchScopeContext';
import { RetailInventoryScopeProvider } from '@/lib/RetailInventoryScopeContext';
import { EMPTY_INVENTORY, INVENTORY_PAGES } from '@/lib/retailInventory';
const state = vi.hoisted(() => ({ client: null, tenantId: 'tenant-a', value: 120, role: 'owner', lang: 'en', sessions: [] }));
vi.mock('@/lib/barcodeScanner', async (importOriginal) => ({ ...(await importOriginal()), startBarcodeCamera: vi.fn((video, events) => { const session = { stop: vi.fn(), events }; state.sessions.push(session); return session; }) }));
vi.mock('@/api/supabaseClient', () => ({ supabase: { channel: (...a) => state.client.channel(...a), removeChannel: (...a) => state.client.removeChannel(...a), rpc: (...a) => state.client.rpc(...a), from: (...a) => state.client.from(...a) } }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ activeRestaurant: { id: state.tenantId, business_type: 'retail' }, branches: [{ id: 'branch-a', name: 'Main' }, { id: 'branch-b', name: 'North' }], isBranchScoped: false }) }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner-a' } }) }));
vi.mock('@/lib/RoleContext', () => ({ ROLES: { OWNER: 'owner' }, useRole: () => ({ role: state.role, user: { id: 'owner-a' }, can: { updateInventory: true, createPurchases: true, exportPDF: true } }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ lang: state.lang, translateLiteral: (v) => v, formatMoney: (v) => `SAR ${Number(v || 0)}`, formatNumber: (v) => String(v ?? ''), formatDate: (v) => String(v ?? '') }) }));
vi.mock('@/components/layout/ERPSidebar', () => ({ ERP_NAV_GROUPS: [{ items: [{ path: '/inventory', label: 'Inventory overview' }, { path: '/inventory/stock', label: 'Stock & availability' }, { path: '/inventory/operations', label: 'Stock operations' }, { path: '/inventory/control', label: 'Inventory assurance' }] }] }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, cache, realtime;
const visible = () => [...container.querySelectorAll('[data-inventory-page]')].find((el) => !el.closest('[hidden]'));
async function click(el) { expect(el).toBeTruthy(); await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))); await act(async () => vi.advanceTimersByTimeAsync(2)); }
async function render() { await act(async () => root.render(<StrictMode><QueryClientProvider client={cache}><MemoryRouter initialEntries={['/inventory']}><BranchScopeProvider><RetailInventoryScopeProvider><Link to="/retail/barcode">Master Scan</Link><Routes><Route element={<OwnerWorkspaceTabs />}>{INVENTORY_PAGES.map((p) => <Route key={p.key} path={p.path} element={<RetailInventory page={p.key} />} />)}<Route path="/retail/barcode" element={<RetailInventoryRoute page="stock" scanOnOpen />} /></Route></Routes></RetailInventoryScopeProvider></BranchScopeProvider></MemoryRouter></QueryClientProvider></StrictMode>)); await act(async () => vi.advanceTimersByTimeAsync(2)); }
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); state.tenantId = 'tenant-a'; state.value = 120; state.role = 'owner'; state.lang = 'en'; state.sessions = [];
  realtime = new RealtimeClient('ws://realtime.invalid/socket', { params: { apikey: 'test-only' } }); vi.spyOn(realtime, 'connect').mockImplementation(() => {});
  const queryBuilder = () => { const q = new Proxy({}, { get: (_, prop) => prop === 'then' ? (resolve) => resolve({ data: [], count: 0, error: null }) : () => q }); return q; };
  state.client = {
    channel: vi.fn((...args) => realtime.channel(...args)), removeChannel: vi.fn((channel) => realtime.removeChannel(channel)), from: vi.fn(queryBuilder),
    rpc: vi.fn(async (name) => ({ error: null, data: name === 'erp_retail_inventory_snapshot' ? { ...EMPTY_INVENTORY, summary: { stock_value: state.value, stock_rows: 1, tracked_skus: 1 }, warehouses: [{ id: 'warehouse-a', branch_id: 'branch-a', name: 'Main store', is_default: true }], branches: [{ id: 'branch-a', name: 'Main', item_count: 1, stock_value: state.value, low_count: 0 }] } : { total: 0, rows: [] } })),
  };
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }); container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); for (const c of realtime.getChannels()) c.teardown(); cache.clear(); vi.clearAllTimers(); vi.useRealTimers(); container.remove(); });
describe('Retail inventory cached navigation', () => {
  it('opens the actual scanner from the catalog route on every visit and searches within the selected branch', async () => {
    await render();
    const select = visible().querySelector('select');
    await act(async () => { select.value = 'branch-b'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(container.querySelector('a[href="/retail/barcode"]'));
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Scan barcode');
    const first = state.sessions.at(-1);
    await act(async () => first.events.onResult('000742'));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(first.stop).toHaveBeenCalled();
    expect(visible().querySelector('input').value).toBe('000742');
    expect(state.client.rpc).toHaveBeenCalledWith('erp_retail_inventory_stock', expect.objectContaining({ p_restaurant_id: 'tenant-a', p_branch_id: 'branch-b', p_query: '000742', p_filter: 'all' }));
    await click(container.querySelector('a[href="/retail/barcode"]'));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(state.sessions.at(-1)).not.toBe(first);
    const second = state.sessions.at(-1);
    await click(visible().querySelector('a[href="/inventory/operations"]'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(second.stop).toHaveBeenCalled();
    expect(realtime.getChannels()).toHaveLength(1);
  });
  it('opens barcode creation from inventory and closes it when navigating cached pages', async () => {
    await render();
    await click([...visible().querySelectorAll('button')].find((el) => el.textContent === 'Create Barcode'));
    expect(document.querySelector('[role=dialog]').textContent).toContain('Choose a product');
    expect(state.client.rpc).toHaveBeenCalledWith('erp_search_master_products', expect.objectContaining({ p_restaurant_id: 'tenant-a', p_branch_id: null }));
    await click(visible().querySelector('a[href="/inventory/stock"]'));
    expect(document.querySelector('[role=dialog]')).toBeNull();
    await click([...visible().querySelectorAll('button')].find((el) => el.textContent === 'Create Barcode'));
    expect(document.querySelector('[role=dialog]').textContent).toContain('Create Barcode');
    expect(realtime.getChannels()).toHaveLength(1);
  });
  it('opens Scan / search directly on an already cached stock screen', async () => {
    await render(); await click(visible().querySelector('a[href="/inventory/stock"]'));
    await click([...visible().querySelectorAll('button')].find((el) => el.textContent === 'Scan / search'));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    await act(async () => state.sessions.at(-1).events.onResult('000998'));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(visible().querySelector('input').value).toBe('000998');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('mounts all four real screens under StrictMode without re-binding a subscribed SDK channel', async () => {
    await render();
    for (const page of ['stock', 'operations', 'control', 'overview', 'stock']) {
      await click(visible().querySelector(`a[href="${INVENTORY_PAGES.find((p) => p.key === page).path}"]`));
      expect(visible().dataset.inventoryPage).toBe(page);
      expect(container.textContent).not.toContain('This page failed to load');
      expect(container.querySelector('[role="alert"]')).toBeNull();
    }
    expect(container.querySelectorAll('[data-inventory-page]')).toHaveLength(4);
    const active = realtime.getChannels(); expect(active).toHaveLength(1);
    expect(active[0].bindings.postgres_changes).toHaveLength(9);
    await click(visible().querySelector('a[href="/inventory"]'));
    expect(visible().textContent).toContain('SAR 120');
    state.value = 95;
    await act(async () => { active[0].bindings.postgres_changes[0].callback({ new: { restaurant_id: 'tenant-a' } }); await vi.advanceTimersByTimeAsync(605); });
    await act(async () => vi.advanceTimersByTimeAsync(5));
    expect(visible().textContent).toContain('SAR 95');
  });
  it('renders Persian navigation and owner forms with RTL direction', async () => {
    state.lang = 'fa'; await render();
    expect(visible().getAttribute('dir')).toBe('rtl');
    expect(visible().textContent).toContain('کنترل انوتری');
    await click([...visible().querySelectorAll('button')].find((el) => el.textContent === 'دریافت خرید'));
    expect(document.querySelector('[role=dialog]')).toBeTruthy();
    expect(document.querySelector('[role=dialog] form').getAttribute('dir')).toBe('rtl');
    expect(document.querySelector('[role=dialog]').textContent).toContain('تأمین‌کننده');
  });
  it('shares branch scope across cached screens and sends it to stock queries', async () => {
    await render(); await click(visible().querySelector('a[href="/inventory/stock"]'));
    const select = visible().querySelector('select');
    await act(async () => { select.value = 'branch-b'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => vi.advanceTimersByTimeAsync(5));
    expect(state.client.rpc).toHaveBeenCalledWith('erp_retail_inventory_stock', expect.objectContaining({ p_branch_id: 'branch-b', p_warehouse_id: null }));
    await click(visible().querySelector('a[href="/inventory/operations"]'));
    expect(visible().querySelector('select').value).toBe('branch-b');
    expect(realtime.getChannels()).toHaveLength(1);
  });
});
