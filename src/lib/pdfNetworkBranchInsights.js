import { calculateSalesRevenue } from './helpers';

// Read-only: all rows must already be authenticated and tenant/branch scoped by
// fetchScheduledERPReportData. POS entries and bank settlements are not new sales.
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
const asDate = value => new Date(value+'T12:00:00Z');
const dayKey = date => date.toISOString().slice(0,10);
const norm = value => String(value||'').trim().toLocaleLowerCase().replace(/[_\s]+/g,' ');
const money = value => Math.round((value+Number.EPSILON)*100)/100;
const finite = value => Number.isFinite(Number(value))?Number(value):0;
const cleanName = value => String(value||'').trim().slice(0,100);
const posted = row => ['finalized','locked'].includes(row?.closing_state);
const parseEntries = sale => {
  try {
    const data=typeof sale?.pos_entries_json==='string'?JSON.parse(sale.pos_entries_json):sale?.pos_entries_json;
    return Array.isArray(data)?data:[];
  } catch { return []; }
};
const empty = () => ({network:0,total:0,closings:0,allocated:0,transactions:0});
const add = (bucket, figures) => {
  bucket.network+=figures.network;bucket.total+=figures.total;
  bucket.closings++;bucket.allocated+=figures.allocated;bucket.transactions+=figures.transactions;
};
const uniqueAliases = (branch, branches) => {
  const values = [branch.key,branch.branch_key,branch.name,branch.label,String(branch.id||'')].map(norm).filter(Boolean);
  return values.filter(value=>branches.filter(b=>
    [b.key,b.branch_key,b.name,b.label,String(b.id||'')].some(v=>norm(v)===value)).length===1);
};
function branchForSale(sale,branches) {
  if (sale.branch_id) return branches.find(b=>String(b.id)===String(sale.branch_id))||null;
  const text=norm(sale.branch||sale.branch_key);
  if(!text)return null;
  const matches=branches.filter(b=>uniqueAliases(b,branches).includes(text));
  return matches.length===1?matches[0]:null;
}
function bucketKey(date,step){
  if(step==='month')return date.slice(0,7);
  if(step==='week') {
    const d=asDate(date);
    d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
    return dayKey(d);
  }
  return date;
}
function lastWeeks(range){
  const days=Math.round((asDate(range.to)-asDate(range.from))/86400000)+1;
  return days>93?'month':days>31?'week':'day';
}

/**
 * Canonical network PDF attribution for one tenant-scoped reporting window.
 * Revenue values use exactly the same calculateSalesRevenue.network path as
 * buildSalesReportSnapshot, preventing another card-income ledger.
 */
