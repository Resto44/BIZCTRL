import { differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarWeeks, isValid, parseISO, startOfMonth, startOfWeek, format } from 'date-fns';
import { calculateSalesRevenue } from './helpers';

// These are already filtered by tenant, branch, period and status upstream.
// Sales are FINALIZED Sales Closing payment buckets. Purchase rows are approved
// invoices from the same ERP accounting selection. Nothing is posted here.
const finite = value => {
  if (value === '' || value == null) return null;
  const number=Number(value);
  return Number.isFinite(number) ? number : null;
};
const records = data => Array.isArray(data) ? data.filter(Boolean) : [];
const dateOf = item => {
  const raw = String(item?.date || item?.invoice_date || item?.created_date || '').slice(0,10);
  const date = parseISO(raw);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && isValid(date) && format(date,'yyyy-MM-dd') === raw ? raw : null;
};
export const purchaseAmount = invoice => {
  const explicit=finite(invoice?.total_amount);
  if (explicit!=null) return explicit; // Including an approved 0.00 invoice.
  const qty=finite(invoice?.qty), price=finite(invoice?.used_price ?? invoice?.current_price);
  return qty==null || price==null ? 0 : qty*price;
};

function bucketDate(date, granularity) {
  const dt=parseISO(date);
  return format(granularity==='month' ? startOfMonth(dt) : granularity==='week'
    ? startOfWeek(dt,{weekStartsOn:0}) : dt,'yyyy-MM-dd');
}
const offset = (from,date,granularity) => {
  const a=parseISO(bucketDate(from,granularity));
  const b=parseISO(bucketDate(date,granularity));
  return granularity==='month'?differenceInCalendarMonths(b,a)
    :granularity==='week'?differenceInCalendarWeeks(b,a,{weekStartsOn:0})
    :differenceInCalendarDays(b,a);
};

function bucketed({sales,purchases,revenueSources,from,to,granularity}) {
  const map=new Map();
  const add=(raw,field,amount)=>{
    const date=dateOf(raw);
    if (!date || date<from || date>to) return;
    const key=bucketDate(date,granularity);
    const row=map.get(key)||{date:key,sales:null,purchases:null,closings:0,invoices:0};
    row[field]=(row[field]??0)+amount;
    if(field==='sales') row.closings++;
    if(field==='purchases') row.invoices++;
    map.set(key,row);
  };
  for(const sale of records(sales)) {
    if(sale.closing_state !== 'finalized') continue;
    add(sale,'sales',calculateSalesRevenue(sale,revenueSources).total);
  }
  for(const invoice of records(purchases)) add(invoice,'purchases',purchaseAmount(invoice));
  return map;
}

// Null means no recorded transactions in a bucket. Never silently substitute
// zero for a missing financial closing, and never call the margin "net profit".
export function buildExecutiveMultiMetricTrend({
  sales=[],purchases=[],previousSales=[],previousPurchases=[],revenueSources=[],
  period,granularity='day',
}={}) {
  if (!period?.currentStart || !period?.currentEnd || !period?.previousStart || !period?.previousEnd
    || !['day','week','month'].includes(granularity)) return [];
  const current=bucketed({sales,purchases,revenueSources,from:period.currentStart,to:period.currentEnd,granularity});
  const previous=bucketed({sales:previousSales,purchases:previousPurchases,revenueSources,from:period.previousStart,to:period.previousEnd,granularity});
  const observed=Array.from(current.keys()).sort();
  const old=Array.from(previous.keys()).sort();
  const anchor=bucketDate(period.currentStart,granularity);
  const priorAnchor=bucketDate(period.previousStart,granularity);
  const last=offset(anchor,period.currentEnd,granularity);
  if(last<0||last>370)return [];
  const byIndex=new Map(observed.map(date=>[offset(anchor,date,granularity),current.get(date)]));
  const before=new Map(old.map(date=>[offset(priorAnchor,date,granularity),previous.get(date)]));
  const rows=[];
  const lastDate=parseISO(anchor);
  for(let slot=0;slot<=last;slot++){
    const next=new Date(lastDate);
    if(granularity==='day')next.setDate(next.getDate()+slot);
    else if(granularity==='week')next.setDate(next.getDate()+slot*7);
    else next.setMonth(next.getMonth()+slot);
    const date=format(next,'yyyy-MM-dd');
    const c=byIndex.get(slot),p=before.get(slot);
    const purchaseGap=c?(c.sales??0)-(c.purchases??0):null;
    const prevPurchaseGap=p?(p.sales??0)-(p.purchases??0):null;
    rows.push({
      label:granularity==='month'?date.slice(0,7):date.slice(5),
      date,
      sales:c?.sales??null,purchases:c?.purchases??null,
      purchaseGap,
      prevSales:p?.sales??null,prevPurchases:p?.purchases??null,
      prevPurchaseGap,
      closings:c?.closings||0,invoices:c?.invoices||0,
    });
  }
  return rows;
}

export function executiveOperationalInsights({periodMetrics={},sales=[],purchases=[],revenueSources=[],period}={}){
  const from=period?.currentStart||'',to=period?.currentEnd||'';
  const days=Number(period?.daysInPeriod)||1;
  const totalSales=finite(periodMetrics.totalSales)??0;
  const totalPurchases=finite(periodMetrics.totalPurchaseCost)??0;
  const daily=new Map();
  let postedClosings=0;
  for(const item of records(sales)){
    if(item.closing_state!=='finalized')continue;
    const date=dateOf(item);
    if(!date||date<from||date>to)continue;
    postedClosings++;
    daily.set(date,(daily.get(date)||0)+calculateSalesRevenue(item,revenueSources).total);
  }
  const peak=[...daily.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]||null;
  const approvedInvoices=records(purchases).filter(x=>{const date=dateOf(x);return date&&date>=from&&date<=to;}).length;
  return {
    averagePerCalendarDay:days>0?totalSales/days:0,
    purchaseToSales:totalSales>0?totalPurchases/totalSales*100:null,
    peakDate:peak?.[0]||null,peakSales:peak?.[1]??null,
    closingCount:postedClosings,approvedInvoices,
    netMargin:totalSales>0&&finite(periodMetrics.netMargin)!=null?Number(periodMetrics.netMargin):null,
  };
}
