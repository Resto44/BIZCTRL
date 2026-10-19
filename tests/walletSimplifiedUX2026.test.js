import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(path,'utf8');
const owner=src('src/components/settlement/WalletERPOverview.jsx');
const center=src('src/components/settlement/PartnerTreasuryCenter.jsx');
const portal=src('src/pages/PartnerPortal.jsx');
const user=src('src/components/settlement/WalletPortalERPOverview.jsx');

describe('October wallet mobile progressive disclosure',()=>{
 it('keeps owner person rows collapsed by default and exposes actions only after opening that person',()=>{
  expect(owner).toContain("const [expanded,setExpanded]=useState('')");
  expect(owner).toContain('aria-expanded={open}');
  expect(owner).toContain('{open&&<div');
  expect(owner).toContain('onEdit(p)');
  expect(owner).toContain('onLedger()');
  expect(owner).toContain("value={filter}");
  expect(owner).not.toContain("['all','partners','staff','active','inactive'].map(k=><button");
 });
 it('shows one approval type at a time and keeps person selection available on detail pages',()=>{
  expect(center).toContain("requestTab==='custody'?");
  expect(center).toContain("view==='ledger'||view==='requests'");
  expect(center).toContain('onChange={e=>{setSelected(e.target.value);setRecordSignal(0);}}');
  expect(center).toContain('erp_save_person_account');
 });
 it('mounts only the selected personal workflow with statement authorization',()=>{
  expect(portal).toContain("workspace==='overview'&&<WalletPortalERPOverview");
  expect(portal).toContain("workspace==='requests'&&<section");
  expect(portal).toContain("workspace==='statement'&&<PartnerWorkspace");
  expect(portal).toContain("statement.isError?");
  expect(portal).toContain("requestKind==='custody'?");
  expect(portal).not.toContain("supabase.from('wallet_transactions').insert");
 });
 it('never conflates personal principal and custody or reveals unknown values as zero',()=>{
  expect(user).toContain("loans?.owner_owes");
  expect(user).toContain("loans?.partner_owes");
  expect(user).toContain("readCashCustodyAndPending");
  expect(user).toContain("aria-expanded={showCustody}");
  expect(user).toContain("query.isError?'—'");
  expect(user).not.toContain('Available to Withdraw');
 });
});
