// @vitest-environment jsdom
import React from 'react';
import {create,act} from 'react-test-renderer';
import {it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({save:vi.fn(),close:vi.fn(),invalidate:vi.fn()}));
vi.mock('@/api/base44Client',()=>({base44:{entities:{PurchaseOrder:{create:mocks.save}}}}));
vi.mock('@/api/supabaseClient',()=>({supabase:{}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({currency:'SAR'})}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({activeRestaurant:{id:'r'},branches:[{id:'b',key:'branch'}]})}));
vi.mock('@/lib/BranchScopeContext',()=>({useBranchScope:()=>({selectedBranchKey:'branch',isAllBranches:false})}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:mocks.invalidate}),useQuery:()=>({data:{inventory:[{id:'i',restaurant_id:'r',product_id:'p',branch_id:'b',branch:'branch',quantity:0,unit:'kg',low_stock_threshold:5}],suppliers:[{id:'s',restaurant_id:'r',branch_id:'b',name:'Supplier'}],products:[{id:'p',restaurant_id:'r',supplier_id:'s',unit:'kg'}]}})}));
vi.mock('@/components/ui/dialog',()=>{const Part=({children})=><div>{children}</div>;return{Dialog:Part,DialogContent:Part,DialogHeader:Part,DialogTitle:Part};});
vi.mock('@/components/ui/select',()=>{const Part=({children})=><>{children}</>;return{Select:({children,value,onValueChange})=><select value={value} onChange={e=>onValueChange(e.target.value)}>{children}</select>,SelectContent:Part,SelectTrigger:Part,SelectValue:()=>null,SelectItem:({children,value})=><option value={value}>{children}</option>};});
import GenerateFromLowStock from '@/components/purchase-orders/GenerateFromLowStock';
it('keeps the draft open and restores the button after a failed save',async()=>{
 mocks.save.mockRejectedValue(new Error('Write denied'));
 let tree;await act(async()=>{tree=create(<GenerateFromLowStock open onClose={mocks.close}/>);});
 act(()=>tree.root.findAllByType('select')[1].props.onChange({target:{value:'s'}}));
 const generate=()=>tree.root.findAllByType('button').find(b=>String(b.children).includes('Create Draft PO'));
 expect(generate().props.disabled).toBeFalsy();
 await act(async()=>generate().props.onClick());
 expect(JSON.stringify(tree.toJSON())).toContain('Write denied');
 expect(generate().props.disabled).toBeFalsy();expect(mocks.close).not.toHaveBeenCalled();
 expect(mocks.save.mock.calls[0][0]).toMatchObject({restaurant_id:'r',branch_id:'b',status:'draft'});
 act(()=>tree.unmount());
});
