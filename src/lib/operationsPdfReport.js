import { addDays, endOfMonth, format, parseISO } from 'date-fns';
import { buildSalesReportSnapshot } from './salesReportPeriod';
import { tagExpensesWithCategories } from './helpers';

const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const hasValue = value => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
const isActive = row => !['cancelled','canceled','deleted','void','voided','rejected'].includes(String(row?.status || '').toLowerCase());
const isWithin = (value, range) => String(value || '') >= range.from && String(value || '') <= range.to;
const branchKey = branch => String(branch?.branch_key || branch?.key || branch?.id || '');
const belongs = (row, branch) => String(row?.branch_id || '') === String(branch?.id)
  || (!row?.branch_id && !!branchKey(branch) &&
    [branchKey(branch),String(branch?.id || '')].includes(String(row?.branch || row?.branch_key || '')));
const stockKey = row => String(row?.product_id || row?.id || '');
const nameOf = row => String(row?.product_name || row?.name || '').trim();
const asDay = date => format(date,'yyyy-MM-dd');
const categoryName = (row, categories) => {
  const category=categories.find(c=>String(c.id)===String(row.category_id||row.expense_category_id));
  return String(category?.name || row?.category_name || 'Other');
};
const MONTH_DAYS = new Map();
const daysInMonth = date => {
 const key=date.slice(0,7);
 if(!MONTH_DAYS.has(key)) MONTH_DAYS.set(key,endOfMonth(parseISO(date)).getDate());
 return MONTH_DAYS.get(key);
};

/** Uses only data already scoped by the requesting authenticated tenant & branch.
 * This is a read-only PDF report model. No inference or fictitious data.
 * Historical flows are period-based; inventory and open debts are current-state snapshots.
 */
