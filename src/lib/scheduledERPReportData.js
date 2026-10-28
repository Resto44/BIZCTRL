import {fetchReportStockConsumption} from './reportStockConsumption';
/**
 * Scheduled and on-demand PDF exports use the same tenant- and branch-scoped
 * financial records as the canonical Sales Analytics report.
 * NEVER silently treat an error or a truncated ledger as zero revenue.
 */
export async function fetchScheduledERPReportData({
 db = undefined,restaurantId = undefined,allBranches=true,branchId=null,branchKey=null,range = undefined,maxRows=50000,
 stockConsumptionReader=fetchReportStockConsumption,
}={}){
 if(!db || !restaurantId || !range?.from || !range?.to)
   throw new Error('An active restaurant and report date range are required');
 if(!allBranches && !branchId) throw new Error('Choose an authorized branch');
 const firstMonthStart=String(range.previousFrom||range.from).slice(0,7)+'-01';
 async function read(table,{legacyColumn='branch',dateColumn='date',from=range.from,to=range.to}={}){
  const fetchScope=async kind=>{
   const results=[];
   const pageSize=500;
   for(let offset=0;offset<maxRows;offset+=pageSize){
     let query=db.from(table).select('*').eq('restaurant_id',restaurantId);
     if(dateColumn)query=query.gte(dateColumn,from).lte(dateColumn,to);
     if(kind==='canonical')query=query.eq('branch_id',branchId);
     if(kind==='legacy')query=query.is('branch_id',null).eq(legacyColumn,branchKey);
     const {data,error}=await query.order('id',{ascending:false}).range(offset,offset+pageSize-1);
     if(error)throw error;
     results.push(...(data||[]));
     if((data||[]).length<pageSize)return results;
   }
   throw new Error(table+' exceeds verified report row limit; narrow the selected scope');
  };
  if(allBranches)return fetchScope('all');
  const [current,old]=await Promise.all([
   fetchScope('canonical'),legacyColumn&&branchKey?fetchScope('legacy'):Promise.resolve([]),
  ]);
  return [...new Map([...current,...old].map(row=>[row.id,row])).values()];
 }
 const [
  sales,purchases,expenses,inventory,inventoryTransactions,customerDebts,expenseCategories,walletTransactions,
 ]=await Promise.all([
  read('daily_sales',{from:`${Number(range.to.slice(0,4))-1}-01-01`,to:range.to}),
  read('supplier_invoices',{from:range.previousFrom,to:range.to}),
  read('expenses',{legacyColumn:'branch_key',from:firstMonthStart,to:range.to}),
  read('inventory',{dateColumn:null}),
  stockConsumptionReader({db,restaurantId,branchId:allBranches?null:branchId,range}),
  read('debt_records',{dateColumn:null}),
  (async()=>{
   const {data,error}=await db.from('expense_categories').select('*').eq('restaurant_id',restaurantId);
   if(error)throw error;
   return (data||[]).filter(c=>allBranches||!c.branch_id||String(c.branch_id)===String(branchId));
  })(),
  read('wallet_transactions',{dateColumn:'transaction_date',from:range.from+'T00:00:00',to:range.to+'T23:59:59.999'}),
 ]);
 return {sales,purchases,expenses,inventory,inventoryTransactions,customerDebts,expenseCategories,walletTransactions};
}
