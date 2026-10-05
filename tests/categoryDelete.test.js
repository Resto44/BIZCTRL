import { describe,it,expect,vi } from 'vitest';
const fixture=vi.hoisted(()=>({select:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({from:()=>({delete:()=>({eq:()=>({select:fixture.select})})})})}));
vi.mock('@/lib/app-params',()=>({appParams:{}}));
import {base44} from '@/api/supabaseClient';
describe('category deletion acknowledgement',()=>{
 it('rejects a zero-row RLS delete',async()=>{
  fixture.select.mockResolvedValue({data:[],error:null});
  await expect(base44.entities.ProductCategory.delete('category')).rejects.toThrow('not deleted');
 });
 it('confirms a returned deleted row',async()=>{
  fixture.select.mockResolvedValue({data:[{id:'category'}],error:null});
  await expect(base44.entities.ExpenseCategory.delete('category')).resolves.toEqual({success:true});
 });
 it('preserves database errors',async()=>{
  fixture.select.mockResolvedValue({data:null,error:new Error('Category is in use')});
  await expect(base44.entities.SalesCategory.delete('category')).rejects.toThrow('Category is in use');
 });
});
