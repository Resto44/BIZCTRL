import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(p,'utf8');
const owner=src('src/components/wallet-banking/WalletBankingOwnerPortal.jsx');
const wrapper=src('src/pages/SponsorTreasury.jsx');
const portal=src('src/pages/PartnerPortal.jsx');
const bank=src('src/components/wallet-banking/WalletBankingCenter.jsx');
const sql=src('supabase/migrations/20261019202000_erp_bank_wallet_v1.sql');

describe('Wallet Banking Center mobile progressive disclosure',()=>{
 it('owner selects one verified named person account without exposing unrelated tenants',()=>{
  expect(owner).toContain("eq('restaurant_id',activeRestaurantId)");
  expect(owner).toContain("eq('is_active',true)");
  expect(owner).toContain("not('user_id','is',null)");
  expect(owner).toContain("person=query.data?.find(p=>p.id===selected)");
  expect(owner).toContain('<WalletBankingCenter key={person.id} owner person={person}');
  expect(owner).toContain('PeopleMemberships');
  expect(wrapper).toContain("role==='owner'");
  expect(wrapper).not.toContain('SponsorOwnerBilateralLedger');
 });
 it('contains real transfer, receive, statement and beneficiary actions without displaying fake account values',()=>{
  expect(bank).toContain("key:'transfer'");
  expect(bank).toContain("key:'receive'");
  expect(bank).toContain("key:'statement'");
  expect(bank).toContain("key:'beneficiaries'");
  expect(bank).toContain('setPanel(next)');
  expect(bank).toContain("panel==='review'");
  expect(bank).toContain("supabase.rpc('erp_bank_wallet_review'");
  expect(bank).not.toContain('2,450.00');
  expect(bank).not.toContain('20.00 SAR');
 });
 it('person portal uses current auth account only, no Sponsor or old wallet components',()=>{
  expect(portal).toContain("erp_partner_portal_accounts");
  expect(portal).toContain('accountRowsUnique(accounts.data||[])');
  expect(portal).toContain('conflict?null:verified.find');
  expect(portal).toContain('<WalletBankingCenter key={person.id} person={person}');
  expect(portal).not.toContain('<PartnerWorkspace');
  expect(portal).not.toContain('<WalletPortalERPOverview');
  expect(portal).not.toContain('<PartnerTransactionRequests');
 });
 it('does not merge historic loans or custody into cash wallet or show missing data as zero',()=>{
  expect(sql).toContain('legacy_migration');
  expect(sql).toContain('historical_loans_and_custody_archived_not_spendable');
  expect(sql).toContain("WHERE wallet_account_id=a.id");
  expect(bank).toContain("query.isError");
  // Missing-balance rendering is exercised in walletNavy2026.test.jsx.
 });
});
