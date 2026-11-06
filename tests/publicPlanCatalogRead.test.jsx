// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: () => query, order: () => mocks.read() };
  return query;
} } }));
import { usePublicPlanCatalog } from '@/lib/usePublicPlanCatalog';
let current, tree;
function Harness() { current = usePublicPlanCatalog(); return <div>{current.status}</div>; }
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; vi.useRealTimers(); mocks.read.mockReset(); });
describe('public plan catalog read recovery', () => {
  it('keeps loading visible until verified prices arrive', async () => {
    let resolve;
    mocks.read.mockReturnValue(new Promise(done => { resolve = done; }));
    await act(async () => { tree = create(<Harness />); });
    expect(current.status).toBe('loading');
    await act(async () => { resolve({ data: [{ id: 'starter_20', monthly_price_cents: 1000 }], error: null }); });
    expect(current.status).toBe('ready');
    expect(current.plans[0].monthly_price_cents).toBe(1000);
  });
  it('surfaces a denied read and retries without inventing prices', async () => {
    mocks.read.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
      .mockResolvedValueOnce({ data: [{ id: 'growth_40' }], error: null });
    await act(async () => { tree = create(<Harness />); });
    expect(current.status).toBe('error');
    expect(current.plans).toEqual([]);
    await act(async () => current.retry());
    expect(current.status).toBe('ready');
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it('distinguishes an empty catalog from a network error', async () => {
    mocks.read.mockResolvedValue({ data: [], error: null });
    await act(async () => { tree = create(<Harness />); });
    expect(current.status).toBe('empty');
  });
  it('times out and ignores a stale response after a successful retry', async () => {
    vi.useFakeTimers();
    let resolve;
    mocks.read.mockReturnValueOnce(new Promise(done => { resolve = done; }))
      .mockResolvedValueOnce({ data: [{ id: 'current' }], error: null });
    await act(async () => { tree = create(<Harness />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(current.status).toBe('error');
    await act(async () => current.retry());
    await act(async () => resolve({ data: [{ id: 'stale' }], error: null }));
    expect(current.status).toBe('ready');
    expect(current.plans).toEqual([{ id: 'current' }]);
  });
});
