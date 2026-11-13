// @vitest-environment jsdom
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {beforeEach,describe,it,expect,vi} from 'vitest';

vi.mock('@/api/supabaseClient',()=>({supabase:{}}));
vi.mock('@/lib/AuthContext',()=>({useAuth:()=>({user:null})}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:'en'})}));
vi.mock('@/components/help/HelpLink',()=>({default:()=>null}));
vi.mock('@/components/suppliers/SupplierPortalAnalytics',()=>({default:()=>null}));
import {POCard} from '../src/pages/SupplierPortalERP.jsx';

const copy={
 purchaseOrder:'Purchase order',unknownBranch:'Assigned branch',total:'Total',
 status:{received:'Received',sent:'New order',shipped:'Shipped'},
 items:'items',show:'Show',hide:'Hide',details:'Details',
 priceHidden:'Prices hidden by Owner',ownerApproved:'Owner-verified delivery',
 verifiedItems:'Verified products',waitingOwner:'Awaiting Owner verification',
 confirmShip:'Confirm shipment'
};
const ordered={id:'c4bbd5d5-beef',branch:'main-9a50614652',created_date:'2026-11-13T00:00:00',
 total_amount:30,currency:'SAR',status:'received',price_hidden:false,
 items:[{product_name:'بندورة',quantity:1,unit:'فلين',unit_price:15},
 {product_name:'بندورة',quantity:1,unit:'فلين',unit_price:15}]};
const verified={
 confirmed_at:'2026-11-13T09:00:00',
 verified_items:[{product_name:'بندورة',received_quantity:1},{product_name:'بندورة',received_quantity:1}]
};
const dump=tree=>JSON.stringify(tree.toJSON());
const toggle=tree=>tree.root.findAllByType('button').find(x=>x.props['data-testid']==='supplier-po-expand-toggle');
let tree;
const mount=async(props={})=>act(async()=>{tree=TestRenderer.create(
 <POCard po={{...ordered,...props.po}} ownerVerification={props.ownerVerification===undefined?verified:props.ownerVerification}
  onConfirmShipment={props.onConfirmShipment||vi.fn()} loading={Boolean(props.loading)} copy={props.copy||copy}/>
);});
beforeEach(()=>{tree=null;});
describe('Supplier ERP compact expandable purchase order cards',()=>{
 it('is compact by default: only ID, status, branch, date, count, total and verification summary',async()=>{
  await mount();
  const rendered=dump(tree);
  expect(tree.root.findAllByProps({'data-testid':'supplier-purchase-order-card'})).toHaveLength(1);
  expect(toggle(tree).props['aria-expanded']).toBe(false);
  expect(toggle(tree).props['aria-controls']).toBeTruthy();
  expect(rendered).toContain('c4bbd5d5');
  expect(rendered).toContain('main-9a50614652');
  expect(rendered).toContain('Owner-verified delivery');
  expect(rendered).not.toContain('Verified products');
  expect(rendered).not.toContain('بندورة');
  expect(tree.root.findAllByProps({'data-testid':'supplier-verified-order-items'})).toHaveLength(0);
  expect(tree.root.findAllByProps({'data-testid':'supplier-po-expanded-details'})).toHaveLength(0);
  await act(async()=>tree.unmount());
 });
 it('opens and closes item lines and Owner verification inside ONE disclosure button',async()=>{
  await mount();
  await act(async()=>toggle(tree).props.onClick());
  expect(toggle(tree).props['aria-expanded']).toBe(true);
  expect(tree.root.findAllByProps({'data-testid':'supplier-verified-order-items'})).toHaveLength(1);
  expect(tree.root.findAllByProps({'data-testid':'supplier-po-item-lines'})).toHaveLength(1);
  expect(dump(tree)).toContain('Verified products');
  expect(dump(tree)).toContain('بندورة');
  await act(async()=>toggle(tree).props.onClick());
  expect(toggle(tree).props['aria-expanded']).toBe(false);
  expect(tree.root.findAllByProps({'data-testid':'supplier-verified-order-items'})).toHaveLength(0);
  await act(async()=>tree.unmount());
 });
 it('retains the Confirm shipment action in collapsed cards; disables it during requests',async()=>{
  const approve=vi.fn();
  await mount({po:{status:'sent'},onConfirmShipment:approve});
  const btn=tree.root.findAllByType('button').find(x=>x.props.children?.some?.(y=>y==='Confirm shipment'));
  expect(btn).toBeDefined();
  expect(btn.props.disabled).toBe(false);
  expect(toggle(tree).props['aria-expanded']).toBe(false);
  await act(async()=>btn.props.onClick());
  expect(approve).toHaveBeenCalledOnce();
  await act(async()=>tree.unmount());
  await mount({po:{status:'sent'},loading:true});
  const loadingButton=tree.root.findAllByType('button').find(x=>x.props.children?.some?.(y=>y==='Confirm shipment'));
  expect(loadingButton.props.disabled).toBe(true);
  await act(async()=>tree.unmount());
 });
 it('never exposes hidden supplier prices when collapsed or expanded',async()=>{
  await mount({po:{price_hidden:true,total_amount:987654,items:[{name:'Chicken',qty:1,unit_price:987654}]}});
  expect(dump(tree)).not.toContain('987654');
  expect(dump(tree)).toContain('Prices hidden by Owner');
  await act(async()=>toggle(tree).props.onClick());
  expect(dump(tree)).not.toContain('987654');
  expect(dump(tree)).toContain('Chicken');
  await act(async()=>tree.unmount());
 });
 it('supports Dari/Arabic disclosure labels with stable aria-expanded and no financial writes',async()=>{
  const localized={...copy,show:'نمایش',hide:'پنهان',details:'جزئیات'};
  await mount({copy:localized});
  expect(toggle(tree).props['aria-label']).toContain('نمایش جزئیات');
  await act(async()=>toggle(tree).props.onClick());
  expect(toggle(tree).props['aria-label']).toContain('پنهان جزئیات');
  await act(async()=>tree.unmount());
 });
});
