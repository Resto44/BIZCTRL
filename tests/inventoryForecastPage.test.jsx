// @vitest-environment jsdom
import React from 'react';
import { create, act } from 'react-test-renderer';
import { afterEach, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ query: {}, options: null, inventory: vi.fn(), read: vi.fn(), retry: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: options => { state.options = options; return { ...state.query, refetch: state.retry }; } }));
vi.mock('@/api/base44Client', () => ({ base44: { entities: { Inventory: { filter: state.inventory } } } }));
vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/lib/reportStockConsumption', () => ({ fetchReportStockConsumption: state.read }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ lang: 'en', t: x => x }) }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ activeRestaurant: { id: 'tenant' }, branches: [{ id: 'branch', key: 'key', name: 'Branch' }] }) }));
vi.mock('@/lib/BranchScopeContext', () => ({ useBranchScope: () => ({ selectedBranchId: 'branch', selectedBranchKey: 'key', isAllBranches: false, setSelectedBranchId: vi.fn() }) }));
vi.mock('@/components/shared/PageHeader', () => ({ default: () => <h1>Forecast</h1> }));
vi.mock('@/components/shared/BranchSelect', () => ({ default: () => <div>Branch</div> }));
vi.mock('@/components/ui/select', () => { const Part = ({children}) => <div>{children}</div>; return { Select: Part, SelectContent: Part, SelectItem: Part, SelectTrigger: Part, SelectValue: Part }; });
import InventoryForecast from '@/pages/InventoryForecast';
let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); state.query = {}; vi.clearAllMocks(); });
it('blocks stale suggestions on read failure and offers retry', () => {
 state.query = { isError: true, data: { inventory: [], consumption: [] } };
 act(() => { tree = create(<InventoryForecast />); });
 expect(tree.root.findAll(n => n.type === 'div' && n.props.role === 'alert')).toHaveLength(1);
 expect(JSON.stringify(tree.toJSON())).not.toContain('no_data');
 act(() => tree.root.findAllByType('button').find(b => b.children.includes('Retry')).props.onClick());
 expect(state.retry).toHaveBeenCalledTimes(1);
});
it('requests matching canonical tenant and branch scopes and rejects truncated inventory', async () => {
 state.query = { isLoading: true };
 act(() => { tree = create(<InventoryForecast />); });
 expect(tree.root.findAllByProps({role:'status'})).toHaveLength(1);
 state.inventory.mockResolvedValue(Array(2001).fill({})); state.read.mockResolvedValue([]);
 await expect(state.options.queryFn()).rejects.toThrow('INVENTORY_ROW_LIMIT');
 expect(state.inventory).toHaveBeenCalledWith({restaurant_id:'tenant',branch_id:'branch'}, '-date', 2001);
 expect(state.read).toHaveBeenCalledWith(expect.objectContaining({restaurantId:'tenant',branchId:'branch'}));
});
