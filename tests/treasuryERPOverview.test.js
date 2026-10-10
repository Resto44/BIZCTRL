import {describe,expect,it,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {fetchCompleteTreasuryRows,accountsForTreasuryScope,treasuryIntegrity} from '../src/lib/treasuryLedgerRead.js';
import {buildTreasuryAccountBalances,calculateTreasuryLedgerBalance} from '../src/lib/treasuryAccounts.js';

const rows=[
{id:'t1',restaurant_id:'r1',branch_id:'b1',branch:'rayyan',account_id:'acc1',direction:'in',amount:100},
{id:'t2',restaurant_id:'r1',branch_id:'b1',branch:'rayyan',account_id:'acc1',direction:'out',amount:30},
{id:'t3',restaurant_id:'r1',branch_id:null,branch:'rayyan',account_id:null,direction:'in',amount:10},
{id:'t4',restaurant_id:'r1',branch_id:'b2',branch:'rawdah',account_id:'acc2',direction:'out',amount:40},
{id:'t5',restaurant_id:'r1',branch_id:'b2',branch:'rawdah',account_id:'acc2',direction:'in',amount:90},
];
function makeDb(input){
 return {
  from:vi.fn(table=>{
    let filters={};
    const query={
      select:()=>query,eq:(key,value)=>{filters[key]=value;return query;},
      is:(key,value)=>{filters[key]=value;return query;},
      order:()=>query,
      range:async(start,end)=>{
        let data=input.filter(x=>Object.entries(filters).every(([k,v])=>x[k]===v));
        return {data:data.slice(start,end+1),error:null};
      },
    };
    return query;
  }),
 };
}
describe('Treasury ERP read-only ledger integrity',()=>{
 it('paginates more than 2,000 rows instead of silently truncating the balance',async()=>{
  const data=Array.from({length:2005},(_,i)=>({id:'t'+i,restaurant_id:'r1',
    account_id:'acc1',direction:'in',amount:1,branch:'rayyan'}));
  const db=makeDb(data);
  const result=await fetchCompleteTreasuryRows({db,table:'wallet_transactions',
    restaurantId:'r1',allBranches:true,orderColumn:'transaction_date'});
  expect(result).toHaveLength(2005);
  expect(db.from).toHaveBeenCalledTimes(3);
  const accounts=[{id:'acc1',opening_balance:0,account_name:'Cash',branch_id:'b1'}];
  expect(calculateTreasuryLedgerBalance(accounts,result)).toBe(2005);
 });
 it('keeps canonical branch and legacy branch records, excluding other branches',async()=>{
  const db=makeDb(rows);
  const result=await fetchCompleteTreasuryRows({
    db,table:'wallet_transactions',restaurantId:'r1',
    branchId:'b1',branchKey:'rayyan',allBranches:false,pageSize:2,
    legacyColumn:'branch',orderColumn:'transaction_date',
  });
  expect(result.map(x=>x.id).sort()).toEqual(['t1','t2','t3']);
 });
 it('isolates branch accounts and prevents account/transaction scope mismatch',()=>{
  const accounts=[
   {id:'acc1',branch_id:'b1',branch_key:'rayyan',opening_balance:25},
   {id:'acc2',branch_id:'b2',branch_key:'rawdah',opening_balance:10},
   {id:'owner',branch_id:null,branch_key:null,opening_balance:500},
  ];
  const selected=accountsForTreasuryScope(accounts,{allBranches:false,branchId:'b1',branchKey:'rayyan'});
  expect(selected.map(x=>x.id)).toEqual(['acc1']);
  const branch=rows.filter(tx=>tx.branch_id==='b1'||(!tx.branch_id&&tx.branch==='rayyan'));
  const balance=buildTreasuryAccountBalances(selected,branch);
  expect(balance.acc1).toBe(95);
  expect(calculateTreasuryLedgerBalance(selected,branch)).toBe(95);
  expect(accountsForTreasuryScope(accounts,{allBranches:true})).toHaveLength(3);
 });
 it('separates unlinked legacy wallet transactions from real unknown-account references',()=>{
  const visible=[{id:'acc1',opening_balance:-45,is_active:true}];
  const all=[...visible,{id:'acc2',opening_balance:0,is_active:true}];
  const integrity=treasuryIntegrity(visible,[
   {id:'1',account_id:null,direction:'in',amount:35},
   {id:'2',account_id:'acc2',direction:'in',amount:45},
   {id:'3',account_id:'unknown',direction:'out',amount:99},
  ],all);
  expect(integrity).toEqual({legacyWalletMovements:1,unknownAccountMovements:1,negativeAccounts:1});
 });
 it('rejects a failed ledger page, never returning a plausible partial balance',async()=>{
  const db={
   from:()=>{let q={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,
    range:async(start)=>start>0?{data:null,error:new Error('Network timeout')}:
      {data:Array.from({length:2},(_,i)=>({id:'t'+i,restaurant_id:'r1'})),error:null}};return q;}
  };
  await expect(fetchCompleteTreasuryRows({db,table:'wallet_transactions',
    restaurantId:'r1',pageSize:2})).rejects.toThrow('Network timeout');
 });
 it('contains mobile-first ERP visuals without injected demo revenue',async()=>{
  const page=await readFile(new URL('../src/pages/Treasury.jsx',import.meta.url),'utf8');
  const ui=await readFile(new URL('../src/components/treasury/TreasuryERPOverview.jsx',import.meta.url),'utf8');
  expect(page).toContain('fetchCompleteTreasuryRows(');
  expect(page).toContain('accountsForTreasuryScope(');
  expect(page).toContain('treasuryIntegrity(');
  expect(page).toContain('<TreasuryERPOverview');
  expect(ui).toContain('treasury-erp-overview');
  expect(ui).toContain('dataKey="ownerIn"');
  expect(ui).toContain('dataKey="ownerOut"');
  expect(ui).not.toContain('SAR 35,000');
 });
});
