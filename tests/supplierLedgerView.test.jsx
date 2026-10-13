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
 it('shows service errors without false zero balances',()=>{
  mocks.error=true;act(()=>{tree=create(<SupplierLedger/>);});
  expect(tree.root.findAllByProps({'data-testid':'ledger-closing'})).toHaveLength(0);
  expect(tree.root.findByProps({role:'alert'})).toBeTruthy();
 });
});
