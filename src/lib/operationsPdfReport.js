import { format } from 'date-fns';
import { buildSalesReportSnapshot } from './salesReportPeriod';
import { allocateReportExpenses } from './reportExpenseAllocation';

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
/** Uses only data already scoped by the requesting authenticated tenant & branch.
 * This is a read-only PDF report model. No inference or fictitious data.
 * Historical flows are period-based; inventory and open debts are current-state snapshots.
 */
export function buildOperationsPdfReport({
  branches=[],sales=[],purchases=[],expenses=[],expenseCategories=[],
  inventory=[],inventoryTransactions=[],customerDebts=[],range = undefined,revenueSources=[],asOfDate = undefined,
}={}){
 if(!range?.from || !range?.to || range.from>range.to)throw new Error('Invalid reporting period');
 const branchReports=(branches||[]).filter(b=>!!b?.id).map(branch=>{
  const period=buildSalesReportSnapshot({
   sales:sales.filter(r=>belongs(r,branch)),purchases:purchases.filter(r=>belongs(r,branch)),
   expenses:expenses.filter(r=>belongs(r,branch)),
   expenseCategories:expenseCategories.filter(c=>!c.branch_id||String(c.branch_id)===String(branch.id)),revenueSources,
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
    quantity,threshold,branchId:String(row.branch_id||''),branchName:branches.find(b=>belongs(row,b))?.name||row.branch||row.branch_id||'',low:quantity!==null && threshold!==null && quantity<=threshold};
 });
 const consumption=new Map();
 const consumptionDays=new Map();let wasteCost=0, wasteQuantity=0;
 let hasWasteData=false, wasteCostComplete=true;
 for(const transaction of inventoryTransactions||[]){
  const date=String(transaction.created_date||transaction.created_at||'').slice(0,10);
  if(!isWithin(date,range))continue;
  const type=String(transaction.transaction_type||'').toLowerCase();
  const qty=Math.abs(amount(transaction.quantity))*(type==='consumption_return'?-1:1);
  if(qty===0)continue;
  const fallback=productMap.get(String(transaction.product_id||''))||{};
  const unitCost=hasValue(transaction.unit_cost)?amount(transaction.unit_cost):null;
  if(type==='waste'){
   hasWasteData=true;wasteQuantity+=qty;
   if(unitCost!==null)wasteCost+=qty*unitCost;
   else wasteCostComplete=false;
   continue;
  }
  if(!['recipe_consumption','consumption','sale','usage','ingredient_usage','production_consumption','stock_out','consumption_return'].includes(type))continue;
  // A cross-product quantity sum is invalid (kg, units, litres differ).
  // The series therefore counts verified consumption stock movements by day.
  const movement=consumptionDays.get(date)||{date,events:0,valuedCost:0,unvalued:0};
  movement.events+=1;
  if(unitCost===null)movement.unvalued+=1;
  else movement.valuedCost+=qty*unitCost;
  consumptionDays.set(date,movement);
  const id=String(transaction.product_id||'');
  const unit=transaction.unit||fallback.unit||'unit';
  const key=JSON.stringify([id,unit]);
  const entry=consumption.get(key)||{id,name:nameOf(transaction)||nameOf(fallback)||'Unlabelled product',
    unit,quantity:0,soldQuantity:0,usedQuantity:0,estimatedCost:0,costAvailable:unitCost!==null};
  entry[type==='sale'||type==='consumption_return'?'soldQuantity':'usedQuantity']+=qty;
  entry.quantity+=qty;
  if(unitCost!==null) entry.estimatedCost+=qty*unitCost;else entry.costAvailable=false;
  consumption.set(key,entry);
 }
 const usage=[...consumption.values()].sort((a,b)=>b.quantity-a.quantity);
 const lowStock=stock.filter(r=>r.low).sort((a,b)=>(a.quantity??0)-(b.quantity??0));
 const noStock=stock.filter(r=>r.quantity!==null && r.quantity<=0);

 const allocation=allocateReportExpenses(expenses,expenseCategories,range.from,range.to);
 const costs=allocation.costGroups;
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
  details:{
   purchases:purchases.filter(r=>isActive(r)&&isWithin(r.date,range)),
   expenses:expenses.filter(r=>isActive(r)&&isWithin(r.date,range)),
   debts:customerDebts.filter(isActive),
  },
  range,asOfDate:asOfDate||asDay(new Date()),branches:branchReports,
  best,worst,stockCount:stock.length,stocks:stock,lowStock,noStock:noStock.length,
  consumption:usage,consumptionTrend:[...consumptionDays.values()].sort((a,b)=>a.date.localeCompare(b.date)),
  consumptionEventCount:[...consumptionDays.values()].reduce((sum,row)=>sum+row.events,0),
  wasteCost,wasteQuantity,hasWasteData,wasteCostComplete,costGroups:costs,hasExpenseSource:allocation.hasExpenseSource,
  debts,risks,hasDebtData:customerDebts.length>0,hasInventoryData:stock.length>0,hasConsumptionData:consumption.size>0,
  branchProfitUnallocated:Math.abs(unassignedCosts)>0.01 ? unassignedCosts:0,
 };
}
