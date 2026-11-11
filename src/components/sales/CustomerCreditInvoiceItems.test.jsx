import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerCreditInvoiceItems from './CustomerCreditInvoiceItems';
import { creditPOSInvoiceItem,creditPOSMenuLabel,creditPOSMenuChoices,creditPOSInvoiceTotal } from '@/lib/closingCreditPOSCatalog';

const mocked=vi.hoisted(()=>({catalog:vi.fn()}));
vi.mock('@/lib/restaurantPOS',()=>({restaurantRpc:mocked.catalog}));
vi.mock('lucide-react',()=>({Trash2:()=>null}));
vi.mock('@/components/ui/input',()=>({Input:React.forwardRef((props,ref)=>React.createElement('input',{...props,ref}))}));
vi.mock('@/components/ui/button',()=>({Button:({children,...props})=>React.createElement('button',props,children)}));

const menu=[
 {id:'menu-chicken',product_id:'prod-chicken',name:'كبير',name_ar:'كبير',name_fa:'کبیر',option_group:'ايدام دجاج',price:10,category:'Food'},
 {id:'menu-small',product_id:'prod-chicken',name:'صغير',option_group:'ايدام دجاج',price:6,category:'Food'},
 {id:'menu-rice',product_id:'prod-rice',name:'الرز',option_group:'',price:5,category:'Food'}
];
const scope={restaurantId:'rest-a',branchId:'branch-a',currency:'SAR',lang:'ar'};
const dropdown =tree=>tree.root.findByProps({'data-testid':'customer-credit-pos-product-dropdown'});
const lines=tree=>tree.root.findAllByProps({'data-testid':'customer-credit-invoice-line'});
const textOf=node=>node.children.map(x=>typeof x==='string'?x:textOf(x)).join(' ');

beforeEach(()=>{mocked.catalog.mockReset();mocked.catalog.mockResolvedValue(menu);});

describe('Sales Closing customer credit item dropdown from Cashier POS',()=>{
 it('normalizes servings with distinct configured prices and cent-level totals',()=>{
  expect(creditPOSMenuChoices(menu)).toHaveLength(3);
  expect(creditPOSMenuLabel(menu[0],'ar')).toBe('ايدام دجاج · كبير');
  expect(creditPOSInvoiceItem(menu[0],'ar')).toMatchObject({
    menu_id:'menu-chicken',product_id:'prod-chicken',quantity:1,unit_price:10,total_price:10
  });
  expect(creditPOSInvoiceTotal([creditPOSInvoiceItem(menu[0],'ar',2),creditPOSInvoiceItem(menu[1],'ar',1)])).toBe('26.00');
  expect(creditPOSMenuChoices([...menu,{id:'invalid',product_id:'x',name:'Old',price:0}])).toHaveLength(3);
 });
 it('loads only selected branch scope and fills item name, price, product and amount on one dropdown choice',async()=>{
  const edits=vi.fn();let tree;
  await act(async()=>{
   tree=TestRenderer.create(<CustomerCreditInvoiceItems {...scope}
    entry={{id:'sale-a',items:[],amount:''}} onUpdate={edits}/>);
   await Promise.resolve();
  });
  expect(mocked.catalog).toHaveBeenCalledWith('customer_credit_pos_items',{
   p_restaurant_id:'rest-a',p_branch_id:'branch-a',p_search:''
  });
  expect(dropdown(tree).props.disabled).toBe(false);
  expect(tree.root.findAllByType('optgroup').some(x=>x.props.label==='ايدام دجاج')).toBe(true);
  await act(async()=>dropdown(tree).props.onChange({target:{value:'menu-chicken'}}));
  expect(edits).toHaveBeenLastCalledWith('sale-a',expect.objectContaining({
   amount:'10.00',
   items:[expect.objectContaining({menu_id:'menu-chicken',product_id:'prod-chicken',quantity:1,unit_price:10,name:'ايدام دجاج · كبير'})]
  }));
 });
 it('updates quantity and totals without allowing free-text price edits',async()=>{
  function Harness(){
   const [entry,setEntry]=useState({id:'sale-a',items:[],amount:''});
   return <CustomerCreditInvoiceItems {...scope} entry={entry}
    onUpdate={(id,patch)=>setEntry(e=>({...e,...patch}))}/>;
  }
  let tree;
  await act(async()=>{tree=TestRenderer.create(<Harness/>);await Promise.resolve();});
  await act(async()=>dropdown(tree).props.onChange({target:{value:'menu-chicken'}}));
  expect(lines(tree)).toHaveLength(1);
  const qty=lines(tree)[0].findAllByType('input').find(x=>x.props.type==='number');
  await act(async()=>qty.props.onChange({target:{value:'3'}}));
  expect(textOf(tree.root).replace(/\s+/g,' ')).toContain('SAR 30.00');
  expect(lines(tree)[0].findAllByType('input').filter(x=>x.props.type==='number')).toHaveLength(1);
  await act(async()=>dropdown(tree).props.onChange({target:{value:'menu-small'}}));
  expect(lines(tree)).toHaveLength(2);
  await act(async()=>dropdown(tree).props.onChange({target:{value:'menu-small'}}));
  expect(lines(tree)).toHaveLength(2); // repeated choice increments serving qty, not duplicate invoice lines
  expect(textOf(tree.root).replace(/\s+/g,' ')).toContain('SAR 42.00');
  await act(async()=>tree.root.findAllByType('button').find(x=>x.props['aria-label']==='حذف الصنف').props.onClick());
  expect(lines(tree)).toHaveLength(1);
 });
 it('keeps disabled item posting and manual legacy lines safe when branch is missing',()=>{
  const tree=TestRenderer.create(<CustomerCreditInvoiceItems
   lang="en" entry={{id:'legacy',amount:'50.00',items:[{name:'Existing invoice',quantity:1,unit_price:50,total_price:50}]}}
   onUpdate={vi.fn()}/>);
  expect(tree.root.findAllByProps({'data-testid':'customer-credit-pos-product-dropdown'})).toHaveLength(0);
  expect(textOf(tree.root)).toContain('Existing invoice');
  expect(textOf(tree.root)).toContain('Select the restaurant and branch');
  expect(mocked.catalog).not.toHaveBeenCalled();
 });
 it('does not silently fall back to fabricated products after RPC access failure',async()=>{
  mocked.catalog.mockRejectedValueOnce(new Error('FORBIDDEN'));
  let tree;
  await act(async()=>{tree=TestRenderer.create(<CustomerCreditInvoiceItems {...scope}
   entry={{id:'sale-a',items:[],amount:''}} onUpdate={vi.fn()}/>);await Promise.resolve();});
  expect(dropdown(tree).props.disabled).toBe(true);
  expect(tree.root.findAllByProps({role:'alert'}).length).toBeGreaterThan(0);
 });
});
