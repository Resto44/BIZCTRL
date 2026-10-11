import {getSaleCash,getSaleNetwork} from './helpers';

/**
 * Book-entry reconciliation, NOT proof that a card processor paid the bank.
 * For the selected period, every finalized sales Closing should have exactly one
 * cash and/or network auto ledger row with the same Closing reference and amount.
 */
const day = value=>String(value||'').slice(0,10);
const txType = tx=>tx?.transaction_type||tx?.type||'';
const saleStatus = sale=>String(sale?.closing_state||'finalized').toLowerCase();
const finiteNonnegative = n=>Number.isFinite(Number(n))&&Number(n)>=0;
const relevantTypes=new Set(['cash_sales_branch','network_sales_auto','network_sales_auto_v2']);
export function reconcileSalesToTreasury({
 sales=[],transactions=[],from='',to='',branch='all',
}={}){
 const filteredSales=sales.filter(s=>['finalized','locked'].includes(saleStatus(s))&&
   (!from||day(s.date)>=from)&&(!to||day(s.date)<=to)&&
   (branch==='all'||s.branch===branch));
 // A Closing and its posted entry may have different accounting dates.
 // Match against the COMPLETE tenant ledger; filter periods only for orphan rows.
 const filteredTx=transactions.filter(tx=>relevantTypes.has(txType(tx)));
 const byKey=new Map();
 const key=(ref,type)=>String(ref||'')+'::'+type;
 for(const tx of filteredTx){
   const family=txType(tx)==='cash_sales_branch'?'cash':'network';
   const id=key(tx.reference_id,family);
   byKey.set(id,[...(byKey.get(id)||[]),tx]);
 }
 const rows=[];
 const scopeSaleIds=new Set(sales.filter(s=>['finalized','locked'].includes(saleStatus(s))).map(s=>String(s.id)));
 for(const sale of filteredSales){
   for(const [family,expectedAmount,label] of [
     ['cash',getSaleCash(sale),'Cash sales ledger'],
     ['network',getSaleNetwork(sale),'Network sales ledger'],
   ]){
     const expected=Number(expectedAmount);
     const matches=byKey.get(key(sale.id,family))||[];
     if(Number.isFinite(expected)&&expected===0&&!matches.length)continue;
     const actual=matches.reduce((sum,tx)=>sum+(tx.direction==='out'?-1:1)*Number(tx.amount||0),0);
     const malformed=!finiteNonnegative(expected)||matches.some(tx=>
       !finiteNonnegative(tx.amount)||tx.direction!=='in'||
       (tx.wallet&&tx.wallet!==(family==='cash'?'branch_cash':'owner_network')));
     const branchMismatch=matches.some(tx=>
       ((sale.branch_id&&tx.branch_id)&&String(sale.branch_id)!==String(tx.branch_id))||
       (sale.branch&&tx.branch&&sale.branch!==tx.branch));
     const diff=expected-actual;
     rows.push({
       date:day(sale.date),branch:sale.branch||'—',type:label,
       expected,deposited:actual,diff,reference:sale.id,postingCount:matches.length,
       status:malformed?'discrepancy':!matches.length?'undeposited':matches.length>1||branchMismatch||Math.abs(diff)>0.009
         ?'discrepancy':'matched',
     });
   }
 }
 // Unknown or duplicate postings must never be silently counted as receipts.
 for(const tx of filteredTx){
   const recordDay=day(tx.transaction_date||tx.date);
   if((from&&recordDay<from)||(to&&recordDay>to)||(branch!=='all'&&tx.branch!==branch))continue;
   if(scopeSaleIds.has(String(tx.reference_id)))continue;
   const amt=Number(tx.amount)||0;
   rows.push({
     date:day(tx.transaction_date||tx.date),branch:tx.branch||'—',
     type:txType(tx)==='cash_sales_branch'?'Cash posting (no Closing)':'Network posting (no Closing)',
     expected:0,deposited:amt,diff:-amt,reference:tx.id,postingCount:1,status:'unaccounted',
   });
 }
 return rows.sort((a,b)=>b.date.localeCompare(a.date));
}
/**
 * Sponsor cash/network is an explicit settlement flow, not a required
 * recipient of all Owner-network sales. Missing sponsor entries alone are not
 * unrecorded funds. Compare only days/branches that really have sponsor entries.
 */
export function reconcileExplicitSponsorFlows({
 sales=[],sponsorTransactions=[],from='',to='',branch='all',
}={}){
 const totals=new Map();
 for(const sale of sales){
  if(!['finalized','locked'].includes(saleStatus(sale)))continue;
  const date=day(sale.date);
  if((from&&date<from)||(to&&date>to)||(branch!=='all'&&branch!==sale.branch))continue;
  const id=date+'::'+sale.branch;
  totals.set(id,(totals.get(id)||0)+getSaleNetwork(sale));
 }
 const sponsorAmounts=new Map();
 for(const tx of sponsorTransactions){
  const date=day(tx.date||tx.transaction_date);
  if((from&&date<from)||(to&&date>to)||(branch!=='all'&&branch!==tx.branch))continue;
  const id=date+'::'+(tx.branch||'all');
  sponsorAmounts.set(id,(sponsorAmounts.get(id)||0)+Number(tx.amount||0));
 }
 return [...sponsorAmounts.entries()].map(([id,sponsorRecorded])=>{
  const cut=id.indexOf('::');
  const date=id.slice(0,cut),branchKey=id.slice(cut+2);
  const saleNetwork=branchKey==='all'?[...totals.entries()]
   .filter(([key])=>key.startsWith(date+'::')).reduce((sum,[,amt])=>sum+amt,0)
   :(totals.get(id)||0);
  const diff=saleNetwork-sponsorRecorded;
  return {date,branch:branchKey,saleNetwork,sponsorRecorded,diff,
   status:Math.abs(diff)<0.01?'matched':'discrepancy'};
 }).sort((a,b)=>b.date.localeCompare(a.date));
}
