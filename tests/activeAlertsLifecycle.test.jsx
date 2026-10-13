import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenant: {}, channels: new Map(), removals: [], invalidate: vi.fn(),
}));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => mocks.tenant }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => client,
  useQuery: () => ({ data: [] }),
  useMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/api/supabaseClient', () => ({ supabase: {
  channel(topic) {
    if (mocks.channels.has(topic)) return mocks.channels.get(topic);
    const channel = {
      topic, subscribed: false,
      on(event, filter, callback) {
        if (this.subscribed) throw new Error('cannot add postgres_changes callbacks after subscribe()');
        this.filter = filter; this.callback = callback; return this;
      },
      subscribe() { this.subscribed = true; return this; },
    };
    mocks.channels.set(topic, channel);
    return channel;
  },
  removeChannel(channel) {
    // Keep the topic registered until async teardown finishes, as in the SDK.
    return new Promise(resolve => mocks.removals.push(() => {
      mocks.channels.delete(channel.topic); resolve('ok');
    }));
  },
} }));
import { useActiveAlerts } from '@/hooks/useActiveAlerts';
const client = { invalidateQueries: mocks.invalidate };
function Consumer() { useActiveAlerts(); return null; }
let tree;
beforeEach(() => {
  mocks.tenant = { activeRestaurant: { id: 'restaurant-a' }, isManager: false };
  mocks.channels.clear(); mocks.removals = []; mocks.invalidate.mockClear();
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  tree = null;
  mocks.removals.forEach(finish => finish());
});
describe('active alert subscription ownership', () => {
  it('opens alerts alongside the mounted dashboard without reusing a subscribed topic', () => {
    act(() => { tree = create(<><Consumer key="dashboard" /></>); });
    expect(() => act(() => tree.update(<><Consumer key="dashboard" /><Consumer key="alerts" /></>))).not.toThrow();
    const [dashboard, alerts] = [...mocks.channels.values()];
    expect(mocks.channels.size).toBe(2);
    act(() => tree.update(<><Consumer key="dashboard" /></>));
    mocks.removals.forEach(finish => finish());
    expect([...mocks.channels.values()]).toEqual([dashboard]);
    alerts.callback();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    dashboard.callback();
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['active-alerts', 'restaurant-a'] });
  });
  it('remounts safely before the previous asynchronous removal completes', () => {
    act(() => { tree = create(<Consumer />); });
    const previous = [...mocks.channels.values()][0];
    act(() => tree.unmount());
    expect(() => act(() => { tree = create(<Consumer />); })).not.toThrow();
    expect(mocks.channels.size).toBe(2);
    mocks.removals[0]();
    expect(mocks.channels.size).toBe(1);
    expect([...mocks.channels.values()][0]).not.toBe(previous);
  });
  it('cleans up the old tenant and ignores its late events', () => {
    act(() => { tree = create(<Consumer />); });
    const previous = [...mocks.channels.values()][0];
    mocks.tenant = { activeRestaurant: { id: 'restaurant-b' }, isManager: false };
    act(() => tree.update(<Consumer />));
    previous.callback();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    const current = [...mocks.channels.values()][1];
    expect(current.filter.filter).toBe('restaurant_id=eq.restaurant-b');
    current.callback();
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['active-alerts', 'restaurant-b'] });
    expect(mocks.removals).toHaveLength(1);
  });
  it('waits for a manager branch and replaces the subscription when the branch changes', () => {
    mocks.tenant.isManager = true;
    act(() => { tree = create(<Consumer />); });
    expect(mocks.channels.size).toBe(0);
    mocks.tenant.managerBranchObject = { id: 'branch-a' };
    act(() => tree.update(<Consumer />));
    const previous = [...mocks.channels.values()][0];
    mocks.tenant.managerBranchObject = { id: 'branch-b' };
    act(() => tree.update(<Consumer />));
    expect(mocks.removals).toHaveLength(1);
    expect([...mocks.channels.values()][1]).not.toBe(previous);
  });
});
