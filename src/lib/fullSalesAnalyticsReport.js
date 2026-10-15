import {calculateSalesRevenue} from './helpers';
import {buildERPFinancialPaymentAnalytics} from './erpPaymentAnalytics';
import {buildPdfConsumptionCostControl} from './reportConsumptionCostControl';
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const active=r=>!['cancelled','canceled','void','voided','deleted','rejected'].includes(String(r.status||'').toLowerCase());
const approved=r=>['approved','auto_approved'].includes(r.approval_status)||(!r.approval_status&&['approved','paid','partial'].includes(r.status));
const within=(d,range)=>d>=range.from&&d<=range.to;
/** All inputs inherit authenticated tenant/branch scope. Never infer usage from buying. */
export function buildFullSalesAnalyticsReport({sales=[],purchases=[],walletTransactions=null,
 snapshot,previousSnapshot=null,operationsReport=null,range,revenueSources=[],lang='en',historyAvailable=false}={}){
 const confirmed=sales.filter(s=>['finalized','locked'].includes(s.closing_state));
 const daily=new Map(),weekdays=new Map();
 for(const sale of confirmed.filter(s=>within(s.date,range))){
  const value=calculateSalesRevenue(sale,revenueSources).total;
  daily.set(sale.date,(daily.get(sale.date)||0)+value);
  const weekday=new Date(sale.date+'T12:00:00Z').getUTCDay();
  weekdays.set(weekday,(weekdays.get(weekday)||0)+value);
 }
 const days=[...daily].map(([date,value])=>({date,value})).sort((a,b)=>b.value-a.value||a.date.localeCompare(b.date));
 const year=Number(range.to.slice(0,4)),month=Number(range.to.slice(5,7));
 const comparablePriorEnd=String(year-1)+range.to.slice(4);
 const calendar=Array.from({length:month},(_,i)=>({date:String(i+1).padStart(2,'0'),current:0,previous:0}));
 for(const sale of confirmed){
  const y=Number(sale.date?.slice(0,4)),m=Number(sale.date?.slice(5,7));
  if(m<1||m>month)continue;
  const value=calculateSalesRevenue(sale,revenueSources).total;
  if(y===year&&sale.date<=range.to)calendar[m-1].current+=value;
  if(y===year-1&&sale.date<=comparablePriorEnd)calendar[m-1].previous+=value;
 }
 const products=new Map();
 for(const invoice of purchases.filter(p=>active(p)&&approved(p)&&within(p.date,range))){
  let items=invoice.items;
  if(typeof items==='string'){try{items=JSON.parse(items);}catch{items=[];}}
  for(const item of Array.isArray(items)?items:[]){
   if(!item)continue;
   const unit=String(item.unit||'unit'),name=String(item.product_name||item.name||'—');
   const key=JSON.stringify([item.product_id||name,unit]);
   const row=products.get(key)||{id:key,name,unit,quantity:0,cost:0};
   const quantity=number(item.quantity);
   row.quantity+=quantity;
   const lineCost=item.line_total!=null?Number(item.line_total):item.unit_cost!=null?quantity*Number(item.unit_cost):null;
   row.cost=row.cost==null||lineCost==null||!Number.isFinite(lineCost)?null:row.cost+lineCost;
   products.set(key,row);
  }
 }
 const networkRows=(walletTransactions||[]).filter(r=>active(r)&&within(String(r.transaction_date||r.date||'').slice(0,10),range)&&
  ((r.transaction_type||r.type)==='branch_to_owner_network'||
   ((r.transaction_type||r.type)==='sent_to_owner'&&['network','card'].includes(r.payment_method))));
 const received=networkRows.reduce((n,r)=>n+number(r.amount),0);
 const payment=buildERPFinancialPaymentAnalytics({sales:confirmed,revenueSources,snapshot,range,lang});
 return {
  payment,performance:{best:days[0]||null,worst:days.at(-1)||null,peakWeekday:[...weekdays].sort((a,b)=>b[1]-a[1])[0]?.[0]??null},
  history:{available:historyAvailable,year,previousYear:year-1,through:range.to,rows:calendar},
  network:{available:Array.isArray(walletTransactions),sales:number(snapshot.network),received,difference:number(snapshot.network)-received,count:networkRows.length},
  cost:buildPdfConsumptionCostControl({snapshot,previousSnapshot,operationsReport}),
  products:[...products.values()].sort((a,b)=>b.cost-a.cost||a.name.localeCompare(b.name)),
  signals:{loss:number(snapshot.netProfit)<0,missingExpenses:snapshot.hasExpenseSource===false,
   missingConsumption:!operationsReport?.hasConsumptionData,unreconciledPayments:!payment.reconciled,lowStock:operationsReport?.lowStock?.length||0},
 };
}
