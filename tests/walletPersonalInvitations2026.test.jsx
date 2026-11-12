// @vitest-environment jsdom
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:(...args)=>mock.rpc(...args)}}));
import WalletApplicantDirectory,{eligibleWalletCandidate} from '../src/components/owner/WalletApplicantDirectory.jsx';

const token='a'.repeat(64);
const rows=[
 {source_type:'manager',source_id:'manager-a',full_name:'Manager A',email:'manager@test.invalid',status:'approved',branch_id:'branch-1',wallet_linked:false},
 {source_type:'employee',source_id:'employee-a',full_name:'Employee A',email:'employee@test.invalid',status:'active',branch_id:'branch-1',wallet_linked:false},
 {source_type:'driver',source_id:'driver-a',full_name:'Driver A',email:'driver@test.invalid',status:'active',branch_id:'branch-1',wallet_linked:false},
 {source_type:'supplier',source_id:'supplier-a',full_name:'Supplier A',email:'supplier@test.invalid',status:'active',branch_id:'branch-2',wallet_linked:false},
 {source_type:'customer',source_id:'customer-a',full_name:'Customer A',email:'customer@test.invalid',status:'active',branch_id:'branch-1',wallet_linked:false},
];
const props={restaurantId:'tenant-one',organizationName:'Supermarket',branches:[{id:'branch-1',name:'Main'},{id:'branch-2',name:'Secondary'}],lang:'fa'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,2));
let tree;
const mount=async(extra={})=>{await act(async()=>{tree=TestRenderer.create(<WalletApplicantDirectory {...props} {...extra}/>);await tick();});};
const controls=()=>tree.root.findAllByType('button').filter(n=>n.props['data-testid']==='wallet-applicant-select');
const text=()=>JSON.stringify(tree.toJSON());
beforeEach(()=>{
 mock.rpc.mockReset();
 mock.rpc.mockImplementation(async(name)=>name==='erp_wallet_candidate_directory'
   ? {data:rows,error:null}:{data:token,error:null});
});
describe('ERP wallet invite directory — all five roles, tenant-scoped',()=>{
 it('loads the five business roles automatically when Wallet is selected',async()=>{
  await mount();
  expect(mock.rpc).toHaveBeenCalledWith('erp_wallet_candidate_directory',{p_restaurant_id:'tenant-one'});
  expect(controls()).toHaveLength(5);
  for(const role of ['manager','employee','driver','supplier','customer'])
   expect(controls().some(c=>c.props['data-role']===role)).toBe(true);
  expect(text()).toContain('مدیر');
  expect(text()).toContain('Secondary');
  await act(async()=>tree.unmount());
 });
 it('instantly creates an individual secure invite when employee is selected without rotating other links',async()=>{
  await mount();
  const employee=controls().find(c=>c.props['data-role']==='employee');
  await act(async()=>{employee.props.onClick();await tick();});
  expect(mock.rpc).toHaveBeenCalledWith('erp_people_personal_enrollment_link',{
    p_restaurant_id:'tenant-one',p_source_type:'employee',p_source_id:'employee-a'});
  expect(mock.rpc.mock.calls.some(([name])=>name==='erp_people_enrollment_link')).toBe(false);
  expect(text()).toContain('/wallet-portal#personal='+token);
  expect(text()).toContain('Employee A');
  expect(text()).toContain('تأیید Owner');
  await act(async()=>tree.unmount());
 });
 it('can issue a separate individual invite for every role',async()=>{
  await mount();
  for(const role of ['manager','employee','driver','supplier','customer']){
   const target=controls().find(c=>c.props['data-role']===role);
   await act(async()=>{target.props.onClick();await tick();});
   expect(mock.rpc).toHaveBeenCalledWith('erp_people_personal_enrollment_link',
    {p_restaurant_id:'tenant-one',p_source_type:role,p_source_id:role+'-a'});
  }
  expect(mock.rpc.mock.calls.filter(([name])=>name==='erp_people_personal_enrollment_link')).toHaveLength(5);
  await act(async()=>tree.unmount());
 });
 it('does not generate invitations for inactive, linked wallet or missing-email users',async()=>{
  const invalid=[{...rows[1],email:null},{...rows[2],status:'inactive'},{...rows[3],wallet_linked:true},{...rows[0],status:'suspended'}];
  mock.rpc.mockImplementation(async(name)=>name==='erp_wallet_candidate_directory'?{data:invalid,error:null}:{data:token,error:null});
  await mount();
  expect(controls()).toHaveLength(4);
  expect(controls().every(x=>x.props.disabled)).toBe(true);
  expect(mock.rpc).toHaveBeenCalledTimes(1);
  expect(eligibleWalletCandidate(invalid[0])).toBe(false);
  await act(async()=>tree.unmount());
 });
 it('does not display a fabricated zero or issue any token when directory authorization fails',async()=>{
  mock.rpc.mockResolvedValue({data:null,error:{message:'PARTNER_OWNER_ONLY'}});
  await mount();
  expect(text()).toContain('فهرست کاربران بار نشد');
  expect(controls()).toHaveLength(0);
  expect(mock.rpc.mock.calls.every(([name])=>name==='erp_wallet_candidate_directory')).toBe(true);
  await act(async()=>tree.unmount());
 });
 it('clears invitation and old tenant list immediately on business switch',async()=>{
  await mount();
  await act(async()=>{controls()[1].props.onClick();await tick();});
  expect(text()).toContain('/wallet-portal#personal=');
  await act(async()=>{tree.update(<WalletApplicantDirectory {...props} restaurantId="tenant-two"/>);await tick();});
  expect(text()).not.toContain('/wallet-portal#personal=');
  expect(mock.rpc).toHaveBeenCalledWith('erp_wallet_candidate_directory',{p_restaurant_id:'tenant-two'});
  await act(async()=>tree.unmount());
 });
 it('keeps payment permissions and legacy shared link isolated from per-person enrollment',async()=>{
  const [sql,portal,members,wallet]=await Promise.all([
   readFile(resolve(process.cwd(),'supabase/migrations/20261112194500_wallet_personal_enrollment.sql'),'utf8'),
   readFile(resolve(process.cwd(),'src/pages/PartnerPortal.jsx'),'utf8'),
   readFile(resolve(process.cwd(),'src/components/settlement/PeopleMemberships.jsx'),'utf8'),
   readFile(resolve(process.cwd(),'src/components/owner/WalletJoinInvitation.jsx'),'utf8'),
  ]);
  expect(sql).toContain('REVOKE ALL ON TABLE public.people_personal_enrollment_links FROM PUBLIC,anon,authenticated');
  expect(sql).toContain("lower(trim(v_user.email))<>lower(trim(v_link.invited_email))");
  expect(sql).toContain('v_user.email_confirmed_at IS NULL');
  expect(sql).toContain('AND consumed_at IS NULL FOR UPDATE');
  expect(sql).toContain('ON CONFLICT(restaurant_id,source_type,source_id) DO UPDATE');
  expect(sql).toContain('INSERT INTO public.people_join_requests');
  expect(sql).not.toMatch(/(INSERT INTO|UPDATE)\s+public\.(wallet_transactions|business_partners)/);
  expect(portal).toContain('resolveWalletEnrollmentIntent');
  expect(portal).toContain('savedPersonal:');
  expect(portal).toContain('setPersonal(intent.personal)');
  expect(portal).toContain('personalJoin={!!personal}');
  expect(members).toContain("'erp_request_person_named_account'");
  expect(wallet).toContain('<WalletApplicantDirectory');
  expect(wallet).toContain("supabase.rpc('erp_people_enrollment_link'");
 });
});
