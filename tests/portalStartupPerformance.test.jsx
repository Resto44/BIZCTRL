// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ supabase: mocks }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, isLoadingAuth: false }) }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ activeRestaurant: { id: 'restaurant' }, loadingRestaurants: false, loadingPortalIdentity: false }) }));
import { SubscriptionProvider, useSubscription } from '@/lib/SubscriptionContext';
let tree, state;
function Probe() { state = useSubscription(); return null; }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let snapshot, catalog, history;
beforeEach(() => {
  snapshot = deferred(); catalog = deferred(); history = deferred();
  mocks.rpc.mockReturnValue(snapshot.promise);
  mocks.from.mockImplementation(table => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
      then: (...args) => (table === 'subscription_plans' ? catalog.promise : history.promise).then(...args) };
    return query;
  });
});
afterEach(() => { if (tree) act(() => tree.unmount()); vi.clearAllMocks(); });
describe('portal startup critical path', () => {
  it('opens only after server authorization, without waiting for catalog or history', async () => {
    await act(async () => { tree = create(<SubscriptionProvider><Probe /></SubscriptionProvider>); });
    expect(state.loading).toBe(true); expect(state.isActive).toBe(false);
    await act(async () => snapshot.resolve({ data: { found: true, has_erp_access: true }, error: null }));
    expect(state.loading).toBe(false); expect(state.isActive).toBe(true);
    await act(async () => catalog.resolve({ data: [], error: null }));
    expect(state.loading).toBe(false);
    await act(async () => history.resolve({ data: [], error: null }));
    expect(state.isActive).toBe(true);
  });
  it('does not grant access when authorization fails even if the catalog is fast', async () => {
    await act(async () => { tree = create(<SubscriptionProvider><Probe /></SubscriptionProvider>); });
    await act(async () => catalog.resolve({ data: [], error: null }));
    expect(state.loading).toBe(true); expect(state.isActive).toBe(false);
    await act(async () => snapshot.resolve({ error: { message: 'Unavailable' } }));
    expect(state.loading).toBe(false); expect(state.isActive).toBe(false);
  });
});