export function buildPdfNetworkBranchInsights({
  sales=[],branches=[],range,revenueSources=[],snapshot=null,previousSnapshot=null,
}={}) {
  if(!range?.from||!range?.to||!range?.previousFrom||!range?.previousTo||
     ![range.from,range.to,range.previousFrom,range.previousTo].every(validDate) ||
     range.from>range.to||range.previousFrom>range.previousTo) throw new Error('Invalid network PDF range');
  const authorizedBranches=(branches||[]).filter(b=>b&&b.id);
  const periodRows=(sales||[]).filter(s=>posted(s)&&validDate(s.date)&&(
    (s.date>=range.from&&s.date<=range.to)||(s.date>=range.previousFrom&&s.date<=range.previousTo)
  ));
  const branchMap=new Map(authorizedBranches.map(b=>[String(b.id),{
    id:String(b.id),name:cleanName(b.name||b.label||b.key||b.branch_key||b.id),
    current:empty(),previous:empty(),
  }]));
  const unattributed={id:'__unattributed__',name:'Unattributed branch',current:empty(),previous:empty()};
  const accounts=new Map();
  const trend=new Map(),priorTrend=new Map(),weekdayTotals=Array(7).fill(0);
  const totals={current:empty(),previous:empty()};
  const step=lastWeeks(range);
  for(const row of periodRows){
    const current=row.date>=range.from&&row.date<=range.to;
    const figures=calculateSalesRevenue(row,revenueSources);
    const network=finite(figures.network),total=finite(figures.total);
    const entries=parseEntries(row);
    let allocated=0,transactions=0;
    if(current){
      for(const entry of entries){
        const value=Number(entry.amount);
        const id=String(entry.network_account_id||entry.device_id||'').trim();
        if(!id||!Number.isFinite(value)||value<0)continue;
        allocated+=value;
        transactions++;
        const record=accounts.get(id)||{id,name:cleanName(entry.device_name||entry.network_name||entry.account_name||id),value:0};
        record.value+=value;accounts.set(id,record);
      }
    }
    const values={network,total,allocated,transactions};
    add(totals[current?'current':'previous'],values);
    const branch=branchForSale(row,authorizedBranches);
    add((branch?branchMap.get(String(branch.id)):unattributed)[current?'current':'previous'],values);
    const target=current?trend:priorTrend;
    const k=bucketKey(row.date,step);
    target.set(k,(target.get(k)||0)+network);
    if(current)weekdayTotals[(asDate(row.date).getUTCDay()+6)%7]+=network;
  }
  const listed=[...branchMap.values()];
  if(unattributed.current.closings||unattributed.previous.closings)listed.push(unattributed);
  const currentNetwork=money(totals.current.network);
  const priorNetwork=money(totals.previous.network);
  const withShare=listed.map(branch=>({
    ...branch,
    current:{...branch.current,network:money(branch.current.network)},
    previous:{...branch.previous,network:money(branch.previous.network)},
    share:currentNetwork>0?money(branch.current.network/currentNetwork*100):null,
    growth:branch.previous.network>0?money((branch.current.network-branch.previous.network)/branch.previous.network*100):null,
    cardMix:branch.current.total>0?money(branch.current.network/branch.current.total*100):null,
  })).sort((a,b)=>b.current.network-a.current.network||a.name.localeCompare(b.name));
  const schedule = (from,to) => {
    const output=[];
    for(let cursor=asDate(from);dayKey(cursor)<=to;cursor.setUTCDate(cursor.getUTCDate()+1)){
      const value=dayKey(cursor),bucket=bucketKey(value,step);
      if(!output.includes(bucket))output.push(bucket);
    }
    return output;
  };
  const currentSeries=schedule(range.from,range.to).map(date=>({date,value:money(trend.get(date)||0)}));
  const previousSeries=schedule(range.previousFrom,range.previousTo).map(date=>({date,value:money(priorTrend.get(date)||0)}));
  const sourceMismatch=snapshot&&Number.isFinite(Number(snapshot.network))?
    money(Number(snapshot.network)-currentNetwork):null;
  const priorMismatch=previousSnapshot&&Number.isFinite(Number(previousSnapshot.network))?
    money(Number(previousSnapshot.network)-priorNetwork):null;
  return {
    available:true,range,interval:step,
    total:currentNetwork,previousTotal:priorNetwork,
    change:priorNetwork!==0?money((currentNetwork-priorNetwork)/Math.abs(priorNetwork)*100):null,
    shareOfAllSales:totals.current.total>0?money(currentNetwork/totals.current.total*100):null,
    currentClosings:totals.current.closings,previousClosings:totals.previous.closings,
    allocation:money(totals.current.allocated),
    allocationGap:money(currentNetwork-totals.current.allocated),
    sourceMismatch,priorMismatch,
    branches:withShare,
    trend:currentSeries,previousTrend:previousSeries,
    weekdays:weekdayTotals.map((value,index)=>({day:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][index],value:money(value)})),
    accounts:[...accounts.values()].map(row=>({...row,value:money(row.value)})).sort((a,b)=>b.value-a.value),
    // No PDF change writes into a bank account, network ledger or sales source.
  };
}