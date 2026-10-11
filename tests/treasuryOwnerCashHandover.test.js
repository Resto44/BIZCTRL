// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {buildTreasuryAccountBalances} from '../src/lib/treasuryAccounts.js';
import {computeBranchSettlements} from '../src/components/treasury/BranchSettlementLedger.jsx';

const file=path=>readFile(new URL(path,import.meta.url),'utf8');
describe('Owner/branch cash handover ERP two-leg workflow',()=>{
 it('a cash handover is zero-sum across account balances, never new sales or profit',()=>{
  const accounts=[{id:'branch',opening_balance:500},{id:'owner',opening_balance:0}];
  const tx=[
    {id:'a',transaction_type:'branch_owner_cash_handover_debit',account_id:'branch',
     restaurant_id:'r',reference_id:'transfer1',direction:'out',wallet:'branch_cash',amount:220,branch:'rayyan'},
    {id:'b',transaction_type:'branch_to_owner_cash',account_id:'owner',
     restaurant_id:'r',reference_id:'transfer1',direction:'in',wallet:'owner_cash',amount:220,branch:'rayyan'},
  ];
  expect(buildTreasuryAccountBalances(accounts,tx)).toEqual({branch:280,owner:220});
  const settlement=computeBranchSettlements(tx,[]);
  expect(settlement.rayyan.sentToOwner).toBe(220);
  expect(settlement.rayyan.returnedToBranch).toBe(0);
 });
 it('SQL enforces Owner authorization, account scope, same currency, source funds, receipt and idempotency',async()=>{
  const sql=await file('../supabase/migrations/20261011160500_treasury_ledger_audit_guards.sql');
  expect(sql).toContain('public.erp_owner_receive_branch_cash(');
  expect(sql).toContain('treasury_account_is_owner(p_restaurant_id)');
  expect(sql).toContain('TREASURY_HANDOVER_RECEIPT_REQUIRED');
  expect(sql).toContain('TREASURY_HANDOVER_CURRENCY_MISMATCH');
  expect(sql).toContain('TREASURY_HANDOVER_INSUFFICIENT_BALANCE');
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain("'branch_owner_cash_handover_debit'");
  expect(sql).toContain("'branch_to_owner_cash'");
  expect(sql).toContain('ERP_TREASURY_OPENING_BALANCE_LOCKED');
  expect(sql).toContain('ERP_POSTED_TREASURY_IMMUTABLE');
  expect(sql).not.toMatch(/insert\s+into\s+public\.daily_sales/i);
  expect(sql).not.toMatch(/update\s+public\.daily_sales/i);
 });
 it('Owner-only UI records both legs in one RPC; manual one-sided handover is disabled',async()=>{
  const page=await file('../src/pages/Treasury.jsx');
  const ui=await file('../src/components/treasury/BranchCashHandoverPanel.jsx');
  expect(page).toContain('isOwner&&<BranchCashHandoverPanel');
  expect(ui).toContain("supabase.rpc('erp_owner_receive_branch_cash'");
  expect(ui).toContain('p_owner_receipt_confirmed:true');
  expect(ui).toContain('p_request_id:requestId.current');
  expect(page).toContain("'branch_to_owner_cash',      label: 'Branch → Owner (Cash Transfer)', wallet: 'owner_cash',    direction: 'in',  auto: true");
 });
});