export function buildOperationsPdfReport({
  branches=[],sales=[],purchases=[],expenses=[],expenseCategories=[],
  inventory=[],inventoryTransactions=[],customerDebts=[],range,revenueSources=[],asOfDate,
}={}){
 if(!range?.from || !range?.to || range.from>range.to)throw new Error('Invalid reporting period');
 const branchReports=(branches||[]).filter(b=>!!b?.id).map(branch=>{
  const period=buildSalesReportSnapshot({
   sales:sales.filter(r=>belongs(r,branch)),purchases:purchases.filter(r=>belongs(r,branch)),
   expenses:expenses.filter(r=>belongs(r,branch)),expenseCategories,revenueSources,
   from:range.from,to:range.to,
  });
  return {id:branch.id,name:branch.name||branch.label||branchKey(branch),
   sales:period.sales,purchases:period.purchases,expenses:period.totalExpenses,
   grossProfit:period.grossProfit,netProfit:period.netProfit,margin:period.netMargin,
   closings:period.finalizedClosings,
  };
 }).sort((a,b)=>b.netProfit-a.netProfit);

 const productMap=new Map((inventory||[]).filter(x=>stockKey(x)).map(x=>[stockKey(x),x]));
 // Products in inventory can share a product across separate branches.
 const stock=(inventory||[]).map(row=>{
  const quantity=hasValue(row.current_stock)?amount(row.current_stock):hasValue(row.quantity)?amount(row.quantity):
   hasValue(row.opening_stock)?amount(row.opening_stock):null;
  const threshold=hasValue(row.low_stock_threshold)?amount(row.low_stock_threshold):null;
  return {key:stockKey(row),name:nameOf(row)||'Unlabelled product',unit:String(row.unit||'unit'),
    quantity,threshold,branchId:String(row.branch_id||''),low:quantity!==null && threshold!==null && quantity<=threshold};
 });
 const stockMap=new Map();
 for(const row of stock)if(row.key)stockMap.set(row.key,row);
 const consumption=new Map();let wasteCost=0, wasteQuantity=0;
 for(const transaction of inventoryTransactions||[]){
  const date=String(transaction.created_date||transaction.created_at||'').slice(0,10);
  if(!isWithin(date,range))continue;
  const type=String(transaction.transaction_type||'').toLowerCase();
  const qty=Math.abs(amount(transaction.quantity));
  if(qty<=0)continue;
  const fallback=productMap.get(String(transaction.product_id||''))||{};
  const unitCost=hasValue(transaction.unit_cost)?amount(transaction.unit_cost):null;
  if(type==='waste'){wasteQuantity+=qty;if(unitCost!==null)wasteCost+=qty*unitCost;continue;}
  if(!['recipe_consumption','consumption','sale','usage','ingredient_usage','production_consumption'].includes(type))continue;
  const id=String(transaction.product_id||'');
  const entry=consumption.get(id)||{id,name:nameOf(fallback)||'Unlabelled product',
    unit:fallback.unit||'unit',quantity:0,estimatedCost:0,costAvailable:unitCost!==null};
  entry.quantity+=qty;
  if(unitCost!==null) entry.estimatedCost+=qty*unitCost;else entry.costAvailable=false;
  consumption.set(id,entry);
 }
 const usage=[...consumption.values()].sort((a,b)=>b.quantity-a.quantity).slice(0,7);
 const lowStock=stock.filter(r=>r.low).sort((a,b)=>(a.quantity??0)-(b.quantity??0));
 const noStock=stock.filter(r=>r.quantity!==null && r.quantity<=0);

 // Group operational costs using the same fixed-cost daily apportionment as the
 // Sales Analytics card, and variable costs only on their actual recorded dates.
 const tagged=tagExpensesWithCategories(expenses.filter(isActive),expenseCategories);
 const costGroups=new Map();
 for(const row of tagged){
  const category=categoryName(row,expenseCategories);
  const date=String(row.date||'').slice(0,10);
  let cost=0;
  if(row._is_fixed){
   let day=parseISO(range.from),end=parseISO(range.to);
   for(;day<=end;day=addDays(day,1)){
    const key=asDay(day);
    if(key.slice(0,7)===date.slice(0,7))cost+=amount(row.amount)/daysInMonth(key);
   }
  }else if(isWithin(date,range))cost=amount(row.amount);
  if(cost)costGroups.set(category,(costGroups.get(category)||0)+cost);
 }
 const costs=[...costGroups.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,10);

 const isOpen=debt=>isActive(debt)&&!['paid','settled','closed'].includes(String(debt.status||'').toLowerCase());
 const debts=(customerDebts||[]).filter(isOpen).reduce((totals,row)=>{
  const balance=hasValue(row.remaining_amount)?amount(row.remaining_amount)
    :hasValue(row.total_amount)?amount(row.total_amount)-amount(row.paid_amount):null;
  if(balance===null) {totals.unknown+=1;return totals;}
  const val=Math.max(0,balance);
  if(row.type==='receivable' && (!row.party_type || row.party_type==='customer'))totals.receivables+=val;
  else if(row.type==='payable')totals.payables+=val;
  return totals;
 },{receivables:0,payables:0,unknown:0});

 const best=branchReports.length>1?branchReports[0]:null;
 const worst=branchReports.length>1?branchReports.at(-1):null;
 const risks=[];
 if(worst && worst.netProfit<0)risks.push({type:'loss',name:worst.name,value:worst.netProfit});
 if(lowStock.length)risks.push({type:'stock',name:lowStock[0].name,value:lowStock.length});
 if(noStock.length)risks.push({type:'outOfStock',name:noStock[0].name,value:noStock.length});
 if(debts.receivables>0)risks.push({type:'receivables',value:debts.receivables});
 const unassignedCosts=amount(buildSalesReportSnapshot({sales,purchases,expenses,expenseCategories,
   revenueSources,from:range.from,to:range.to}).netProfit)-branchReports.reduce((v,x)=>v+x.netProfit,0);
 return {
  range,asOfDate:asOfDate||asDay(new Date()),branches:branchReports,
  best,worst,stocks:stock.slice(0,30),lowStock:lowStock.slice(0,15),noStock:noStock.length,
  consumption:usage,wasteCost,wasteQuantity,costGroups:costs,
  debts,risks,hasInventoryData:stock.length>0,hasConsumptionData:consumption.size>0,
  branchProfitUnallocated:Math.abs(unassignedCosts)>0.01 ? unassignedCosts:0,
 };
}
