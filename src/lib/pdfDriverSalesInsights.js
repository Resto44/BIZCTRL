// Read-only Driver Sales intelligence for the existing third PDF page.
// Driver collections are ALREADY included in Sales Closing cash/network buckets.
// NEVER add these values to report sales, payment methods or bank settlements.
const cents = v => Math.round((Number(v) + Number.EPSILON)*100)/100;
const amount = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
const dateOf = value => String(value||'').slice(0,10);
const between = (value,from,to) => value>=from&&value<=to;
const same = (a,b) => String(a||'') === String(b||'');
const cleanName = value => String(value||'').trim().slice(0,100);
const empty = () => ({sales:0,cash:0,network:0,entries:0});
const add = (total,row) => {
  total.sales += amount(row.total_amount);
  total.cash += amount(row.cash_amount);
  total.network += amount(row.network_amount);
  total.entries++;
};
const finalize = row => ({...row,sales:cents(row.sales),cash:cents(row.cash),
  network:cents(row.network),entries:row.entries});

function stepFor(from,to){
  const days=Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1;
  return days>120?'month':days>35?'week':'day';
}
function bucketFor(value,step){
  if(step==='month')return value.slice(0,7);
  if(step==='week'){
    const d=new Date(value+'T12:00:00Z');
    d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
    return d.toISOString().slice(0,10);
  }
  return value;
}
function allBuckets(from,to,step) {
  const out=new Set();
  for(let d=new Date(from+'T12:00:00Z');d.toISOString().slice(0,10)<=to;d.setUTCDate(d.getUTCDate()+1)){
    out.add(bucketFor(d.toISOString().slice(0,10),step));
    if(out.size>400)throw new Error('PDF_DRIVER_PERIOD_TOO_LARGE');
  }
  return [...out];
}
const normalizeSeries = (map,from,to,step) =>
  allBuckets(from,to,step).map(date=>({date,value:cents(map.get(date)||0)}));

/** Strictly tenant/branch/date-scoped subset of finalized closings.
 * Missing source inputs result in an explicit unavailable model, never "zero driver sales".
 */
export function buildPdfDriverSalesInsights({
  driverSalesEntries = null,drivers = null,sales = [],
  branches = [],range = undefined,snapshot = null,
}={}) {
  if(!Array.isArray(driverSalesEntries)||!Array.isArray(drivers))
    return {available:false,reason:'DRIVER_SOURCE_NOT_LOADED'};
  if(!range?.from||!range?.to||!range?.previousFrom||!range?.previousTo||
     ![range.from,range.to,range.previousFrom,range.previousTo].every(validDate) ||
     range.from>range.to||range.previousFrom>range.previousTo)
    throw new Error('INVALID_PDF_DRIVER_PERIOD');

  const branchIds = new Set((branches||[]).map(b=>String(b?.id||'')).filter(Boolean));
  const authorizedDrivers = new Map(drivers.filter(d=>d?.id&&branchIds.has(String(d.branch_id)))
    .map(d=>[String(d.id),d]));
  const posted = new Map(sales.filter(s=>s?.id&&['finalized','locked'].includes(s.closing_state) &&
    branchIds.has(String(s.branch_id))).map(s=>[String(s.id),s]));
  const seen = new Set(),totals=empty(),prior=empty();
  const ranks=new Map(),daily=new Map(),previousDaily=new Map();
  const byBranch=new Map(),driverIds=new Set();
  let sourceMismatch=0,ignored=0;

  for(const entry of driverSalesEntries){
    if(!entry?.id||seen.has(String(entry.id)))continue;
    seen.add(String(entry.id));
    if(entry.status!=='finalized')continue;
    const date=dateOf(entry.date);
    const now=between(date,range.from,range.to);
    const before=between(date,range.previousFrom,range.previousTo);
    if(!validDate(date)||(!now&&!before))continue;
    const closing=posted.get(String(entry.closing_id));
    const driver=authorizedDrivers.get(String(entry.driver_id));
    if(!closing||!driver ||
      !same(entry.restaurant_id,closing.restaurant_id) ||
      !same(entry.restaurant_id,driver.restaurant_id) ||
      !same(entry.branch_id,closing.branch_id) ||
      !same(entry.branch_id,driver.branch_id) ||
      !same(date,closing.date)) {ignored++;continue;}

    const cash=amount(entry.cash_amount),network=amount(entry.network_amount),
      total=amount(entry.total_amount);
    if(cash<0||network<0||total<0||Math.abs(cash+network-total)>.011){
      sourceMismatch++;continue;
    }
    const target=now?totals:prior;
    add(target,entry);
    const targetTrend=now?daily:previousDaily;
    targetTrend.set(date,(targetTrend.get(date)||0)+total);
    if(now){
      driverIds.add(String(driver.id));
      const rank=ranks.get(String(driver.id))||{
        id:String(driver.id),name:cleanName(driver.full_name||driver.name||'Driver'),
        branch_id:String(driver.branch_id),...empty()
      };
      add(rank,entry);ranks.set(String(driver.id),rank);
      const branch=byBranch.get(String(driver.branch_id))||empty();
      add(branch,entry);byBranch.set(String(driver.branch_id),branch);
    }
  }

  const step=stepFor(range.from,range.to);
  const bucket=(data,from,to)=>{
    const mapped=new Map();
    for(const [date,value] of data) {
      const key=bucketFor(date,step);
      mapped.set(key,(mapped.get(key)||0)+value);
    }
    return normalizeSeries(mapped,from,to,step);
  };
  const current=finalize(totals),previous=finalize(prior);
  const ranking=[...ranks.values()].map(row=>({...row,...finalize(row),
    share:current.sales>0?cents(row.sales/current.sales*100):null}))
    .sort((a,b)=>b.sales-a.sales||a.name.localeCompare(b.name));
  const days=[...daily.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const ratio=current.sales>0?cents(current.network/current.sales*100):null;
  const totalRevenue=Number(snapshot?.sales);
  const exceedsTotal=Number.isFinite(totalRevenue)&&current.sales>totalRevenue+.01;
  return {
    available:true,range,interval:step,
    current,previous,
    change:previous.sales>0?cents((current.sales-previous.sales)/previous.sales*100):null,
    cardShare:ratio,driversWithSales:driverIds.size,
    activeDrivers:authorizedDrivers.size,topDrivers:ranking,
    branches:[...byBranch].map(([id,row])=>({id,...finalize(row)}))
      .sort((a,b)=>b.sales-a.sales),
    peak:days.length?{date:days[0][0],sales:cents(days[0][1])}:null,
    trend:bucket(daily,range.from,range.to),
    previousTrend:bucket(previousDaily,range.previousFrom,range.previousTo),
    sourceMismatch,ignored,exceedsTotal,
    // These figures are attribution within the verified Sales Closing total,
    // not a new sales, cash drawer or extra revenue source.
  };
}
