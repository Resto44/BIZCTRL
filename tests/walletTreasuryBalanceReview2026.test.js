import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(x,'utf8');
const sql=read('supabase/migrations/20261020095000_wallet_verified_owner_funding_sources.sql');
const component=read('src/components/wallet-banking/WalletBankingCenter.jsx');
const previous=read('supabase/migrations/20261019202000_erp_bank_wallet_v1.sql');

describe('Wallet owner Treasury balance and review safety 2026-10-20',()=>{
 it('reads balances from posted account-linked Treasury entries, not an opening balance or UI default',()=>{
  expect(sql).toContain('erp_bank_wallet_owner_funding_accounts');
  expect(sql).toContain('a.opening_balance + coalesce(sum(');
  expect(sql).toContain("WHEN t.direction='in' THEN t.amount");
  expect(sql).toContain("WHEN t.direction='out' THEN -t.amount");
  expect(sql).toContain("t.account_id=a.id AND t.restaurant_id=a.restaurant_id");
  expect(sql).toContain('GROUP BY a.id');
  expect(component).toContain("supabase.rpc('erp_bank_wallet_owner_funding_accounts'");
  expect(component).toContain('Number(x.available_balance)');
  expect(component).not.toContain("supabase.from('treasury_accounts')");
 });
 it('restricts balances to authorized owner and eligible accounts of exactly the requested currency',()=>{
  expect(sql).toContain("treasury_account_is_owner(p_restaurant)");
  expect(sql).toContain("a.restaurant_id=p_restaurant AND a.currency=p_currency");
  expect(sql).toContain("a.is_active AND a.branch_id IS NULL AND a.branch_key IS NULL");
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.erp_bank_wallet_owner_funding_accounts(uuid,text) FROM PUBLIC,anon");
  expect(sql).toContain("TO authenticated");
  expect(component).toContain("queryKey:['erp-bank-wallet-treasury',person?.restaurant_id,activeCurrency]");
  expect(component).toContain('p_restaurant:person.restaurant_id,p_currency:activeCurrency');
 });
 it('does not permit a duplicate or unfunded posted transfer while displaying available owner balances',()=>{
  expect(sql).toContain('WALLET_TREASURY_INSUFFICIENT_FUNDS');
  expect(sql).toContain('WALLET_OWNER_APPROVAL_REQUIRED');
  expect(sql).toContain('WALLET_INSUFFICIENT_FUNDS');
  expect(sql).toContain('SELECT * INTO r FROM public.erp_bank_wallet_requests WHERE id=p_request_id FOR UPDATE');
  expect(sql).toContain("IF r.status<>'pending'");
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain('FOR UPDATE');
  expect(sql).toContain('erp_bank_wallet_postings');
  expect(sql).toContain('treasury_transaction_id=v_treasury_tx');
  expect(component).toContain('sufficientForFunding');
  expect(component).toContain("selectedTreasury.available_balance");
  expect(component).toContain("reviewNote.trim().length>=8");
  expect(component).toContain('disabled={!canApprove}');
 });
 it('prioritizes legacy owner network vs cash source identity over stale account_type',()=>{
  expect(sql).toContain("WHEN a.legacy_wallet_key='owner_network' THEN 'network'");
  expect(sql).toContain("WHEN a.legacy_wallet_key='owner_cash' THEN 'cash'");
  expect(sql).toContain("WHEN a.account_type IN('cash','petty_cash') THEN 'cash'");
  expect(previous).toContain('erp_bank_wallet_treasury_immutable');
 });
 it('changes no recorded transaction, historical ledger, or artificial test money',()=>{
  expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
  expect(sql).not.toMatch(/\bUPDATE\s+public\.(wallet_transactions|treasury_accounts|erp_bank_wallet_postings|erp_bank_wallet_requests)\b/i);
  expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.(treasury_accounts|erp_bank_wallet_requests)\b/i);
  expect(component).not.toContain('3513.00');
  expect(component).not.toContain('45.00');
  expect(component).toContain('client.invalidateQueries');
  expect(component).toContain('accounts.refetch()');
 });
});
