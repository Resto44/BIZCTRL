import { describe, it, expect } from 'vitest';
import { resolveCanonicalNetworkBranch, networkAccountSavePayload } from '../src/lib/networkAccountBranch.js';
const branches=[
 { id:'a8c5b82b-6bd9-4827-a317-cc5b70c4a1e8', key:'rayyan', name:'فرع الريان' },
 { id:'b6e31f1d-dd86-4478-8ad8-ab191382c49f', key:'falah', name:'فرع فلاح' },
];
describe('Network Management canonical branch scoping',()=>{
 it('stores canonical UUID and legacy aliases for a branch-key form choice',()=>{
  const p=networkAccountSavePayload({branch_id:'rayyan',status:'active',account_name:'Mada'},branches);
  expect(p.branch_id).toBe(branches[0].id);
  expect(p.branch).toBe('rayyan');
  expect(p.branch_key).toBe('rayyan');
  expect(p.is_active).toBe(true);
 });
 it('recognizes a UUID when editing an already canonical account',()=>{
  const p=networkAccountSavePayload({branch_id:branches[1].id,status:'inactive'},branches);
  expect(p.branch_id).toBe(branches[1].id);
  expect(p.is_active).toBe(false);
  expect(p.status).toBe('inactive');
 });
 it('supports a unique historical display name but not an unknown branch',()=>{
  expect(resolveCanonicalNetworkBranch(branches,'فرع الريان')?.id).toBe(branches[0].id);
  expect(()=>networkAccountSavePayload({branch_id:'unknown',status:'active'},branches)).toThrow(/unambiguous authorized branch/);
 });
 it('blocks ambiguous duplicate human-readable names',()=>{
  expect(resolveCanonicalNetworkBranch([...branches,{id:'d6ca6a75-7243-450f-9408-f8af8c4e9d3e',key:'extra',name:'فرع الريان'}],'فرع الريان')).toBeNull();
 });
});
