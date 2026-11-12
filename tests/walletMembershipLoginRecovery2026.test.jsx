// @vitest-environment jsdom
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {describe,it,expect,beforeEach,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {walletMembershipErrorKey,resolveWalletEnrollmentIntent} from '../src/lib/walletEnrollmentIntent.js';
import {peopleText} from '../src/lib/peopleAccounts.js';
const stub=vi.hoisted(()=>({rpc:vi.fn(),invalidate:vi.fn()}));
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:(...args)=>stub.rpc(...args)}}));
vi.mock('@tanstack/react-query',()=>({
 useQuery:()=>({data:[],isLoading:false,isError:false,refetch:vi.fn()}),
 useQueryClient:()=>({invalidateQueries:(...args)=>stub.invalidate(...args)})
}));
vi.mock('@/components/settlement/PersonPermissions',()=>({default:()=>null}));
vi.mock('@/components/settlement/PartnerInvitationLink',()=>({default:()=>null}));
import PeopleMemberships from '../src/components/settlement/PeopleMemberships.jsx';
const personal='b'.repeat(64),shared='c'.repeat(64);
beforeEach(()=>{stub.rpc.mockReset();stub.invalidate.mockReset();stub.rpc.mockResolvedValue({data:[],error:null});});
const norm=(values={})=>resolveWalletEnrollmentIntent({hash:'',search:'',savedPersonal:'',savedJoin:'',...values});

describe('Wallet link identity and stale-token recovery',()=>{
 it('uses a newly opened shared invite instead of an expired personal token saved in browser',()=>{
  expect(norm({hash:'#join='+shared,savedPersonal:personal})).toMatchObject({kind:'join',join:shared,personal:'',invalid:false,explicit:true});
 });
 it('uses a newly opened personal invite instead of an old shared token',()=>{
  expect(norm({hash:'#personal='+personal,savedJoin:shared})).toMatchObject({kind:'personal',personal,join:'',invalid:false,explicit:true});
 });
 it('uses query invite after authentication redirect even when OAuth fragment exists',()=>{
  expect(norm({hash:'#access_token=opaque',search:'?personal='+personal,savedJoin:shared})).toMatchObject({kind:'personal',personal,join:'',invalid:false});
 });
 it('clears stale membership tokens when an explicit partner invitation is opened',()=>{
  expect(norm({hash:'#invite='+personal,savedPersonal:personal,savedJoin:shared})).toMatchObject({kind:'partner',personal:'',join:'',explicit:true});
 });
 it('does not silently fall back to cached tokens when the opened link is invalid',()=>{
  expect(norm({hash:'#personal=bad',savedJoin:shared})).toMatchObject({kind:'personal',personal:'',join:'',invalid:true});
 });
 it('fails closed for two ambiguous cached tokens with no explicit invitation',()=>{
  expect(norm({savedPersonal:personal,savedJoin:shared})).toMatchObject({kind:'ambiguous',join:'',personal:'',invalid:true});
 });
 it('still supports either legitimate cached link after verification redirect',()=>{
  expect(norm({savedPersonal:personal})).toMatchObject({kind:'personal',personal});
  expect(norm({savedJoin:shared})).toMatchObject({kind:'join',join:shared});
 });
 it.each([
  ['WALLET_INVITEE_EMAIL_MISMATCH','walletEmailMismatch'],
  ['PARTNER_INVITATION_INVALID','walletLinkInvalid'],
  ['PERSON_EMAIL_UNVERIFIED','walletEmailUnverified'],
  ['PERSON_OWNER_CANNOT_JOIN','walletOwnerCannotJoin'],
  ['WALLET_ACCOUNT_ALREADY_LINKED','walletAlreadyLinked'],
  ['PARTNER_ACCESS_DENIED','walletLoginRequired'],
 ])('turns %s into an actionable translation key instead of a generic failure',(error,key)=>{
  expect(walletMembershipErrorKey({message:error,code:'42501'})).toBe(key);
  for(const lang of ['en','ar','fa'])expect(peopleText(lang)[key]?.length).toBeGreaterThan(18);
 });
 it('renders confirmed account identity and exact mismatch action in Wallet membership UI',async()=>{
  const t=peopleText('en');
  stub.rpc.mockImplementation(async name=>name==='erp_request_person_named_account'
   ?{data:null,error:{message:'WALLET_INVITEE_EMAIL_MISMATCH'}}:{data:[],error:null});
  let tree;
  const onSwitchAccount=vi.fn();
  await act(async()=>{tree=TestRenderer.create(<PeopleMemberships
   userId="user-1" signedInEmail="wrong@example.test" joinToken={personal}
   personalJoin onSwitchAccount={onSwitchAccount} t={t}/>);});
  const switchButton=tree.root.findAllByType('button').find(b=>b.props.children==='Switch account');
  expect(switchButton).toBeDefined();
  await act(async()=>{switchButton.props.onClick();});
  expect(onSwitchAccount).toHaveBeenCalledTimes(1);
  const s=tree.root.findAllByType('input');
  await act(async()=>{s.find(x=>x.props.maxLength===120).props.onChange({target:{value:'Ahmad'}});});
  const button=tree.root.findAllByType('button').find(x=>x.props.type==='submit');
  await act(async()=>{await button.props.onClick?.();const form=tree.root.findByType('form');
   form.props.onSubmit({preventDefault(){}});await Promise.resolve();});
  expect(stub.rpc).toHaveBeenCalledWith('erp_request_person_named_account',{p_token:personal,p_name:'Ahmad'});
  const visible=JSON.stringify(tree.toJSON());
  expect(visible).toContain('wrong@example.test');
  expect(visible).toContain('DIFFERENT email');
  expect(visible).toContain('Sign out');
  expect(visible).not.toContain('Unable to complete the request. Retry.');
  expect(stub.rpc.mock.calls.some(([rpc])=>rpc==='erp_request_person_account')).toBe(false);
  await act(async()=>tree.unmount());
 });
 it('uses safe distinct errors and never changes balances, users or permissions',()=>{
  const files=[
   readFileSync(resolve(process.cwd(),'src/pages/PartnerPortal.jsx'),'utf8'),
   readFileSync(resolve(process.cwd(),'src/components/settlement/PeopleMemberships.jsx'),'utf8'),
  ].join('\n');
  expect(files).toContain('resolveWalletEnrollmentIntent');
  expect(files).toContain("sessionStorage.removeItem('people:join')");
  expect(files).toContain("sessionStorage.removeItem('people:personal')");
  expect(files).toContain('signedInEmail={session.user.email');
  expect(files).toContain('walletMembershipErrorKey');
  expect(files).toContain("fragment.delete('personal')");
  expect(files).not.toContain("supabase.from('wallet_transactions').insert");
  expect(files).not.toContain('auth.admin.updateUserById');
 });
});
