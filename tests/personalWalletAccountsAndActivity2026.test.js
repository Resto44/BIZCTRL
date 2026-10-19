import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {walletAccountReference,accountRowsUnique,recentWalletActivity} from '../src/lib/walletPersonalActivity.js';
const read=p=>readFileSync(p,'utf8');
const sql=read('supabase/migrations/20261019152000_wallet_unique_user_accounts.sql');
const portal=read('src/pages/PartnerPortal.jsx');
const card=read('src/components/settlement/WalletPortalERPOverview.jsx');
const activity=read('src/components/settlement/WalletUnifiedActivity.jsx');
const permissions=read('src/components/settlement/PersonPermissions.jsx');
const owner=read('src/components/settlement/WalletERPOverview.jsx');
const ac1='dd7d93b0-3d43-4ec0-8967-e9102e638780',ac2='694220a5-2d01-4daa-acfd-cf040f2ab809';

describe('Verified named internal accounts cannot silently duplicate',()=>{
 it('uses a stable unique ID rather than inventing a bank account or IBAN',()=>{
  expect(walletAccountReference(ac1)).toBe('WLT-DD7D93B03D434EC08967E9102E638780');
  expect(walletAccountReference(ac1)).toBe(walletAccountReference(ac1));
  expect(walletAccountReference('oops')).toBe('');
 });
 it('rejects duplicate IDs and two accounts of the same login under one business, but permits different businesses',()=>{
  const rows=[
   {id:ac1,restaurant_id:'restaurant-A'},
   {id:ac1,restaurant_id:'restaurant-A'},
   {id:ac2,restaurant_id:'restaurant-A'},
   {id:ac2,restaurant_id:'restaurant-B'},
  ];
  expect(accountRowsUnique(rows)).toEqual([rows[0],rows[3]]);
  expect(accountRowsUnique([rows[0],{id:ac2,restaurant_id:'restaurant-B'}])).toHaveLength(2);
 });
 it('enforces uniqueness in SQL by verified user + restaurant, preserving existing payments',()=>{
  expect(sql).toContain('HAVING count(*)>1');
  expect(sql).toContain("RAISE EXCEPTION 'WALLET_DUPLICATE_VERIFIED_ACCOUNT_REVIEW_REQUIRED'");
  expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS business_partners_one_account_per_verified_user');
  expect(sql).toContain('ON public.business_partners(restaurant_id,user_id)');
  expect(sql).toContain('WHERE user_id IS NOT NULL');
  expect(sql).toContain('p.user_id=auth.uid()');
  expect(sql).toContain("u.email_confirmed_at IS NOT NULL");
  expect(sql).toContain("'login_email',u.email");
  expect(sql).toContain("'restaurant_id',p.restaurant_id");
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.erp_partner_portal_accounts() FROM PUBLIC,anon");
  expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  expect(sql).not.toMatch(/\bUPDATE\s+(public\.)?(wallet_transactions|sponsor_owner_transactions|people_custody_requests)\b/i);
 });
 it('supports supplier/customer wallet roles without granting supplier/customer ERP data access',()=>{
  expect(sql).toContain("'supplier','customer'");
  expect(sql).toContain('treasury_account_is_owner(p.restaurant_id)');
  expect(sql).toContain("'PERSON_ROLE_HAS_HISTORY'");
  expect(sql).toContain('person_permissions_updated');
  expect(sql).not.toContain('GRANT SELECT ON');
  expect(permissions).toContain("'supplier','customer'");
  expect(permissions).toContain('allow_loans:false,allow_custody:false');
 });
 it('never presents incomplete or conflicting verified wallet identity data as a valid account',()=>{
  expect(portal).toContain('accountRowsUnique(accounts.data||[])');
  expect(portal).toContain('integrityError?null:verifiedAccounts.find');
  expect(portal).toContain('integrityError?<p role="alert"');
  expect(portal).toContain('verifiedAccounts.map');
  expect(card).toContain('partner.account_reference||walletAccountReference(partner.id)');
  expect(card).toContain('partner.login_email');
  expect(card).toContain('not a bank account');
  expect(owner).toContain('<OwnerWalletPersonActivity');
  expect(read('src/components/settlement/OwnerWalletPersonActivity.jsx')).toContain('walletAccountReference(person.id)');
 });
});

describe('Internal banking-style activity is source-separated',()=>{
 const loans=[
  {id:ac1,kind:'owner_advance_to_sponsor',amount:35,currency:'SAR',effective_date:'2026-10-18',payment_method:'network',confirmed_at:null},
  {id:ac1,kind:'owner_advance_to_sponsor',amount:35,currency:'SAR',effective_date:'2026-10-18',payment_method:'network'},
  {id:ac2,kind:'sponsor_repay_owner',amount:15,currency:'SAR',effective_date:'2026-10-19',payment_method:'cash',confirmed_at:'2026-10-19T10:00:00Z'},
  {id:'u',kind:'sponsor_advance_to_owner',amount:100,currency:'USD',effective_date:'2026-10-19'},
 ];
 const custody=[
  {id:ac1,kind:'custody_received',amount:50,currency:'SAR',status:'pending',created_at:'2026-10-19T10:20:00Z',effective_date:'2026-10-19',payment_method:'cash'},
  {id:ac2,kind:'custody_received',amount:20,currency:'SAR',status:'approved',created_at:'2026-10-18T15:00:00Z',effective_date:'2026-10-18',payment_method:'cash',reversed_by:'z'},
  {id:'z',kind:'custody_returned',amount:20,currency:'SAR',status:'approved',created_at:'2026-10-19T11:00:00Z',effective_date:'2026-10-19',payment_method:'cash',reverses_id:ac2},
 ];
 it('does not repeat source row or net loans against business custody; separates request and posted statuses',()=>{
  const all=recentWalletActivity({loans,custody,currency:'SAR'});
  expect(all).toHaveLength(5);
  expect(all.filter(x=>x.source==='personal_advance')).toHaveLength(2);
  expect(all.filter(x=>x.source==='business_custody')).toHaveLength(3);
  expect(all.find(x=>x.key==='loan:'+ac1)).toMatchObject({status:'posted',confirmation:'awaiting_recipient',direction:'incoming'});
  expect(all.find(x=>x.key==='custody:'+ac1)).toMatchObject({status:'pending',direction:'incoming'});
  expect(all.find(x=>x.key==='custody:'+ac2).status).toBe('reversed');
  expect(all.find(x=>x.key==='custody:z').status).toBe('reversal_posted');
  expect(recentWalletActivity({loans,custody,currency:'USD'})).toHaveLength(1);
  expect(recentWalletActivity({loans,custody,currency:'SAR',limit:2})).toHaveLength(2);
 });
 it('uses real backend sources and explains limits, never writes balances from the feed',()=>{
  expect(card).toContain("erp_person_custody");
  expect(card).toContain('<WalletUnifiedActivity loans={statement?.records||[]} custody={query.data?.records||[]}');
  expect(activity).toContain('Recent account activity');
  expect(activity).toContain('Personal finance statement');
  expect(activity).toContain('Business funds');
  expect(activity).toContain('Custody requests');
  expect(activity).toContain('onClick={onStatement}');
  expect(activity).not.toContain('wallet_balance=');
  expect(card).not.toContain('supabase.from(');
 });
});
