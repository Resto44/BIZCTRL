// Tenant-scoped input arrays are retrieved through existing Supplier Portal RLS.
// This module is pure and never fetches, posts or reclassifies financial records.
import { supplierInvoicePaymentEvidence } from '@/lib/supplierInvoicePaymentEvidence';

const isoFromUTC=d=>d.toISOString().slice(0,10);
export const riyadhDate=(now=new Date())=>{
 const x=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const f=type=>x.find(y=>y.type===type)?.value;
 return `${f('year')}-${f('month')}-${f('day')}`;
};
const toUTC=s=>new Date(`${s}T00:00:00.000Z`);
const shiftDays=(iso,days)=>isoFromUTC(new Date(toUTC(iso).getTime()+days*86400000));
const firstOfMonth=(iso,delta=0)=>{
 const d=toUTC(iso);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+delta);return isoFromUTC(d);
};
export const supplierPeriodRange=(period,today=riyadhDate(),custom={})=>{
 const end=today;
 switch(period){
 case 'today':return {from:end,to:end};
 case '7d':return {from:shiftDays(end,-6),to:end};
 case 'month':return {from:firstOfMonth(end),to:end};
 case '3m':return {from:firstOfMonth(end,-2),to:end};
 case '6m':return {from:firstOfMonth(end,-5),to:end};
 case '12m':return {from:firstOfMonth(end,-11),to:end};
 case 'custom':return {from:custom.from||end,to:custom.to||end};
 default:return {from:shiftDays(end,-29),to:end};
 }
};
export const supplierPortalRecordDate=(value)=>{
 if(!value)return '';
 if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return String(value);
 const parsed=new Date(value);
 return Number.isFinite(parsed.getTime())?riyadhDate(parsed):'';
};
export const validSupplierPeriod=({from,to})=>/^\d{4}-\d{2}-\d{2}$/.test(from)&&
 /^\d{4}-\d{2}-\d{2}$/.test(to)&&from<=to&&
 Math.round((toUTC(to)-toUTC(from))/86400000)<=730;
export const supplierTrendBucket=(date,from,to)=>{
 const span=(toUTC(to)-toUTC(from))/86400000;
 if(span>=95)return {key:date.slice(0,7),granularity:'monthly'};
 if(span>=31){
  const diff=Math.round((toUTC(date)-toUTC(from))/86400000);
  const start=shiftDays(from,Math.floor(diff/7)*7);
  return {key:start,granularity:'weekly'};
 }
 return {key:date,granularity:'daily'};
};
const cents=value=>Math.round(Math.max(0,Number(value)||0)*100);
const inWindow=(row,from,to,fields)=>{
 const date=supplierPortalRecordDate(fields.map(f=>row?.[f]).find(Boolean));
 return date>=from&&date<=to;
};
export function supplierPortalAnalytics({orders=[],invoices=[],payments=[],deliveries=[],period='month',today=riyadhDate(),custom={}}={}) {
 const range=supplierPeriodRange(period,today,custom);
 if(!validSupplierPeriod(range))return {invalid:true,range};
 const matchingOrders=orders.filter(o=>inWindow(o,range.from,range.to,['created_date','date']));
 const matchingInvoices=invoices.filter(i=>inWindow(i,range.from,range.to,['date','created_date']));
 const matchingDeliveries=deliveries.filter(d=>inWindow(d,range.from,range.to,['confirmed_at']));
 const invoiceIds=new Set(invoices.map(i=>String(i.id)));
 const matchingPayments=payments.filter(p=>invoiceIds.has(String(p.invoice_id))&&inWindow(p,range.from,range.to,['date','created_date']));
 const byCurrency=new Map();
 const byBucket=new Map();
 const bucketFor=(date)=>{
  const {key,granularity}=supplierTrendBucket(date,range.from,range.to);
  if(!byBucket.has(key))byBucket.set(key,{date:key,orders:0,completed:0});
  return {bucket:byBucket.get(key),granularity};
 };
 let granularity='daily';
 for(const order of matchingOrders) {
  const {bucket,granularity:group}=bucketFor(supplierPortalRecordDate(order.created_date||order.date));
  granularity=group;bucket.orders++;
 }
 for(const delivery of matchingDeliveries){
  const {bucket}=bucketFor(supplierPortalRecordDate(delivery.confirmed_at));
  bucket.completed++;
 }
 const addCurrency=(currency)=>{const key=String(currency||'SAR').toUpperCase();
  if(!byCurrency.has(key))byCurrency.set(key,{currency:key,invoicedCents:0,paidCents:0,outstandingCents:0,overdueCents:0,trend:new Map()});
  return byCurrency.get(key);
 };
 for(const inv of matchingInvoices){
  const evidence=supplierInvoicePaymentEvidence(inv,[],false);
  if(!evidence.posted)continue;
  const c=addCurrency(inv.currency);
  c.invoicedCents+=cents(evidence.total);
  c.outstandingCents+=cents(evidence.remaining);
  if(inv.due_date && inv.due_date<today)c.overdueCents+=cents(evidence.remaining);
  const key=supplierTrendBucket(supplierPortalRecordDate(inv.date||inv.created_date),range.from,range.to).key;
  const row=c.trend.get(key)||{date:key,invoicedCents:0,paidCents:0};
  row.invoicedCents+=cents(evidence.total);c.trend.set(key,row);
 }
 const invoiceById=new Map(invoices.map(i=>[String(i.id),i]));
 for(const payment of matchingPayments) {
  const inv=invoiceById.get(String(payment.invoice_id));
  if(!inv)continue;
  const c=addCurrency(inv.currency);
  c.paidCents+=cents(payment.amount);
  const key=supplierTrendBucket(supplierPortalRecordDate(payment.date||payment.created_date),range.from,range.to).key;
  const row=c.trend.get(key)||{date:key,invoicedCents:0,paidCents:0};
  row.paidCents+=cents(payment.amount);c.trend.set(key,row);
 }
 const currencyRows=[...byCurrency.values()].sort((a,b)=>a.currency.localeCompare(b.currency)).map(c=>({
  currency:c.currency,invoiced:c.invoicedCents/100,paid:c.paidCents/100,
  outstanding:c.outstandingCents/100,overdue:c.overdueCents/100,
  trend:[...c.trend.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(p=>({
   date:p.date,invoiced:p.invoicedCents/100,paid:p.paidCents/100
  }))
 }));
 return {
  range,granularity,invalid:false,
  orders:matchingOrders.length,
  awaitingShipment:matchingOrders.filter(o=>o.status==='approved').length,
  awaitingOwner:matchingOrders.filter(o=>o.status==='shipped').length,
  received:matchingDeliveries.length,
  cancelled:matchingOrders.filter(o=>o.status==='cancelled').length,
  invoices:matchingInvoices.length,paymentRecords:matchingPayments.length,
  currencies:currencyRows,
  trend:[...byBucket.values()].sort((a,b)=>a.date.localeCompare(b.date))
 };
}
