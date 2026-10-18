// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ channels: [], removeChannel: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ supabase: {
  channel(name) {
    const c = { name, handlers: {}, on(_, filter, callback) { this.handlers[filter.table] = { filter, callback }; return this; }, subscribe(callback) { this.status = callback; return this; } };
    mock.channels.push(c); return c;
  }, removeChannel: mock.removeChannel,
} }));
import { useOwnerDashboardRealtime } from '@/hooks/useOwnerDashboardRealtime';
let tree, client;
const readers = {};
function Probe({ tenant }) {
  useOwnerDashboardRealtime(tenant);
  for (const prefix of ['sales_report_period', 'expenses_report_period', 'supplier_invoices']) {
    // The fixed list has stable order across renders.
    useQuery({ queryKey: [prefix, tenant, 'branch'], queryFn: readers[prefix], staleTime: Infinity });
  }
  return null;
}
async function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const prefix of ['sales_report_period', 'expenses_report_period', 'supplier_invoices']) readers[prefix] = vi.fn().mockResolvedValue([]);
  await act(async () => { tree = create(<QueryClientProvider client={client}><Probe tenant="restaurant-a" /></QueryClientProvider>); });
}
afterEach(() => { if (tree) act(() => tree.unmount()); client?.clear(); mock.channels.length = 0; vi.clearAllMocks(); vi.useRealTimers(); });
describe('owner dashboard manager record synchronization', () => {
  it('refetches current sales, expenses and invoices on remote events without manual refresh', async () => {
    await mount(); const channel = mock.channels.at(-1);
    for (const [table, key] of [['daily_sales','sales_report_period'], ['expenses','expenses_report_period'], ['supplier_invoices','supplier_invoices']]) {
      expect(channel.handlers[table].filter.filter).toBe('restaurant_id=eq.restaurant-a');
      const count = readers[key].mock.calls.length;
      await act(async () => channel.handlers[table].callback({ eventType: 'INSERT', new: { id: 'manager-record' } }));
      expect(readers[key].mock.calls.length).toBe(count + 1);
    }
  });
  it('recovers on reconnect and timer without invalidating another restaurant', async () => {
    vi.useFakeTimers(); await mount();
    client.setQueryData(['sales_report_period','restaurant-b','branch'], [{ id:'other' }]);
    const count = readers.sales_report_period.mock.calls.length;
    await act(async () => mock.channels.at(-1).status('SUBSCRIBED'));
    expect(readers.sales_report_period.mock.calls.length).toBe(count + 1);
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(readers.sales_report_period.mock.calls.length).toBe(count + 2);
    expect(client.getQueryState(['sales_report_period','restaurant-b','branch']).isInvalidated).toBe(false);
  });
  it('ignores events from disposed channels and removes timers on unmount', async () => {
    vi.useFakeTimers(); await mount(); const channel = mock.channels.at(-1);
    act(() => tree.unmount()); tree = null;
    const count = readers.sales_report_period.mock.calls.length;
    await act(async () => { channel.handlers.daily_sales.callback({ eventType:'UPDATE', new:{} }); await vi.advanceTimersByTimeAsync(30000); });
    expect(readers.sales_report_period.mock.calls.length).toBe(count);
    expect(mock.removeChannel).toHaveBeenCalledWith(channel);
  });
});
