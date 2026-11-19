// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { parsePlatformIntegritySnapshot } from '../src/lib/platformIntegritySnapshot';
const api = vi.hoisted(() => ({ erpIntegritySnapshot: vi.fn() }));
vi.mock('@/lib/platformOwnerApi', () => ({ platformOwnerApi: api }));
import PlatformERPIntegrity from '../src/components/platform-owner/PlatformERPIntegrity';
const snapshot = () => ({
  read_only: true, scope: 'platform_owner_only', financial_changes: 0,
  generated_at: '2026-11-19T10:00:00Z', groups: [
    { key: 'sales', total: 10, alerts: 0, negative_amounts: 2 },
    { key: 'supplier_invoices', total: 20, alerts: 0, overpaid: 0, missing_organization: 0 },
    { key: 'daily_sales', total: 30, alerts: 3, missing_branch_id: 3, legacy_branch_name: 2, recent_missing_branch_id: 1 },
    { key: 'branch_references', total: null, alerts: 1 },
    { key: 'rls', total: 400, alerts: 0 },
  ],
});
describe('Platform integrity reporting', () => {
  it('includes negative-only sales findings without double counting legacy branch subsets or tables', () => {
    const parsed = parsePlatformIntegritySnapshot(snapshot());
    expect(parsed.groups[0].findings).toBe(2);
    expect(parsed.flags).toBe(6);
    expect(parsed.records).toBe(60);
    expect(parsed.tables).toBe(400);
  });
  it.each([null, {}, { ...snapshot(), groups: [] }, { ...snapshot(), generated_at: 'invalid' }, { ...snapshot(), read_only: false }])('rejects unavailable or incomplete results: %j', data => {
    expect(() => parsePlatformIntegritySnapshot(data)).toThrow('INVALID_PLATFORM_INTEGRITY_SNAPSHOT');
  });
  it.each([null, undefined, -1, NaN, Infinity, '', '0', false, 0.5])('rejects invalid counters %s', value => {
    const data = snapshot(); data.groups[0].negative_amounts = value;
    expect(() => parsePlatformIntegritySnapshot(data)).toThrow();
  });
  it('rejects duplicate groups instead of hiding a missing check', () => {
    const data = snapshot(); data.groups[4] = data.groups[0];
    expect(() => parsePlatformIntegritySnapshot(data)).toThrow();
  });
  it('renders an error on malformed success, then recovers after a valid retry', async () => {
    api.erpIntegritySnapshot.mockResolvedValueOnce({ groups: [] }).mockResolvedValueOnce(snapshot());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    let tree;
    const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    try {
      await act(async () => { tree = create(<QueryClientProvider client={client}><PlatformERPIntegrity /></QueryClientProvider>); });
      await settle();
      expect(tree.root.findAllByProps({ role: 'alert' })).toHaveLength(1);
      expect(tree.root.findAllByType('section')).toHaveLength(0);
      await act(async () => tree.root.findByType('button').props.onClick());
      await settle();
      expect(tree.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
      const sales = tree.root.findAllByType('section')[0];
      expect(JSON.stringify(tree.toJSON())).toContain('Financial records scanned');
      expect(sales.findAllByProps({ 'aria-label': 'Review flags: 2' })).toHaveLength(1);
      expect(sales.findAllByProps({ 'aria-label': 'No flags detected' })).toHaveLength(0);
    } finally { if (tree) tree.unmount(); client.clear(); }
  });
});
