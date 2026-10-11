// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn(),invalidate:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:state.rpc}}));
vi.mock('@tanstack/react-query',()=>({
 useQueryClient:()=>({invalidateQueries:state.invalidate}),
 useMutation:({mutationFn})=>({mutateAsync:mutationFn,isPending:false}),
}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/components/ui/select',()=>({
 Select:({children,...props})=><select {...props}>{children}</select>,
 SelectTrigger:({children})=><span>{children}</span>,SelectValue:()=>null,
 SelectContent:({children})=><span>{children}</span>,
 SelectItem:({children,...props})=><option {...props}>{children}</option>,
}));
import CentralOwnerTreasuryPanel from '../src/components/treasury/CentralOwnerTreasuryPanel';
const accounts=[{id:'owner',account_type:'cash',currency:'SAR',opening_balance:100},
 {id:'branch',account_type:'cash',currency:'SAR',branch_key:'b',opening_balance:0}];
const props={restaurantId:'r',accounts,branches:[{id:'b-id',key:'b',name:'Branch'}]};
async function fill(tree,amount='20'){
 const selects=tree.root.findAllByType('select');
 await act(async()=>selects[0].props.onValueChange('owner'));
 await act(async()=>selects[1].props.onValueChange('b-id'));
 await act(async()=>selects[2].props.onValueChange('branch'));
 await act(async()=>{
  tree.root.findAllByType('input').find(n=>n.props.type==='number').props.onChange({target:{value:amount}});
  tree.root.findAllByType('input').find(n=>n.props.type==='checkbox').props.onChange({target:{checked:true}});
 });
}
describe('Owner funding interactions',()=>{
 beforeEach(()=>{state.rpc.mockReset();state.invalidate.mockReset();});
 it('supports legacy branch keys and blocks funding above available balance',async()=>{
  let tree;await act(async()=>{tree=create(<CentralOwnerTreasuryPanel {...props}/>);});
  await fill(tree,'101');
  expect(tree.root.findByType('button').props.disabled).toBe(true);
  await fill(tree,'100');
  expect(tree.root.findByType('button').props.disabled).toBe(false);
  tree.unmount();
 });
 it('locks same-render double submit and refreshes the central ledger after confirmation',async()=>{
  let finish;state.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  let tree;await act(async()=>{tree=create(<CentralOwnerTreasuryPanel {...props}/>);});
  await fill(tree);
  const submit=tree.root.findByType('button').props.onClick;
  let pending;await act(async()=>{pending=submit();submit();});
  expect(state.rpc).toHaveBeenCalledTimes(1);
  await act(async()=>{finish({data:{status:'posted'},error:null});await pending;});
  expect(state.invalidate).toHaveBeenCalledWith({queryKey:['treasury_owner_central_transactions']});
  expect(tree.root.findAllByType('input').find(n=>n.props.type==='number').props.value).toBe('');
  tree.unmount();
 });
 it('reuses the request ID when retrying an unconfirmed transfer',async()=>{
  state.rpc.mockResolvedValueOnce({data:null,error:new Error('connection lost')})
   .mockResolvedValueOnce({data:{status:'already_posted'},error:null});
  let tree;await act(async()=>{tree=create(<CentralOwnerTreasuryPanel {...props}/>);});
  await fill(tree);
  await act(async()=>{await tree.root.findByType('button').props.onClick();});
  await act(async()=>{await tree.root.findByType('button').props.onClick();});
  expect(state.rpc).toHaveBeenCalledTimes(2);
  expect(state.rpc.mock.calls[0][1].p_request_id).toBe(state.rpc.mock.calls[1][1].p_request_id);
  tree.unmount();
 });
});
