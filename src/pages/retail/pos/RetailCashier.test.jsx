// @vitest-environment jsdom
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RetailCashier from './RetailCashier';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), lang: 'en' }));
vi.mock('@/api/supabaseClient', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ activeRestaurant: { id: 'shop-1' } }) }));
vi.mock('@/lib/RoleContext', () => ({ useRole: () => ({ user: { id: 'user-1' }, can: { uploadSales: true } }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ lang: mocks.lang }) }));
vi.mock('@/lib/cashierBroadcast', () => ({ subscribeCashierBroadcast: () => () => {} }));
vi.mock('@/components/shared/BarcodeScanDialog', () => ({ default: () => null }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root; let container; let state; let queryClient;
const product = { id: 'product-1', name: 'Milk', name_ar: 'حليب', price: 11.5, tax_rate: 15, includes_tax: true, available: 100, unit: 'pc', sku: 'MILK-1', barcode: '0012345678905' };
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
const click = async text => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text); expect(button, text).toBeTruthy(); await act(async () => button.click()); await flush(); };
const input = async (element, value) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); }); };
beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks(); mocks.lang = 'en';
  state = { device: { id: 'lane-1', code: 'POS-01', status: 'online' }, business: { name: 'Test Shop', branch_name: 'Branch A', currency: 'SAR' }, shift: { id: 'shift-1', status: 'open', cashier_name: 'Cashier A' }, can_manage: true, held: [], receipts: [], cart: { id: 'cart-1', status: 'open', revision: 0, lines: [], subtotal: 0, tax_total: 0, net_total: 0, units: 0 } };
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: 'lane-1', code: 'POS-01', branches: { name: 'Branch A' } }] }) }) }) }));
  mocks.rpc.mockImplementation(async (name, args) => {
    if (name.endsWith('_catalog')) return { data: { rows: [product], has_more: false } };
    if (args.p_command === 'scan' || args.p_command === 'quantity') {
      const qty = args.p_command === 'scan' ? state.cart.units + 1 : args.p_payload.quantity;
      state.cart = { ...state.cart, revision: state.cart.revision + 1, units: qty, subtotal: qty * 10, tax_total: qty * 1.5, net_total: qty * 11.5, lines: [{ product_id: product.id, name: product.name, name_ar: product.name_ar, quantity: qty, unit_price: 11.5, line_total: qty * 11.5, unit: 'pc' }] };
    }
    if (args.p_command === 'checkout') {
      const receipt = { ...state.cart, id: 'sale-1', cart_id: state.cart.id, business: state.business, receipt_number: 'POS-01-SALE', transaction_type: 'sale', occurred_at: '2026-09-08T10:00:00Z', payments: args.p_payload.payments, change: 0 };
      state = { ...state, cart: null };
      return { data: { ...structuredClone(state), receipt } };
    }
    return { data: structuredClone(state) };
  });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => { await act(async () => root.unmount()); queryClient.clear(); container.remove(); });
async function render() {
  await act(async () => root.render(<StrictMode><QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/retail/cashier']}><RetailCashier /></MemoryRouter></QueryClientProvider></StrictMode>));
  await flush(); await flush();
}
describe('cashier screen integration', () => {
  it('scans with a keyboard, updates the invoice and posts a confirmed card payment', async () => {
    await render(); expect(container.textContent).toContain('Cashier workspace');
    const scan = container.querySelector('input[placeholder="Scan barcode"]');
    for (let i = 0; i < 2; i++) { await input(scan, '0012345678905'); await act(async () => scan.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await flush(); }
    expect(state.cart.units).toBe(2); expect(container.textContent).toContain('SAR 23.00');
    await click('Take payment'); await click('Mada');
    expect(document.body.textContent).toContain('does not charge the card');
    const confirm = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Confirm payment & finish sale');
    expect(confirm.disabled).toBe(true);
    await act(async () => document.querySelector('input[type="checkbox"]').click());
    await act(async () => confirm.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await flush();
    expect(document.body.textContent).toContain('Payment recorded'); expect(document.body.textContent).toContain('Print / Save PDF');
    const checkout = mocks.rpc.mock.calls.filter(([, args]) => args.p_command === 'checkout');
    expect(checkout).toHaveLength(1); expect(checkout[0][1].p_payload).toMatchObject({ cart_id: 'cart-1', revision: 2, payment_confirmed: true, payments: [{ payment_method: 'mada', amount: 23 }] });
  });
  it('renders four working tabs and opens customer pairing controls', async () => {
    await render(); await click('Held & receipts'); expect(container.textContent).toContain('Recent receipts');
    await click('Branch stock'); expect(container.textContent).toContain('Available: 100');
    await click('Shift & drawer'); expect(container.textContent).toContain('Expected cash');
    await click('Sell'); await click('Customer display'); expect(document.body.textContent).toContain('Pair display');
  });
  it('provides Arabic product names and RTL layout', async () => {
    mocks.lang = 'fa'; await render(); expect(container.textContent).toContain('صفحهٔ کاشیر'); expect(container.textContent).toContain('حليب'); expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
  });
});
