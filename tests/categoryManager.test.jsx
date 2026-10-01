// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({filter:vi.fn(),create:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({base44:{entities:{ProductCategory:fixture}}}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({activeRestaurantId:'tenant-1'})}));
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import CategoryManager from '@/components/categories/CategoryManager';
import {NewIconPicker} from '@/components/categories/NewIconPicker';
let root,container,qc;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.ResizeObserver=class {observe(){} unobserve(){} disconnect(){}};
 window.matchMedia=vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 Object.defineProperty(window,'innerWidth',{value:390,configurable:true});
 localStorage.clear();
 fixture.filter.mockResolvedValue([]);fixture.create.mockResolvedValue({id:'new-category'});
 qc=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 qc.setQueryData(['product_categories','tenant-1'],[]);
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();qc.clear();vi.restoreAllMocks();});
const button=(text)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
async function render(ui){await act(async()=>root.render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>));}
describe('category editor regression',()=>{
 it('opens Add Category on mobile and submits a tenant-scoped category',async()=>{
  await render(<Dialog open><DialogContent><DialogTitle>Product Categories</DialogTitle><CategoryManager/></DialogContent></Dialog>);
  await act(async()=>button('Add Category').click());
  const input=document.querySelector('input[placeholder="Category name"]');expect(input).not.toBeNull();
  await act(async()=>Simulate.change(input,{target:{value:'Rice'}}));
  await act(async()=>Simulate.submit(input.closest('form')));
  expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({name:'Rice',restaurant_id:'tenant-1',icon:'📦',parent_id:null}));
 });
 it('opens Create First Category with malformed icon history',async()=>{
  localStorage.setItem('resto_frequent_icons','{"length":4}');
  await render(<CategoryManager/>);
  await act(async()=>button('Create First Category').click());
  expect(document.querySelector('input[placeholder="Category name"]')).not.toBeNull();
 });
 it('renders named and unknown icons without storage access',async()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('Storage blocked');});
  await render(<NewIconPicker value="Package" onChange={()=>{}}/>);
  expect(document.querySelector('button[title="Select Icon"] svg')).not.toBeNull();
  await render(<NewIconPicker value="not-an-icon" onChange={()=>{}}/>);
  expect(document.querySelector('button[title="Select Icon"] svg')).not.toBeNull();
 });
});
