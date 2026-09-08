// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerDisplay from './CustomerDisplay';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), create: vi.fn(), change: null }));
vi.mock('@/api/supabaseClient', () => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-public-key', supabase: { rpc: () => { throw Error('Owner client must never be used'); } } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.create }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ lang: 'en' }) }));
vi.mock('@/lib/cashierBroadcast', () => ({ subscribeCashierBroadcast: (_client, _topic, listener) => { mocks.change = listener; return () => {}; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root; let container;
const fixture = { topic: 'random-topic', business_name: 'Test supermarket', branch_name: 'Branch A', device_code: 'POS-01', currency: 'SAR', status: 'open', units: 2, subtotal: 20, tax_total: 3, net_total: 23, lines: [{ product_id: 'p', name: 'Milk', quantity: 2, unit_price: 11.5, line_total: 23 }] };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  mocks.rpc.mockResolvedValue({ data: fixture }); mocks.create.mockReturnValue({ rpc: mocks.rpc });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
async function render(token = 'a'.repeat(64)) { await act(async () => root.render(<MemoryRouter initialEntries={[`/retail/customer-display#${token}`]}><CustomerDisplay /></MemoryRouter>)); }
describe('customer display isolation and recovery', () => {
  it('uses an anonymous isolated session and shows only sale-facing fields', async () => {
    await render(); expect(mocks.create).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }) }));
    expect(container.textContent).toContain('SAR 23.00'); expect(container.textContent).toContain('Milk');
    expect(mocks.rpc).toHaveBeenCalledWith('erp_retail_customer_display', { p_token: 'a'.repeat(64) });
    expect(container.querySelectorAll('button,input')).toHaveLength(0);
  });
  it('does not query without a valid pairing token', async () => {
    await render('invalid'); expect(mocks.rpc).not.toHaveBeenCalled(); expect(container.textContent).toContain('invalid, expired');
  });
  it('clears the old sale immediately when a display link is revoked', async () => {
    await render(); mocks.rpc.mockResolvedValue({ error: { code: '42501', message: 'revoked' } });
    await act(async () => { mocks.change('changed'); await vi.advanceTimersByTimeAsync(150); });
    expect(container.textContent).not.toContain('Milk'); expect(container.textContent).toContain('pair this screen again');
  });
  it('does not leave a stale total visible during a network outage', async () => {
    await render(); mocks.rpc.mockResolvedValue({ error: { message: 'Failed to fetch' } });
    await act(async () => vi.advanceTimersByTimeAsync(13000));
    expect(container.textContent).not.toContain('SAR 23.00'); expect(container.textContent).toContain('waiting for a fresh total');
  });
});
