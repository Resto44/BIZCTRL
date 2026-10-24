// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ fail: '', branch: 'all' }));
vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ currency: 'SAR ', lang: 'en' }) }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ activeRestaurant: { id: 'r' }, branches: [{ id: 'b', key: 'main' }], isManager: state.branch !== 'all', managerBranch: state.branch }) }));
vi.mock('@/components/shared/PageHeader', () => ({ default: () => <h1>Balance Sheet</h1> }));
vi.mock('@/components/shared/BranchSelect', () => ({ default: () => null }));
vi.mock('@/lib/verifiedReportRead', () => ({ readTenantReportRows: async (_db, table) => {
  if (table === state.fail) throw new Error('offline');
  if (table === 'inventory') return [
    { id: 'old', product_id: 'p', branch: 'main', date: '2026-10-01', quantity: 9, unit_cost: 10 },
    { id: 'new', product_id: 'p', branch_id: 'b', date: '2026-10-24', quantity: 2, unit_cost: 10 },
    { id: 'other', product_id: 'p', branch_id: 'other', branch: 'main', date: '2026-10-24', quantity: 100, unit_cost: 10 },
  ];
  return [];
} }));
import BalanceSheet from '../src/pages/BalanceSheet';
let tree, client;
afterEach(() => { act(() => tree?.unmount()); client?.clear(); state.fail = ''; state.branch = 'all'; });
async function render() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await act(async () => { tree = create(<QueryClientProvider client={client}><BalanceSheet /></QueryClientProvider>); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return JSON.stringify(tree.toJSON());
}
describe('balance sheet verified data', () => {
  it('shows retry instead of a financial statement when a source fails', async () => {
    state.fail = 'supplier_invoices';
    const ui = await render();
    expect(ui).toContain('Data could not be loaded');
    expect(ui).not.toContain('SAR ');
    state.fail = '';
    await act(async () => { tree.root.findByType('button').props.onClick(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(JSON.stringify(tree.toJSON())).not.toContain('Data could not be loaded');
  });
  it('values only the latest inventory snapshot and honors canonical branch ID over stale text', async () => {
    state.branch = 'main';
    const ui = await render();
    expect(ui).toContain('SAR 20');
    expect(ui).not.toContain('SAR 90');
    expect(ui).not.toContain('1,020');
  });
});
