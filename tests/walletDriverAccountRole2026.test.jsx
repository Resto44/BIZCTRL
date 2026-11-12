// @vitest-environment jsdom
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import PersonPermissions from '../src/components/settlement/PersonPermissions.jsx';
import {peopleText,newPersonPermissions} from '../src/lib/peopleAccounts.js';

const migration=readFileSync('supabase/migrations/20261113012500_wallet_driver_account_role.sql','utf8');
const overview=readFileSync('src/components/settlement/WalletERPOverview.jsx','utf8');
const wallet=readFileSync('src/components/settlement/PeopleMemberships.jsx','utf8');
const saving=readFileSync('src/components/settlement/PartnerTreasuryCenter.jsx','utf8');
const legacy=readFileSync('supabase/migrations/20261019152000_wallet_unique_user_accounts.sql','utf8');

describe('Driver Wallet account category and approval',()=>{
 it.each(['en','ar','fa'])('labels Driver wallet role in %s',lang=>{
  expect(peopleText(lang).driver).toBeTruthy();
  expect(peopleText(lang).driver).not.toBe(peopleText(lang).employee);
 });
 it('offers Driver to Owner in the same Account role selector',async()=>{
  const onChange=vi.fn();
  const t=peopleText('en');
  let tree;
  await act(async()=>{tree=TestRenderer.create(<PersonPermissions
   value={{...newPersonPermissions(),branch_id:'branch1'}} onChange={onChange}
   branches={[{id:'branch1',name:'Main'}]} t={t}/>);});
  const all=tree.root.findAllByType('select');
  const role=all[0];
  expect(role.findAllByType('option').map(x=>x.props.value)).toEqual(
   ['partner','manager','employee','driver','supplier','customer']);
  const driver=role.findAllByType('option').find(x=>x.props.value==='driver');
  expect(driver.children.join('')).toBe('Driver wallet user');
  await act(async()=>role.props.onChange({target:{value:'driver'}}));
  expect(onChange).toHaveBeenCalledWith({
    ...newPersonPermissions(),account_role:'driver',branch_id:'branch1',
    can_submit:false,allow_loans:false,allow_custody:false,
  });
  await act(async()=>tree.unmount());
 });
 it('does not pre-authorize loans, custody or submitting on Driver selection',async()=>{
  let tree;const onChange=vi.fn();
  await act(async()=>{tree=TestRenderer.create(<PersonPermissions
    value={{account_role:'manager',branch_id:'br1',can_submit:true,allow_loans:true,allow_custody:true}}
    onChange={onChange} t={peopleText('fa')}/>);});
  await act(async()=>tree.root.findAllByType('select')[0].props.onChange({target:{value:'driver'}}));
  const updated=onChange.mock.lastCall[0];
  expect(updated).toMatchObject({account_role:'driver',branch_id:'br1',
    can_submit:false,allow_loans:false,allow_custody:false});
  await act(async()=>tree.unmount());
 });
 it('allows Driver in both the DB check and Owner-only configuration RPC',()=>{
  expect(migration).toContain("CHECK (account_role IN ('partner','manager','employee','supplier','customer','driver'))");
  expect(migration).toContain("p_role NOT IN ('partner','manager','employee','supplier','customer','driver')");
  expect(migration).toContain('treasury_account_is_owner(p.restaurant_id)');
  expect(migration).toContain("RAISE EXCEPTION 'PERSON_ROLE_HAS_HISTORY'");
  expect(migration).toContain("RAISE EXCEPTION 'PERSON_BRANCH_INVALID'");
  expect(migration).not.toMatch(/\bDELETE\s+FROM\s+(?:public\.)?(?:auth\.users|business_partners|wallet_transactions)/i);
  expect(migration).not.toMatch(/UPDATE\s+public\.(wallet_transactions|sponsor_owner_transactions|people_custody_requests)/i);
  expect(migration).not.toMatch(/GRANT\s+(?:ALL|SELECT|UPDATE)/i);
 });
 it('uses the same approved owner flow and save API for Driver',()=>{
  expect(wallet).toContain("supabase.rpc('erp_review_person_join'");
  expect(wallet).toContain('p_role:v.account_role');
  expect(saving).toContain("supabase.rpc('erp_save_person_account'");
  expect(saving).toContain('p_role:form.account_role');
  expect(legacy).toContain('PERSON_ROLE_HAS_HISTORY');
  expect(overview).toContain('Driver wallet user');
  expect(overview).toContain("p.account_role==='driver'?m.driver");
 });
});
