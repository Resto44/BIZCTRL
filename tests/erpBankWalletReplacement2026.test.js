import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const r=p=>readFileSync(p,'utf8');
const sql=r('supabase/migrations/20261019202000_erp_bank_wallet_v1.sql');
const ui=r('src/components/wallet-banking/WalletBankingCenter.jsx');
const owner=r('src/components/wallet-banking/WalletBankingOwnerPortal.jsx');
const route=r('src/pages/SponsorTreasury.jsx');
const personal=r('src/pages/PartnerPortal.jsx');
const app=r('src/App.jsx');
const sidebar=r('src/components/layout/ERPSidebar.jsx');

describe('Replacement Wallet Banking Center',()=>{
 it('replaces old owner and person wallet screens but retains legacy route compatibility',()=>{
  expect(route).toContain('WalletBankingOwnerPortal');
  expect(route).not.toContain('SponsorOwnerBilateralLedger');
  expect(route).not.toContain('PartnerTreasuryCenter');
  expect(route).not.toContain('SponsorLedger');
  expect(personal).toContain('WalletBankingCenter');
  expect(personal).not.toContain('WalletPortalERPOverview');
  expect(personal).not.toContain('PartnerTransactionRequests');
  expect(personal).not.toContain('PartnerWorkspace');
  expect(sidebar).toContain("path: '/wallet-banking', label: 'Wallet Banking Center'");
  expect(app).toContain('path="/wallet-banking"');
  expect(app).toContain('path="/sponsor-treasury"');
  expect(app).toContain('path="/partner-portal"');
  expect(app).toContain('path="/wallet-portal"');
 });
 it('has a separate person-identified currency wallet and append-only double-entry ledger',()=>{
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.erp_bank_wallet_accounts');
  expect(sql).toContain('UNIQUE(restaurant_id,person_id,currency)');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.erp_bank_wallet_postings');
  expect(sql).toContain("side IN('person','owner_clearing')");
  expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED');
  expect(sql).toContain('v_count<>2 OR v_sum<>0');
  expect(sql).toContain('erp_bank_wallet_no_history_mutation');
  expect(sql).toContain('erp_bank_wallet_treasury_immutable');
  expect(sql).toContain("reference_id LIKE 'bank_wallet:%'");
 });
 it('keeps historical sponsor and custody records intact, never fabricates opening balances',()=>{
  expect(sql).not.toMatch(/\bDELETE\s+FROM\s+public\.(sponsor_owner_transactions|people_custody_requests|wallet_transactions)\b/i);
  expect(sql).not.toMatch(/\bUPDATE\s+public\.(sponsor_owner_transactions|people_custody_requests)\b/i);
  expect(sql).toContain("historical_loans_and_custody_archived_not_spendable");
  expect(sql).toContain("coalesce(sum(signed_amount) FILTER(WHERE side='person')");
  expect(sql).toContain("FILTER(WHERE side='person')");
  expect(ui).not.toContain('2,450.00');
  expect(ui).not.toContain('5,200.00');
  expect(ui).not.toContain('2,750.00');
 });
 it('guards all operations on the backend; persons submit and only separate owner approves',()=>{
  expect(sql.match(/IF auth\.uid\(\) IS NULL/g).length).toBeGreaterThanOrEqual(3);
  expect(sql).toContain("p.user_id IS DISTINCT FROM auth.uid()");
  expect(sql).toContain('r.created_by=auth.uid()');
  expect(sql).toContain('treasury_account_is_owner(r.restaurant_id)');
  expect(sql).toContain("coalesce(v_treasury_available,0)<r.amount");
  expect(sql).toContain("IF v_balance<r.amount");
  expect(sql).toContain("status='active' FOR UPDATE");
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain('ON CONFLICT(restaurant_id,person_id,currency) DO NOTHING');
  expect(sql).toContain('WALLET_IDEMPOTENCY_CONFLICT');
  expect(sql).toContain('ON public.wallet_transactions(reference_id)');
  expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_dashboard');
  expect(sql).toContain('TO authenticated');
  expect(sql).toContain('FROM PUBLIC,anon');
  expect(sql).toContain('REVOKE ALL ON public.erp_bank_wallet_accounts');
  expect(sql).toContain('ALTER TABLE public.erp_bank_wallet_postings ENABLE ROW LEVEL SECURITY');
 });
 it('uses the same owner treasury currency and posts both sides of an internal transfer atomically',()=>{
  expect(sql).toContain('currency=r.currency AND is_active');
  expect(sql).toContain("branch_id IS NULL AND branch_key IS NULL");
  expect(sql).toContain("CASE WHEN v_funding THEN 'out' ELSE 'in' END");
  expect(sql).toContain("CASE WHEN v_funding THEN r.amount ELSE -r.amount END");
  expect(sql).toContain("CASE WHEN v_funding THEN -r.amount ELSE r.amount END");
  expect(sql).toContain("UPDATE public.erp_bank_wallet_requests SET status='posted'");
  expect(sql).toContain('treasury_transaction_id=v_treasury_tx');
 });
 it('renders bank-style UI actions, different states and live data without inventing balances',()=>{
  for(const name of ['Available Wallet Balance','Pending Transfers','Transfers In','Transfers Out','Recent Transactions','Quick Actions','Linked to Owner Treasury','Transfer','Receive','Statement','Beneficiaries']){
   expect(ui).toContain(name);
  }
  expect(ui).toContain("supabase.rpc('erp_bank_wallet_dashboard'");
  expect(ui).toContain("supabase.rpc('erp_bank_wallet_request'");
  expect(ui).toContain("supabase.rpc('erp_bank_wallet_review'");
  expect(ui).toContain('p_request_id:requestId');
  expect(ui).toContain('setRequestId(crypto.randomUUID())');
  expect(ui).toContain("current?.balance??0");
  expect(ui).toContain("query.isError");
  expect(ui).toContain("r.status==='posted'");
  expect(ui).toContain("r.status==='pending'");
  expect(ui).toContain('r.payer');
  expect(ui).toContain('r.payee');
  expect(ui).toContain("dir={lang==='en'?'ltr':'rtl'}");
  expect(owner).toContain('PeopleMemberships');
  expect(personal).toContain('erp_partner_portal_accounts');
  expect(personal).toContain('erp_accept_partner_invitation');
 });
});
