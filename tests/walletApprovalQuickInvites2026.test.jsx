// @vitest-environment jsdom
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const mocks=vi.hoisted(()=>({
 rpc:vi.fn(),lang:'fa',
}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:(...args)=>mocks.rpc(...args)}}));
vi.mock('@/lib/LanguageContext',()=>({useLanguage:()=>({lang:mocks.lang})}));
vi.mock('@/components/settlement/PeopleMemberships',()=>({
 default:(props)=><div data-testid="wallet-people-approvals" data-tenant={props.tenant}
    data-hide-controls={String(props.hideLinkControls)}>Owner approval required</div>,
}));
import WalletJoinInvitation from '../src/components/owner/WalletJoinInvitation.jsx';

const source=p=>readFileSync(resolve(process.cwd(),p),'utf8');
const token='a'.repeat(64);
const joinUrl='http://localhost:3000/wallet-portal#join='+token;
const props={restaurantId:'restaurant-1',organizationName:'Test restaurant',branches:[{id:'b1',name:'Rayan'}]};
const mount=async()=>{
 let tree;
 await act(async()=>{
   tree=TestRenderer.create(<MemoryRouter><WalletJoinInvitation {...props}/></MemoryRouter>);
 });
 return {tree,close:async()=>{await act(async()=>tree.unmount());}};
};
const clickText=async(tree,text)=>{
 const button=tree.root.findAllByType('button').find(node=>
   JSON.stringify(node.children).includes(text));
 if(!button)throw Error('Missing button with text '+text);
 await act(async()=>{button.props.onClick();await Promise.resolve();});
};
beforeEach(()=>{
 mocks.rpc.mockReset();
 mocks.lang='fa';
 mocks.rpc.mockResolvedValue({data:token,error:null});
});

describe('Owner Approval Center Wallet invitation',()=>{
 it('offers all four ERP staff roles plus Wallet as a separate owner-reviewed invitation flow',()=>{
  const staff=source('src/components/owner/OwnerStaffProvisioning.jsx');
  for(const role of ['manager','employee','supplier','driver','wallet']){
   expect(staff).toContain("value: '"+role+"'");
  }
  expect(staff).toContain("form.role === 'wallet'");
  expect(staff).toContain('<WalletJoinInvitation');
  expect(staff).toContain("if (role === 'wallet') throw new Error");
  expect(staff).toContain("supabase.rpc('create_erp_invitation'");
  expect(staff).not.toContain("p_role: 'wallet'");
  expect(staff).toContain('InvitationDirectory');
 });
 it('issues one seven-day organization wallet join link without creating ERP roles or account balances',async()=>{
  const {tree,close}=await mount();
  try{
   await clickText(tree,'ساخت لینک دعوت والت');
   expect(mocks.rpc).toHaveBeenCalledWith('erp_people_enrollment_link',{
      p_restaurant_id:'restaurant-1',p_enabled:true,
   });
   const input=tree.root.findAllByType('input').find(x=>x.props.readOnly===true);
   expect(input?.props.value).toBe(window.location.origin+'/wallet-portal#join='+token);
   expect(JSON.stringify(tree.toJSON())).toContain('تأیید Owner');
   expect(tree.root.findByProps({'data-testid':'wallet-people-approvals'}).props['data-hide-controls']).toBe('true');
   expect(mocks.rpc.mock.calls.every(([name])=>name==='erp_people_enrollment_link')).toBe(true);
  }finally{await close();}
 });
 it('revokes the shared wallet enrollment link through owner-only RPC without changing existing accounts',async()=>{
  const {tree,close}=await mount();
  try{
   await clickText(tree,'ساخت لینک دعوت والت');
   await clickText(tree,'غیرفعال‌کردن لینک');
   expect(mocks.rpc).toHaveBeenCalledWith('erp_people_enrollment_link',{
     p_restaurant_id:'restaurant-1',p_enabled:false,
   });
   expect(tree.root.findAllByProps({'data-testid':'wallet-invitation-link'})).toHaveLength(0);
   expect(JSON.stringify(tree.toJSON())).toContain('لینک ثبت‌نام والت غیرفعال شد');
  }finally{await close();}
 });
 it('does not display a fabricated invite when the secure owner RPC fails',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{message:'Owner permission required'}});
  const {tree,close}=await mount();
  try{
   await clickText(tree,'ساخت لینک دعوت والت');
   expect(tree.root.findAllByProps({'data-testid':'wallet-invitation-link'})).toHaveLength(0);
   expect(tree.root.findAllByProps({role:'alert'})).not.toHaveLength(0);
  }finally{await close();}
 });
 it('uses the verified wallet join+approval RPC, not a fake ERP role or wallet deposit action',()=>{
  const wallet=source('src/components/owner/WalletJoinInvitation.jsx');
  const people=source('src/components/settlement/PeopleMemberships.jsx');
  const partner=source('src/pages/PartnerPortal.jsx');
  expect(wallet).toContain("supabase.rpc('erp_people_enrollment_link'");
  expect(wallet).toContain("/wallet-portal#join=");
  expect(wallet).toContain('hideLinkControls');
  expect(people).toContain("erp_review_person_join");
  expect(people).toContain("hideLinkControls=false");
  expect(partner).toContain("erp_request_person_account");
  expect(wallet).not.toContain('erp_save_person_account');
  expect(wallet).not.toContain('erp_bank_wallet_request');
  expect(wallet).not.toContain('create_erp_invitation');
  expect(wallet).not.toContain('localStorage.setItem');
 });
});
