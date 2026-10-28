// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/restaurantPOS',()=>({restaurantRpc:rpc,restaurantBusinessDate:()=> '2026-10-28',isRestaurantPOSPortal:r=>r?.business_type==='restaurant'}));
import OwnerRestaurantPOS from '@/components/dashboard/OwnerRestaurantPOS';
let tree,client;
async function mount(branchId='branch-a'){
 client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 await act(async()=>{tree=create(<QueryClientProvider client={client}><MemoryRouter><OwnerRestaurantPOS restaurant={{id:'tenant-a',business_type:'restaurant',currency:'SAR'}} branchId={branchId} lang="en"/></MemoryRouter></QueryClientProvider>);});
 await act(async()=>{await new Promise(r=>setTimeout(r,20));});
}
afterEach(()=>{act(()=>tree?.unmount());client?.clear();vi.clearAllMocks();});
it('uses the selected authorized branch and keeps unpaid orders separate from sales',async()=>{
 rpc.mockResolvedValue({paid_sales:120,unpaid_orders:45,events:[]});await mount();
 expect(rpc).toHaveBeenCalledWith('pos_workspace',{p_restaurant_id:'tenant-a',p_branch_id:'branch-a',p_date:'2026-10-28'});
 expect(tree.root.findByType('a').props.href).toBe('/restaurant/pos?branch=branch-a');
 expect(JSON.stringify(tree.toJSON())).toContain('120');expect(JSON.stringify(tree.toJSON())).toContain('45');
});
it('queries all branches only when the owner scope is all branches',async()=>{
 rpc.mockResolvedValue({paid_sales:0,unpaid_orders:0,events:[]});await mount(null);
 expect(rpc.mock.calls[0][1].p_branch_id).toBeNull();
});
it('surfaces a denied/failed read instead of displaying zero financial totals',async()=>{
 rpc.mockRejectedValue(new Error('denied'));await mount();
 await act(async()=>{await new Promise(r=>setTimeout(r,1100));});
 expect(tree.root.findByProps({role:'alert'}).children.join('')).toContain('Could not load');
 expect(tree.root.findAllByType('strong')).toHaveLength(0);
});
