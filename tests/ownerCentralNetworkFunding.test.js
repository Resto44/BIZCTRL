// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {summarizeOwnerNetworkClosings} from '../src/components/treasury/CentralOwnerTreasuryPanel.jsx';
import {computeBranchSettlements} from '../src/components/treasury/BranchSettlementLedger.jsx';
import {buildTreasuryAccountBalances} from '../src/lib/treasuryAccounts.js';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
describe('Central Owner network & branch funding',()=>{
 it('only counts finalized network closings, never drafts or credit as network income',()=>{
  const rows=[
   {id:'a',closing_state:'finalized',restaurant_network:440,credit:100},
   {id:'b',closing_state:'locked',restaurant_network:180},
   {id:'c',closing_state:'draft',restaurant_network:900},
   {id:'d',closing_state:'finalized',restaurant_network:0},
  ];
  const tx=[
   {transaction_type:'network_sales_auto',reference_id:'a',direction:'in',amount:440},
   {transaction_type:'network_sales_auto_v2',reference_id:'b',direction:'in',amount:180},
   {transaction_type:'network_sales_auto',reference_id:'orphan',direction:'in',amount:500},
  ];
  expect(summarizeOwnerNetworkClosings(rows,tx)).toEqual({
    sales:620,linked:620,missing:0,unlinkedHistorical:1,
  });
 });
 it('does not recognize a posting made to the wrong wallet or branch',()=>{
  const sale={id:'a',closing_state:'finalized',restaurant_network:100,branch:'b'};
  for(const change of [{wallet:'branch_cash'},{branch:'other'}]){
   expect(summarizeOwnerNetworkClosings([sale],[{transaction_type:'network_sales_auto_v2',
    reference_id:'a',direction:'in',amount:100,...change}])).toMatchObject({linked:0,missing:1});
  }
 });
 it('a missing Closing posting is shown as incomplete, not silently counted as funds',()=>{
  const m=summarizeOwnerNetworkClosings([{id:'a',closing_state:'finalized',restaurant_network:500}],[]);
  expect(m).toMatchObject({sales:500,linked:0,missing:1});
 });
 it('owner debit and branch credit net to zero: funding cannot inflate business income',()=>{
  const accounts=[
    {id:'owner',opening_balance:1000},{id:'branch',opening_balance:0},
  ];
  const tx=[
   {transaction_type:'network_sales_auto_v2',account_id:'owner',direction:'in',wallet:'owner_network',
     branch:'rayyan',amount:400,reference_id:'closing1'},
   {transaction_type:'owner_branch_funding_debit',account_id:'owner',direction:'out',wallet:'owner_network',
     branch:'rayyan',amount:250,reference_id:'request1'},
   {transaction_type:'owner_to_branch_funding',account_id:'branch',direction:'in',wallet:'branch_cash',
     branch:'rayyan',amount:250,reference_id:'request1'},
  ];
  const b=buildTreasuryAccountBalances(accounts,tx);
  expect(b).toEqual({owner:1150,branch:250});
  expect(Object.values(b).reduce((s,v)=>s+v,0)).toBe(1400);
  const settlement=computeBranchSettlements(tx,[]);
  expect(settlement.rayyan.sentToOwner).toBe(400);
  expect(settlement.rayyan.returnedToBranch).toBe(250);
  expect(settlement.rayyan.remaining).toBe(150);
 });
 it('migration ensures owner-only RPC, precise amount, matched currencies, deduplicated closing and dual writes',async()=>{
  const sql=await read('../supabase/migrations/20261011084500_owner_central_network_branch_funding.sql');
  expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_network_closing_v2");
  expect(sql).toContain("pg_advisory_xact_lock");
  expect(sql).toContain("transaction_type='network_sales_auto'");
  expect(sql).toContain("transaction_type='network_sales_auto_v2'");
  expect(sql).toContain('treasury_account_is_owner');
  expect(sql).toContain('OWNER_FUNDING_INSUFFICIENT_BALANCE');
  expect(sql).toContain('OWNER_FUNDING_BRANCH_RECEIPT_NOT_CONFIRMED');
  expect(sql).toContain('OWNER_FUNDING_NETWORK_SETTLEMENT_NOT_CONFIRMED');
  expect(sql).toContain("'owner_branch_funding_debit'");
  expect(sql).toContain("'owner_to_branch_funding'");
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.erp_owner_fund_branch");
  expect(sql).not.toMatch(/update\s+public\.daily_sales\s+set/i);
  expect(sql).not.toMatch(/insert\s+into\s+public\.daily_sales/i);
 });
 it('Treasury offers only atomic Owner funding and full-branch view',async()=>{
  const page=await read('../src/pages/Treasury.jsx');
  const panel=await read('../src/components/treasury/CentralOwnerTreasuryPanel.jsx');
  expect(page).toContain('<CentralOwnerTreasuryPanel');
  expect(page).toContain("queryKey:['treasury_owner_central_transactions'");
  expect(page).toContain("queryKey:['treasury_owner_central_closings'");
  expect(page).toContain("'owner_to_branch_funding',   label: 'Owner → Branch (Funding)',        wallet: 'branch_cash',   direction: 'in',  auto: true");
  expect(panel).toContain("supabase.rpc('erp_owner_fund_branch'");
  expect(panel).toContain('p_branch_receipt_confirmed:Boolean(receiptConfirmed)');
  expect(panel).toContain('p_network_settlement_confirmed:Boolean(settlementConfirmed)');
  expect(panel).toContain('p_request_id:requestId.current');
 });
});