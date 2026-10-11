import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {reconcileSalesToTreasury,reconcileExplicitSponsorFlows} from '../src/lib/treasuryReconciliation.js';
import {treasuryIntegrity} from '../src/lib/treasuryLedgerRead.js';
const book=[
  {id:'a',date:'2026-10-10',branch:'rayyan',closing_state:'finalized',restaurant_cash:400,restaurant_network:440},
  {id:'b',date:'2026-10-10',branch:'rayyan',closing_state:'draft',restaurant_cash:1000,restaurant_network:1800},
  {id:'c',date:'2026-10-10',branch:'rawdah',closing_state:'locked',restaurant_network:225},
];
const entry=(type,reference_id,amount,branch='rayyan',id='x')=>({
  id,transaction_type:type,reference_id,amount,branch,direction:'in',
  transaction_date:'2026-10-10',auto_generated:true,
});
const scope={from:'2026-10-01',to:'2026-10-11'};
describe('Treasury ERP reconciliation',()=>{
 it('finds valid cash and network transfers using canonical date/type and finalized Closing',()=>{
   const rows=reconcileSalesToTreasury({
    sales:book,transactions:[
      entry('cash_sales_branch','a',400),entry('network_sales_auto_v2','a',440),
      entry('network_sales_auto_v2','b',1800),
      entry('network_sales_auto_v2','c',225,'rawdah'),
    ],...scope,branch:'rayyan',
   });
   expect(rows).toHaveLength(3);
   expect(rows.filter(r=>r.status==='matched')).toHaveLength(2);
   expect(rows.filter(r=>r.status==='unaccounted')).toHaveLength(1);
   expect(rows.every(r=>r.reference!=='c')).toBe(true);
 });
 it('flags duplicate Closing posting despite amounts adding up to expected',()=>{
  const rows=reconcileSalesToTreasury({sales:[book[0]],transactions:[
    entry('cash_sales_branch','a',400),entry('network_sales_auto','a',220),
    entry('network_sales_auto_v2','a',220),
  ],...scope});
  const network=rows.find(r=>r.type==='Network sales ledger');
  expect(network.status).toBe('discrepancy');
  expect(network.postingCount).toBe(2);
  expect(network.expected).toBe(network.deposited);
 });
 it('does not misread old names when server uses canonical fields',()=>{
  const rows=reconcileSalesToTreasury({sales:[book[0]],transactions:[
   entry('cash_sales_branch','a',400),entry('network_sales_auto','a',440),
  ],...scope});
  expect(rows.map(x=>x.status)).toEqual(['matched','matched']);
 });
 it('missing journal entries are not incorrectly called missing bank deposits',()=>{
  const rows=reconcileSalesToTreasury({sales:[book[0]],transactions:[],...scope});
  expect(rows).toHaveLength(2);
  expect(rows.every(r=>r.status==='undeposited')).toBe(true);
  expect(rows.every(r=>r.deposited===0)).toBe(true);
 });
 it('does not demand sponsor payment for Owner-network sales',()=>{
  expect(reconcileExplicitSponsorFlows({sales:book,sponsorTransactions:[],...scope})).toEqual([]);
 });
 it('groups multiple daily Closings before comparing one sponsor posting',()=>{
  const rows=reconcileExplicitSponsorFlows({sales:[
    {...book[0],restaurant_network:125},{...book[0],id:'a2',restaurant_network:175},
  ],sponsorTransactions:[{date:'2026-10-10',branch:'rayyan',amount:300}],...scope});
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({saleNetwork:300,sponsorRecorded:300,status:'matched'});
 });
 it('shows cross-branch account anomalies, duplicates, negative balances and unfunded legacy credit',()=>{
  const accounts=[{id:'owner',opening_balance:0,is_active:true},
    {id:'b1',branch_id:'branch1',opening_balance:0,is_active:true}];
  const tx=[
   {id:'1',restaurant_id:'r',account_id:'b1',branch_id:null,direction:'in',amount:10},
   {id:'2',restaurant_id:'r',account_id:'owner',direction:'out',amount:40},
   {id:'3',restaurant_id:'r',account_id:'owner',direction:'in',amount:10},
   {id:'4',restaurant_id:'r',account_id:'owner',direction:'in',amount:100,
      transaction_type:'network_sales_auto',reference_id:'sale1'},
   {id:'5',restaurant_id:'r',account_id:'owner',direction:'in',amount:100,
      transaction_type:'network_sales_auto_v2',reference_id:'sale1'},
   {id:'6',restaurant_id:'r',account_id:'b1',branch_id:'branch1',direction:'in',amount:50,
      transaction_type:'owner_to_branch_funding',reference_id:'legacy-unpaired'},
  ];
  const result=treasuryIntegrity(accounts,tx);
  expect(result.branchAccountMismatches).toBe(1);
  expect(result.duplicateNetworkClosings).toBe(1);
  expect(result.unpairedFundingCredits).toBe(1);
 });
 it('Treasury Owner summary uses the complete global ledger, with protected system postings',async()=>{
  const page=await readFile(new URL('../src/pages/Treasury.jsx',import.meta.url),'utf8');
  expect(page).toContain('const overviewTransactions=isOwner?centralTransactions:transactions');
  expect(page).toContain('transactions={isOwner?centralTransactions:transactions}');
  expect(page).toContain('Posted · Locked');
  expect(page).not.toContain('WalletTransaction.delete(');
  expect(page).toContain('const ledgerCurrency=resolveTreasuryCurrency(');
  expect(page).toContain('const displayCurrency=normalizeTreasuryCurrency(currency)');
  expect(page).not.toContain("branch_to_owner_cash',      label: 'Branch → Owner (Cash Transfer)', wallet: 'owner_cash',    direction: 'in',  settlement: true");
 });
});
