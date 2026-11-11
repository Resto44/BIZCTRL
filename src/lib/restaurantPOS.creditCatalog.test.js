import { describe, it, expect, vi, beforeEach } from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:mock.rpc}}));
vi.mock('@/lib/productImportAccess',()=>({isRestaurantPOSPortal:vi.fn(()=>true)}));
import { customerCreditPOSMenuRpc, restaurantRpc } from './restaurantPOS';

const args={
 p_restaurant_id:'1f8912cc-6aa5-4e30-af21-2acc98f6c73c',
 p_branch_id:'ea3c7bc2-3de2-467b-a4d6-e6a38e625123',
 p_search:''
};

beforeEach(()=>mock.rpc.mockReset());

describe('Sales Closing POS credit product catalog RPC',()=>{
 it('calls the finance-scoped RPC verbatim, without the restaurant command prefix',async()=>{
  const rows=[{id:'menu-a',name:'Food',price:24,product_id:'product-a'}];
  mock.rpc.mockResolvedValueOnce({data:rows,error:null});
  await expect(customerCreditPOSMenuRpc(args)).resolves.toEqual(rows);
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('erp_customer_credit_pos_items',args);
  expect(mock.rpc).not.toHaveBeenCalledWith('erp_restaurant_customer_credit_pos_items',expect.anything());
 });
 it('retains the existing restaurant cashier prefix for normal POS commands',async()=>{
  mock.rpc.mockResolvedValueOnce({data:{ok:true},error:null});
  await expect(restaurantRpc('cashier_command',{action:'refresh'})).resolves.toEqual({ok:true});
  expect(mock.rpc).toHaveBeenCalledWith('erp_restaurant_cashier_command',{action:'refresh'});
 });
 it('fails closed on RPC error, rather than returning a fabricated empty menu',async()=>{
  const error={code:'PGRST202',message:'Could not find the function'};
  mock.rpc.mockResolvedValueOnce({data:null,error});
  await expect(customerCreditPOSMenuRpc(args)).rejects.toMatchObject(error);
 });
 it('accepts a real empty menu, but rejects invalid server response shape',async()=>{
  mock.rpc.mockResolvedValueOnce({data:[],error:null});
  await expect(customerCreditPOSMenuRpc(args)).resolves.toEqual([]);
  mock.rpc.mockResolvedValueOnce({data:{status:'ok'},error:null});
  await expect(customerCreditPOSMenuRpc(args)).rejects.toThrow('CUSTOMER_CREDIT_POS_MENU_INVALID_RESPONSE');
 });
});
