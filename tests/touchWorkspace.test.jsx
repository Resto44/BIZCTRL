// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useTouchMode} from '../src/components/pos-touch/TouchPrimitives';
import TouchWorkspace from '../src/components/pos-touch/TouchWorkspace';
import {cashierCopy} from '../src/components/retail-pos/cashierCopy';
let root,host;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
beforeEach(()=>{Object.defineProperty(window,'innerWidth',{value:1024,configurable:true});Object.defineProperty(window,'innerHeight',{value:600,configurable:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const click=async button=>{expect(button).toBeTruthy();await act(async()=>button.click());};
function props(){return {kind:'restaurant',lang:'en',c:{...cashierCopy('en'),food:'Food'},search:'',setSearch:vi.fn(),api:{connected:true,snapshot:{device:{code:'POS'},business:{currency:'SAR'},shift:{},cart:{id:'cart',lines:Array.from({length:11},(_,i)=>({menu_id:'line-'+i,name:'Line '+i,quantity:1,line_total:10})),net_total:110,tax_total:0}},refresh:vi.fn()},menu:Array.from({length:19},(_,i)=>({id:'item-'+i,name:'Food '+i,price:10,active:true})),editable:true,canPay:true,onAdd:vi.fn().mockResolvedValue({}),onQuantity:vi.fn(),onAction:vi.fn(),onExit:vi.fn()};}
describe('fixed touch cashier',()=>{
 it('makes every catalog item and invoice line reachable through buttons at 1024×600',async()=>{
  const p=props();await act(async()=>root.render(<TouchWorkspace {...p}/>));
  expect(document.querySelectorAll('.touch-product')).toHaveLength(6);expect(document.querySelectorAll('.touch-line')).toHaveLength(3);
  for(let page=0;page<3;page++)await click(document.querySelector('.touch-catalog .touch-pager button:last-child'));
  expect(document.querySelector('.touch-product strong').textContent).toBe('Food 18');await click(document.querySelector('.touch-product'));expect(p.onAdd).toHaveBeenCalledWith(p.menu[18],1);
  for(let page=0;page<3;page++)await click(document.querySelector('.touch-invoice .touch-pager button:last-child'));
  expect(document.querySelector('.touch-line strong').textContent).toBe('Line 9');
  await click(document.querySelector('.touch-line-controls button:last-child'));expect(p.onQuantity).toHaveBeenCalledWith(p.api.snapshot.cart.lines[9],1);
  expect(document.querySelector('.touch-invoice>.touch-primary').disabled).toBe(false);
 });
 it('walks custom food options without losing the exact owner price or quantity',async()=>{
  const p=props();p.menu=[{id:'small',name:'Small oat coffee',option_group:'Coffee',option_key:'custom_small',active:true,price:12,variant_options:[{label:'Size',value:'Small'},{label:'Milk',value:'Oat'}]},{id:'large',name:'Large oat coffee',option_group:'Coffee',option_key:'custom_large',active:true,price:19,variant_options:[{label:'Size',value:'Large'},{label:'Milk',value:'Oat'}]}];
  await act(async()=>root.render(<TouchWorkspace {...p}/>));await click(document.querySelector('.touch-product'));
  await click([...document.querySelectorAll('.touch-options button')].find(b=>b.textContent==='Large'));
  await click(document.querySelector('.touch-layer footer button:last-child'));await click(document.querySelector('.touch-layer footer button:last-child'));
  expect(document.querySelector('.touch-layer').textContent).toContain('SAR 19.00');
  await click(document.querySelector('.touch-layer button[aria-label="+"]'));await click(document.querySelector('.touch-layer footer button:last-child'));
  expect(p.onAdd).toHaveBeenCalledWith(p.menu[1],2);expect(document.querySelector('.touch-layer')).toBeNull();
 });
 it('continues retail server pagination after the last visible product page',async()=>{
  const p=props();p.kind='retail';p.menu=p.menu.slice(0,12).map(m=>({...m,available:5}));p.hasMore=true;p.setCatalogPage=vi.fn();p.catalogPage=3;
  await act(async()=>root.render(<TouchWorkspace {...p}/>));await click(document.querySelector('.touch-catalog .touch-pager button:last-child'));await click(document.querySelector('.touch-catalog .touch-pager button:last-child'));
  expect(p.setCatalogPage).toHaveBeenCalledWith(4);
 });
});
it('uses compact paged mobile panes and locks the underlying page',async()=>{
 Object.defineProperty(window,'innerWidth',{value:390,configurable:true});Object.defineProperty(window,'innerHeight',{value:900,configurable:true});const p=props();
 await act(async()=>root.render(<TouchWorkspace {...p}/>));expect(document.querySelectorAll('.touch-product')).toHaveLength(4);expect(document.querySelectorAll('.touch-line')).toHaveLength(3);expect(document.body.style.overflow).toBe('hidden');expect(document.body.classList.contains('touch-cashier-open')).toBe(true);
 expect(document.querySelector('.touch-pos').dataset.mobileView).toBe('products');await click(document.querySelector('.touch-mobile-tabs button:last-child'));expect(document.querySelector('.touch-pos').dataset.mobileView).toBe('invoice');
 await click(document.querySelector('.touch-invoice>.touch-primary'));expect(p.onAction).toHaveBeenCalledWith('payment');
 await act(async()=>root.render(null));expect(document.body.classList.contains('touch-cashier-open')).toBe(false);expect(document.body.style.overflow).not.toBe('hidden');
});

it('enables fixed cashier on phones without a media-query threshold',async()=>{
 Object.defineProperty(window,'innerWidth',{value:390,configurable:true});
 function Probe(){const t=useTouchMode();return <button data-enabled={t.enabled} onClick={t.exit}>Exit</button>;}
 await act(async()=>root.render(<Probe/>));expect(host.querySelector('button').dataset.enabled).toBe('true');await click(host.querySelector('button'));expect(host.querySelector('button').dataset.enabled).toBe('false');
});
it('pages the approved category rail and routes kitchen action to the existing command',async()=>{
 const p=props();p.menu=p.menu.slice(0,9).map((m,i)=>({...m,category_id:'c'+i,category:'Category '+i}));p.actions=[{id:'send_kitchen',label:'Send to kitchen',disabled:false}];
 await act(async()=>root.render(<TouchWorkspace {...p}/>));expect(document.querySelector('.touch-brand').textContent).toBe('Biz Control');
 await click(document.querySelector('.touch-category-rail .touch-pager button:last-child'));
 await click([...document.querySelectorAll('.touch-category-list button')].find(b=>b.textContent==='Category 4'));
 expect(document.querySelectorAll('.touch-product')).toHaveLength(1);expect(document.querySelector('.touch-product strong').textContent).toBe('Food 4');
 await click([...document.querySelectorAll('.touch-quick-actions button')].find(b=>b.textContent==='Send to kitchen'));expect(p.onAction).toHaveBeenCalledWith('send_kitchen');
});
