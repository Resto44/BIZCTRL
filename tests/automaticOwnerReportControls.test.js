import {beforeEach,describe,expect,it,vi} from 'vitest';
import {buildAutomaticReportPdf} from '../src/lib/automaticReportPdf.js';
import {fetchScheduledERPReportData} from '../src/lib/scheduledERPReportData.js';
import {generateSalesAnalyticsPDF} from '../src/lib/salesAnalyticsPdf.js';

vi.mock('../src/lib/scheduledERPReportData.js',()=>({
 fetchScheduledERPReportData:vi.fn(async()=>({
  sales:[],purchases:[],expenses:[],inventory:[],inventoryTransactions:[],
  customerDebts:[],expenseCategories:[],walletTransactions:[]
 }))
}));
vi.mock('../src/lib/salesReportPeriod.js',()=>({
 salesReportDateRange:vi.fn(()=>({from:'2026-10-29',to:'2026-10-29',previousFrom:'2026-10-28',previousTo:'2026-10-28'})),
 buildSalesReportSnapshot:vi.fn(()=>({sales:0})),
 salesReportGrowth:vi.fn(()=>null)
}));
vi.mock('../src/lib/operationsPdfReport.js',()=>({buildOperationsPdfReport:vi.fn(()=>({}))}));
vi.mock('../src/lib/fullSalesAnalyticsReport.js',()=>({buildFullSalesAnalyticsReport:vi.fn(()=>({}))}));
vi.mock('../src/lib/salesAnalyticsPdf.js',()=>({
 generateSalesAnalyticsPDF:vi.fn(async()=>({output:()=> 'data:application/pdf;base64,JVBERi0xLjQK'}))
}));
const job={restaurant_id:'org-1',report_date:'2026-10-29'};
const context={restaurant_id:'org-1',name:'Test',currency:'SAR',inventoryTransactions:[],
 language:'fa',branch_id:'branch-1'};
const branches=[
 {id:'branch-1',restaurant_id:'org-1',name:'Branch One',branch_key:'b1'},
 {id:'branch-2',restaurant_id:'org-1',name:'Branch Two',branch_key:'b2'}
];
function dbWith(list=branches){
 return {from:table=>{
  const query={select:()=>query,eq:()=>query,limit:async()=>({
   data:table==='branches'?list:[],error:null
  })};
  return query;
 }};
}
beforeEach(()=>vi.clearAllMocks());
describe('owner report delivery scope and localization',()=>{
 it('renders only the selected branch in Persian',async()=>{
  const result=await buildAutomaticReportPdf({db:dbWith(),job,context});
  expect(result).toBe('JVBERi0xLjQK');
  expect(fetchScheduledERPReportData).toHaveBeenCalledWith(expect.objectContaining({
   restaurantId:'org-1',allBranches:false,branchId:'branch-1',branchKey:'b1'
  }));
  expect(generateSalesAnalyticsPDF).toHaveBeenCalledWith(expect.objectContaining({
   lang:'fa',branchLabel:'Branch One',download:false
  }));
 });
 it('keeps all branches when no branch has been selected',async()=>{
  await buildAutomaticReportPdf({db:dbWith(),job,context:{...context,branch_id:null,language:'ar'}});
  expect(fetchScheduledERPReportData).toHaveBeenCalledWith(expect.objectContaining({allBranches:true,branchId:null}));
  expect(generateSalesAnalyticsPDF).toHaveBeenCalledWith(expect.objectContaining({lang:'ar',branchLabel:'All branches'}));
 });
 it('fails closed for a branch not in the same organization',async()=>{
  await expect(buildAutomaticReportPdf({db:dbWith(),job,
   context:{...context,branch_id:'other-org-branch'}})).rejects.toThrow('REPORT_BRANCH_NOT_IN_ORGANIZATION');
  expect(fetchScheduledERPReportData).not.toHaveBeenCalled();
  expect(generateSalesAnalyticsPDF).not.toHaveBeenCalled();
 });
 it('rejects a mismatched tenant and missing stock scope',async()=>{
  await expect(buildAutomaticReportPdf({db:dbWith(),job,
   context:{...context,restaurant_id:'other-org'}})).rejects.toThrow('REPORT_SCOPE_DENIED');
  await expect(buildAutomaticReportPdf({db:dbWith(),job,
   context:{...context,inventoryTransactions:null}})).rejects.toThrow('REPORT_SCOPE_DENIED');
 });
 it('defaults an invalid language to English',async()=>{
  await buildAutomaticReportPdf({db:dbWith(),job,context:{...context,language:'xx'}});
  expect(generateSalesAnalyticsPDF).toHaveBeenCalledWith(expect.objectContaining({lang:'en'}));
 });
});
