import {fetchScheduledERPReportData} from './scheduledERPReportData';
import {salesReportDateRange,buildSalesReportSnapshot,salesReportGrowth} from './salesReportPeriod';
import {buildOperationsPdfReport} from './operationsPdfReport';
import {buildFullSalesAnalyticsReport} from './fullSalesAnalyticsReport';
import {generateSalesAnalyticsPDF} from './salesAnalyticsPdf';

// The persisted job date, not the worker clock, controls every retry's period.
// Server-sourced owner preferences are validated against the same tenant before reading financial rows.
export async function buildAutomaticReportPdf({db,job,context}) {
 const range=salesReportDateRange('today',new Date(job.report_date+'T12:00:00'));
 const restaurantId=job.restaurant_id;
 if(context.restaurant_id!==restaurantId || !Array.isArray(context.inventoryTransactions))
  throw new Error('REPORT_SCOPE_DENIED');
 const branchId=context.branch_id||null;
 const lang=['en','ar','fa'].includes(context.language)?context.language:'en';
 async function read(table,globalOnly=false){
  let query=db.from(table).select('*').eq('restaurant_id',restaurantId);
  if(globalOnly)query=query.eq('is_global',true);
  const {data,error}=await query.limit(1001);
  if(error)throw error;
  if(!Array.isArray(data)||data.length>1000)throw new Error('REPORT_ROW_LIMIT');
  return data;
 }
 const [branches,sources]=await Promise.all([read('branches'),read('sales_sources',true)]);
 const selected=branchId?branches.find(b=>String(b.id)===String(branchId)):null;
 if(branchId&&!selected)throw new Error('REPORT_BRANCH_NOT_IN_ORGANIZATION');
 const reportBranches=selected?[selected]:branches;
 const data=await fetchScheduledERPReportData({
  db,restaurantId,range,allBranches:!branchId,branchId,
  branchKey:selected?.branch_key||selected?.key||null,
  stockConsumptionReader:async()=>context.inventoryTransactions
 });
 const revenueSources=sources.filter(s=>s.is_active!==false&&s.included_in_revenue!==false);
 const snapshot=buildSalesReportSnapshot({...data,revenueSources,from:range.from,to:range.to});
 const previous=buildSalesReportSnapshot({...data,revenueSources,from:range.previousFrom,to:range.previousTo});
 const report=buildOperationsPdfReport({...data,
  branches:reportBranches.map(b=>({...b,key:b.branch_key||String(b.id),label:b.name})),
  range,revenueSources});
 const doc=await generateSalesAnalyticsPDF({
  snapshot,previousSnapshot:previous,growth:salesReportGrowth(snapshot,previous),range,
  branchLabel:selected?.name||'All branches',
  businessName:context.name,currency:context.currency||'SAR',lang,
  operationsReport:report,
  fullAnalytics:buildFullSalesAnalyticsReport({...data,snapshot,previousSnapshot:previous,
   operationsReport:report,range,revenueSources,lang,historyAvailable:true}),
  download:false
 });
 return doc.output('datauristring').split(',')[1];
}
