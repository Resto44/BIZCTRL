// @vitest-environment jsdom

import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RealtimeClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OwnerWorkspaceTabs from '@/components/layout/OwnerWorkspaceTabs';
import POSExecutiveDashboard from '@/pages/retail/pos/POSExecutiveDashboard';
import POSBranchDevices from '@/pages/retail/pos/POSBranchDevices';
import POSTerminalAccount from '@/pages/retail/pos/POSTerminalAccount';
import POSAuditCenter from '@/pages/retail/pos/POSAuditCenter';
import { useRetailPOSControl } from '@/hooks/useRetailPOSControl';

const state = vi.hoisted(() => ({ client: null, tenantId: 'tenant-a' }));
vi.mock('@/api/supabaseClient', () => ({ supabase: {
  channel: (...args) => state.client.channel(...args),
  removeChannel: (...args) => state.client.removeChannel(...args),
  rpc: (...args) => state.client.rpc(...args),
  from: (...args) => state.client.from(...args),
} }));
vi.mock('@/lib/TenantContext', () => ({
  useTenant: () => ({ activeRestaurant: { id: state.tenantId }, branches: [] }),
}));
vi.mock('@/lib/RoleContext', () => ({ ROLES: { OWNER: 'owner' }, useRole: () => ({ role: 'owner' }) }));
vi.mock('@/components/layout/ERPSidebar', () => ({ ERP_NAV_GROUPS: [{ items: [
  { path: '/retail/pos-control', label: 'POS dashboard' },
  { path: '/retail/pos-branches', label: 'Branches & POS' },
  { path: '/retail/pos-device', label: 'Device account' },
  { path: '/retail/pos-audit', label: 'Audit & alerts' },
] }] }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({
  lang: 'en', translateLiteral: (value) => value,
  formatMoney: (value) => `SAR ${Number(value || 0)}`,
  formatNumber: (value) => String(Number(value || 0)),
  formatDate: (value) => String(value || ''),
}) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, queryClient, realtime;

function Probe({ name = 'probe' }) {
  const control = useRetailPOSControl();
  return <output data-probe={name}>{control.realtimeStatus}|{control.lastEventAt?.toISOString() || ''}|{control.snapshot.summary.net_sales}</output>;
}

async function render(children) {
  await act(async () => root.render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>));
  await act(async () => vi.advanceTimersByTimeAsync(1));
}

async function click(element) {
  expect(element).toBeTruthy();
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  await act(async () => element.dispatchEvent(event));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.tenantId = 'tenant-a';
  realtime = new RealtimeClient('ws://realtime.invalid/socket', { params: { apikey: 'test-only' } });
  // Keep the real SDK channel registry, binding checks and lifecycle. No network is opened.
  vi.spyOn(realtime, 'connect').mockImplementation(() => {});
  state.client = {
    channel: vi.fn((...args) => {
      const channel = realtime.channel(...args);
      if (!vi.isMockFunction(channel.subscribe)) vi.spyOn(channel, 'subscribe');
      return channel;
    }),
    removeChannel: vi.fn((channel) => realtime.removeChannel(channel)),
    rpc: vi.fn(async () => ({ data: { summary: { net_sales: 125 } }, error: null })),
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) })),
  };
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  for (const channel of realtime.getChannels()) channel.teardown();
  realtime.disconnect();
  queryClient.clear();
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Retail POS shared subscription and owner tab navigation', () => {
  it('mounts all four consumers without adding bindings to an already subscribed SDK channel', async () => {
    await render(<Probe name="executive" />);
    await render(<><Probe name="executive" /><Probe name="branches" /><Probe name="device" /><Probe name="audit" /></>);
    expect(container.querySelectorAll('[data-probe]')).toHaveLength(4);
    expect(state.client.channel).toHaveBeenCalledTimes(1);
    expect(state.client.rpc).toHaveBeenCalledTimes(1);
    expect(state.client.removeChannel).not.toHaveBeenCalled();
  });

  it('opens and revisits all four real pages inside cached owner tabs without document reloads', async () => {
    const devices = Array.from({ length: 10 }, (_, index) => ({
      id: `device-${index + 1}`, branch_id: 'branch-1',
      code: `POS-${String(index + 1).padStart(2, '0')}`, status: 'offline',
    }));
    state.client.rpc.mockImplementation(async (_name, params) => ({ data: {
      summary: { branch_count: 1, device_count: 10, net_sales: 125 },
      branches: [{ id: 'branch-1', name: 'Main supermarket', device_count: 10 }],
      devices: params.p_device_id ? devices.filter((device) => device.id === params.p_device_id) : devices,
    }, error: null }));
    state.client.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ order: async () => ({ data: devices, error: null }) }) }) }));
    await render(<MemoryRouter initialEntries={['/retail/pos-control']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route element={<OwnerWorkspaceTabs />}>
        <Route path="/owner-command-center" element={<p>Owner dashboard</p>} />
        <Route path="/retail/pos-control" element={<POSExecutiveDashboard />} />
        <Route path="/retail/pos-branches" element={<POSBranchDevices />} />
        <Route path="/retail/pos-device" element={<POSTerminalAccount />} />
        <Route path="/retail/pos-audit" element={<POSAuditCenter />} />
      </Route></Routes>
    </MemoryRouter>);

    for (let pass = 0; pass < 3; pass += 1) {
      for (const path of ['/retail/pos-branches', '/retail/pos-device', '/retail/pos-audit', '/retail/pos-control']) {
        const active = container.querySelector('[data-owner-workspace-page]:not([hidden])');
        const event = await click(active.querySelector(`nav[aria-label="Retail POS control pages"] a[href="${path}"]`));
        expect(event.defaultPrevented).toBe(true);
        expect(container.querySelector('[data-owner-workspace-page]:not([hidden])').dataset.ownerWorkspacePage).toBe(path);
      }
    }
    expect(container.querySelectorAll('[data-owner-workspace-page^="/retail/pos-"]')).toHaveLength(4);
    expect(state.client.channel).toHaveBeenCalledTimes(1);
    // One shared overview query and one device-specific query; cached visits reuse both.
    expect(state.client.rpc).toHaveBeenCalledTimes(2);
    expect(state.client.rpc).toHaveBeenCalledWith('erp_retail_pos_control_snapshot', expect.objectContaining({ p_device_id: 'device-1' }));
    await click(container.querySelector('[aria-label="Close Branches & POS tab"]'));
    expect(state.client.removeChannel).not.toHaveBeenCalled();
    const active = container.querySelector('[data-owner-workspace-page]:not([hidden])');
    await click(active.querySelector('a[href="/retail/pos-branches"]'));
    expect(state.client.channel).toHaveBeenCalledTimes(1);
  });

  it('shares live status and batches transaction updates, keeping the channel until the last page closes', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await render(<><Probe name="executive" /><Probe name="branches" /></>);
    const channel = realtime.getChannels()[0];
    const status = channel.subscribe.mock.calls[0][0];
    const bindings = channel.bindings.postgres_changes;
    expect(bindings.map(({ filter }) => filter.table)).toEqual(expect.arrayContaining([
      'retail_pos_devices', 'retail_pos_shifts', 'retail_pos_transactions',
      'retail_pos_device_events', 'retail_pos_approval_requests', 'retail_pos_device_commands',
    ]));
    expect(bindings).toHaveLength(6);
    expect(bindings.every(({ filter }) => filter.filter === 'restaurant_id=eq.tenant-a')).toBe(true);
    await act(async () => status('SUBSCRIBED'));
    expect([...container.querySelectorAll('output')].every((element) => element.textContent.startsWith('SUBSCRIBED|'))).toBe(true);
    // The SDK's registered callbacks receive a burst of change notifications.
    await act(async () => bindings.forEach(({ callback }) => callback({ eventType: 'INSERT' })));
    const timestamps = [...container.querySelectorAll('output')].map((element) => element.textContent.split('|')[1]);
    expect(timestamps[0]).toBeTruthy();
    expect(timestamps[0]).toBe(timestamps[1]);
    await act(async () => vi.advanceTimersByTimeAsync(599));
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(2));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['retail-pos-control', 'tenant-a'], exact: false });
    expect(state.client.rpc).toHaveBeenCalledTimes(2);

    await render(<Probe name="executive" />);
    expect(state.client.removeChannel).not.toHaveBeenCalled();
    await act(async () => status('CHANNEL_ERROR'));
    expect(container.textContent).toContain('CHANNEL_ERROR|');
    await act(async () => status('SUBSCRIBED'));
    await act(async () => bindings[0].callback({ eventType: 'UPDATE' }));
    await render(null);
    expect(state.client.removeChannel).toHaveBeenCalledTimes(1);
    expect(state.client.removeChannel).toHaveBeenCalledWith(channel);
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('survives StrictMode remounts while a previous unsubscribe is still pending', async () => {
    let finishRemoval;
    state.client.removeChannel.mockImplementationOnce(() => new Promise((resolve) => { finishRemoval = resolve; }));
    await render(<StrictMode><Probe /></StrictMode>);
    const [oldChannel, currentChannel] = state.client.channel.mock.results.map(({ value }) => value);
    expect(state.client.channel).toHaveBeenCalledTimes(2);
    expect(oldChannel.topic).not.toBe(currentChannel.topic);
    expect(realtime.getChannels()).toContain(oldChannel);
    expect(realtime.getChannels()).toContain(currentChannel);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await act(async () => {
      oldChannel.subscribe.mock.calls[0][0]('SUBSCRIBED');
      oldChannel.bindings.postgres_changes[0].callback({ eventType: 'INSERT' });
      finishRemoval('ok');
    });
    expect(container.textContent).toBe('CONNECTING||125');
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(invalidate).not.toHaveBeenCalled();
    await act(async () => currentChannel.subscribe.mock.calls[0][0]('SUBSCRIBED'));
    expect(container.textContent).toBe('SUBSCRIBED||125');
  });

  it('releases the previous tenant and rejects its late events after switching supermarkets', async () => {
    await render(<Probe />);
    const oldChannel = realtime.getChannels()[0];
    state.tenantId = 'tenant-b';
    await render(<Probe />);
    const newChannel = state.client.channel.mock.results[1].value;
    expect(state.client.removeChannel).toHaveBeenCalledWith(oldChannel);
    expect(newChannel.bindings.postgres_changes.every(({ filter }) => filter.filter === 'restaurant_id=eq.tenant-b')).toBe(true);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await act(async () => {
      oldChannel.subscribe.mock.calls[0][0]('SUBSCRIBED');
      oldChannel.bindings.postgres_changes[0].callback({ eventType: 'INSERT' });
    });
    expect(container.textContent).toBe('CONNECTING||125');
    await act(async () => newChannel.bindings.postgres_changes[0].callback({ eventType: 'INSERT' }));
    await act(async () => vi.advanceTimersByTimeAsync(601));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['retail-pos-control', 'tenant-b'], exact: false });
  });

  it('keeps the snapshot and polling usable when realtime cannot start', async () => {
    const error = new Error('Realtime transport unavailable');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.client.channel.mockImplementationOnce(() => { throw error; });
    await render(<Probe />);
    expect(container.textContent).toBe('CHANNEL_ERROR||125');
    expect(log).toHaveBeenCalledWith('[Retail POS] Realtime subscription failed', error);
    state.client.rpc.mockResolvedValue({ data: { summary: { net_sales: 250 } }, error: null });
    await act(async () => vi.advanceTimersByTimeAsync(60_001));
    expect(state.client.rpc).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('CHANNEL_ERROR||250');
  });
});
