// @vitest-environment jsdom
import React from 'react';
import {act,create} from 'react-test-renderer';
import {describe,it,expect,vi,afterEach} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),invalidate:vi.fn(),can:{createPurchases:true,updatePurchaseOrders:true,manageSuppliers:true}}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:m.rpc}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en',currency:'SAR'})}));
vi.mock('@/lib/TenantContext',()=>({useTenant:()=>({activeRestaurantId:'r',branches:[]})}));
vi.mock('@/lib/RoleContext',()=>({useRole:()=>({can:m.can})}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({invalidateQueries:m.invalidate}),useQuery:opts=>({data:opts.queryKey[0]==='supplier-workspace-orders'?[]:{invoices:[],payments:[],suppliers:[]}})}));
vi.mock('@/pages/SupplierLedger',()=>({default:props=><div data-testid="ledger" supplier={props.supplier}/> }));
vi.mock('@/components/purchases/PurchaseInvoiceForm',()=>({default:props=><div data-testid="invoice-form" supplier={props.supplier}/> }));
vi.mock('@/components/purchase-orders/PurchaseOrderForm',()=>({default:props=><div data-testid="order-form" supplier={props.supplier}/> }));
vi.mock('@/components/suppliers/SupplierStatement',()=>({default:()=>null}));
vi.mock('@/components/suppliers/SupplierContractTab',()=>({default:()=>null}));
import SupplierDetail from '@/components/suppliers/SupplierDetail';
import Payment from '@/components/suppliers/SupplierWorkspacePayment';
import {postSupplierPayment} from '@/lib/supplierWorkspace';
let tree;afterEach(()=>{act(()=>tree?.unmount());m.rpc.mockReset();sessionStorage.clear();});
describe('one supplier workspace',()=>{
 it('opens canonical invoice and order forms with the same supplier without navigation',()=>{const supplier={id:'s',name:'Vendor'};act(()=>{tree=create(<SupplierDetail supplier={supplier}/>);});const click=text=>act(()=>tree.root.findAllByType('button').find(b=>b.children.join('')===text).props.onClick());click('Add invoice');expect(tree.root.findByProps({'data-testid':'invoice-form'}).props.supplier).toBe(supplier);click('New purchase order');expect(tree.root.findByProps({'data-testid':'order-form'}).props.supplier).toBe(supplier);expect(tree.root.findByProps({'data-testid':'ledger'}).props.supplier).toBe(supplier);});
 it('uses a single server posting call and surfaces failures',async()=>{m.rpc.mockResolvedValue({error:new Error('denied')});await expect(postSupplierPayment({requestId:'r',invoiceId:'i',amount:3,date:'2026-10-13'})).rejects.toThrow('denied');expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.rpc.mock.calls[0][0]).toBe('post_supplier_invoice_payment');});
 it('keeps the request id and payload across failed retries',async()=>{m.rpc.mockResolvedValue({error:new Error('timeout')});act(()=>{tree=create(<Payment invoice={{id:'i',restaurant_id:'r',total_amount:10,paid_amount:0}} onSaved={vi.fn()}/>);});const save=()=>tree.root.findAllByType('button').find(b=>b.children.join('')==='Save / retry').props.onClick();await act(async()=>save());await act(async()=>save());expect(m.rpc.mock.calls[0][1]).toEqual(m.rpc.mock.calls[1][1]);expect(tree.root.findByType('fieldset').props.disabled).toBe(true);});
});
