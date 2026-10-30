import {beforeEach,describe,expect,it,vi} from 'vitest';
import {buildAutomaticReportPdf,automaticReportDateRange} from '../src/lib/automaticReportPdf.js';
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


describe('calendar-exact automated owner periods',()=>{
 const cases=[
  ['daily','2026-10-29','2026-10-29','2026-10-28','2026-10-28'],
  ['weekly','2026-10-24','2026-10-30','2026-10-17','2026-10-23'],
  ['monthly','2026-09-01','2026-09-30','2026-08-01','2026-08-31'],
  ['quarterly','2026-07-01','2026-09-30','2026-04-01','2026-06-30'],
  ['semiannual','2026-01-01','2026-06-30','2025-07-01','2025-12-31'],
  ['nine_months','2026-01-01','2026-09-30','2025-04-01','2025-12-31'],
  ['yearly','2025-01-01','2025-12-31','2024-01-01','2024-12-31']
 ];
 it.each(cases)('%s report has correct full period and comparison',(
   frequency,period_start,report_date,previousFrom,previousTo)=>{
   expect(automaticReportDateRange({frequency,period_start,report_date}))
    .toEqual({type:frequency,from:period_start,to:report_date,previousFrom,previousTo});
 });
 it('keeps legacy daily jobs unchanged',()=>{
  expect(automaticReportDateRange({report_date:'2026-10-29'}))
   .toEqual({type:'daily',from:'2026-10-29',to:'2026-10-29',
    previousFrom:'2026-10-28',previousTo:'2026-10-28'});
 });
 it('rejects broken period metadata',()=>{
  expect(()=>automaticReportDateRange({frequency:'yearly',period_start:'2026-12-31',report_date:'2026-01-01'}))
   .toThrow('INVALID_REPORT_PERIOD');
 });
 it('renders and retains exact six-month scope rather than just the last day',async()=>{
  await buildAutomaticReportPdf({db:dbWith(),job:{...job,
   frequency:'semiannual',period_start:'2026-01-01',report_date:'2026-06-30'},context});
  expect(fetchScheduledERPReportData).toHaveBeenCalledWith(expect.objectContaining({
   range:expect.objectContaining({from:'2026-01-01',to:'2026-06-30',previousFrom:'2025-07-01'})
  }));
 });
});
