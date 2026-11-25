// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {describe,it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({error:false,data:{invoices:[{id:'i',date:'2026-10-01',currency:'SAR',supplier_id:'s',supplier_name:'Vendor',invoice_number:'INV1',total_amount:100,paid_amount:40}],payments:[{id:'p',invoice_id:'i',date:'2026-10-02',supplier_id:'s',amount:40}],suppliers:[{id:'s',name:'Vendor'}]}}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:mocks.data,isError:mocks.error,refetch:vi.fn()})}));
vi.mock('@/api/supabaseClient',()=>({supabase:{}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en',currency:'SAR'})}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({activeRestaurantId:'r',branches:[]})}));
import SupplierLedger from '@/pages/SupplierLedger';
let tree;afterEach(()=>{act(()=>tree?.unmount());mocks.error=false;});
describe('supplier ledger view',()=>{
 it('keeps account totals stable when searching for an invoice',()=>{
  act(()=>{tree=create(<SupplierLedger/>);});
  const closing=()=>tree.root.findByProps({'data-testid':'ledger-closing'}).children.join('');
  expect(closing()).toBe('SAR 60.00');
  act(()=>tree.root.findByProps({'aria-label':'Search supplier, invoice or reference'}).props.onChange({target:{value:'INV1'}}));
  expect(closing()).toBe('SAR 60.00');
  expect(JSON.stringify(tree.toJSON())).toContain('Totals and running balances keep the complete selected account scope.');
 });
 it('shows paid invoices and payment history even when the ledger closes at zero',()=>{
  const old=mocks.data;const open=vi.fn();
  mocks.data={...old,invoices:[{...old.invoices[0],total_amount:135,paid_amount:135,status:'paid'}],payments:[{...old.payments[0],amount:135,payment_method:'cash'}]};
  try{
   act(()=>{tree=create(<SupplierLedger supplier={{id:'s'}} onOpenInvoice={open}/>);});
   const rows=()=>tree.root.findAllByProps({'data-testid':'ledger-history-row'});
   expect(tree.root.findByProps({'data-testid':'ledger-closing'}).children.join('')).toBe('SAR 0.00');
   expect(rows().map(row=>row.props['data-record-type'])).toEqual(['invoice','payment']);
   act(()=>tree.root.findByProps({'data-testid':'ledger-view-payments'}).props.onClick());
   expect(rows()).toHaveLength(1);expect(rows()[0].props['data-record-type']).toBe('payment');
   act(()=>tree.root.findByProps({'aria-label':'Search supplier, invoice or reference'}).props.onChange({target:{value:'INV1'}}));
   expect(rows()).toHaveLength(1);
   act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Invoice details')).props.onClick());
   expect(open).toHaveBeenCalledWith(expect.objectContaining({id:'i'}));
   act(()=>tree.root.findByProps({'data-testid':'ledger-view-invoices'}).props.onClick());
   expect(rows().map(row=>row.props['data-record-type'])).toEqual(['invoice']);
  }finally{mocks.data=old;}
 });
 it('shows service errors without false zero balances',()=>{
  mocks.error=true;act(()=>{tree=create(<SupplierLedger/>);});
  expect(tree.root.findAllByProps({'data-testid':'ledger-closing'})).toHaveLength(0);
  expect(tree.root.findByProps({role:'alert'})).toBeTruthy();
 });
});
