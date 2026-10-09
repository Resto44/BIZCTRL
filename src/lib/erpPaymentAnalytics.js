import { calculateSalesRevenue } from './helpers';

/**
 * ERP Payment Analytics: mutually exclusive tender buckets versus overlapping
 * operational sales-source snapshots. The latter are drill-downs, not additive
 * payment methods. Never add sales_sources_json to canonical revenue.
 */
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const finalized = sale => ['finalized','locked'].includes(sale?.closing_state);
const dateWithin = (record,from,to) => typeof record?.date === 'string' && record.date >= from && record.date <= to;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PAYMENT_BUCKETS = Object.freeze([
  {key:'cash',color:'#10b981'},
  {key:'network',color:'#2563eb'},
  {key:'credit',color:'#8b5cf6'},
  {key:'other',color:'#f59e0b'},
]);

export function sourceDisplayName(entry, lang='en', config=null) {
  const fields = lang === 'ar' ? ['name_ar','name_en','name_fa','name','label']
    : lang === 'fa' ? ['name_fa','name_ar','name_en','name','label']
    : ['name_en','name_ar','name_fa','name','label'];
  for (const row of [entry,config]) for(const field of fields) {
    const name=String(row?.[field] ?? '').trim();
    if(name && !uuid.test(name)) return name.slice(0,75);
  }
  const fallback=String(entry?.source_key || config?.system_key || '').trim();
  if (fallback && !uuid.test(fallback)) return fallback.slice(0,75);
  return lang==='ar' ? 'مصدر آخر' : lang==='fa' ? 'منبع دیگر' : 'Other source';
}
function parseEntries(raw) {
  if(!raw) return [];
  try {
    const parsed=typeof raw==='string'?JSON.parse(raw):raw;
    return Array.isArray(parsed)?parsed:(parsed && typeof parsed==='object'?[parsed]:[]);
  } catch {return [];}
}
function groupKey(date,period) {return period==='year'?date.slice(0,7):date;}
function bucketAmounts(record,revenueSources=[]) {
  const r=calculateSalesRevenue(record,revenueSources);
  return {cash:r.cash,network:r.network,credit:r.credit,other:r.customSources};
}
function percentage(current,previous) {
  return previous>0 ? ((current-previous)/previous)*100 : null;
}
const daysForTrend = (snapshot) => (snapshot?.breakdown||[]).map(day=>day.date);

/** @returns canonical sales, non-additive source details, and time-series data */
export function buildERPFinancialPaymentAnalytics({
 sales=[], range, snapshot, revenueSources=[], lang='en', selectedSource='all',
}={}){
 if(!range?.from || !range?.to || !snapshot) throw new Error('Payment report requires a selected valid period');
 const periodSales=sales.filter(s=>finalized(s) && dateWithin(s,range.from,range.to));
 const previousSales=sales.filter(s=>finalized(s) && dateWithin(s,range.previousFrom,range.previousTo));
 const total=amount(snapshot.sales);
 const channels=PAYMENT_BUCKETS.map((spec)=>{
  const value=amount(snapshot[spec.key]);
  const prev=previousSales.reduce((sum,record)=>sum+bucketAmounts(record,revenueSources)[spec.key],0);
  return {...spec,value,previous:prev,pct:total>0?value/total*100:0,change:percentage(value,prev)};
 });
 const reconciled=Math.abs(channels.reduce((sum,c)=>sum+c.value,0)-total)<0.01;
 const sourceMap=new Map();
 const names=daysForTrend(snapshot);
 const sourceTimeMap=new Map();
 const sourceFor=(record,isCurrent)=>{
   for(const entry of parseEntries(record?.sales_sources_json)){
    if(!entry || entry.included_in_revenue===false)continue;
    const config=revenueSources.find(s=>String(s.id||s.source_key||'')===String(entry.source_id||entry.source_key||''));
    if(config?.included_in_revenue===false)continue;
    const value=amount(entry.amount ?? entry.today_amount);
    if(!Number.isFinite(value) || value<=0)continue;
    const rawKey=String(entry.source_id || entry.source_key || config?.id || sourceDisplayName(entry,lang,config));
    const key=rawKey.trim();
    if(!key)continue;
    if(!sourceMap.has(key))sourceMap.set(key,{
      key,name:sourceDisplayName(entry,lang,config),value:0,previous:0,paymentBucket:entry.payment_bucket||null,
    });
    const item=sourceMap.get(key);
    if(isCurrent) {
      item.value+=value;
      const date=groupKey(record.date,range.type);
      if(!sourceTimeMap.has(key))sourceTimeMap.set(key,new Map());
      const map=sourceTimeMap.get(key);
      map.set(date,(map.get(date)||0)+value);
    } else item.previous+=value;
   }
 };
 periodSales.forEach(s=>sourceFor(s,true));
 previousSales.forEach(s=>sourceFor(s,false));
 const sources=[...sourceMap.values()].map(item=>({...item,change:percentage(item.value,item.previous)}))
   .filter(item=>item.value>0 || item.previous>0)
   .sort((a,b)=>b.value-a.value || a.name.localeCompare(b.name));
 const currentSource=sources.find(x=>x.key===selectedSource);
 const trend=(snapshot.breakdown||[]).map(day=>({
  date:day.date,
  sales:amount(day.sales),
  cash:amount(day.cash),
  network:amount(day.network),
  credit:amount(day.credit),
  other:amount(day.other),
  source:currentSource ? amount(sourceTimeMap.get(currentSource.key)?.get(day.date)):0,
 }));
 const rawDetailTotal=sources.reduce((sum,item)=>sum+item.value,0);
 return {channels,sources,trend,total,sourceSelected:currentSource||null,
   reconciled,rawDetailTotal,isSourceDetailNonAdditive:true,
   comparisonTotal:previousSales.reduce((sum,row)=>sum+calculateSalesRevenue(row,revenueSources).total,0)};
}
