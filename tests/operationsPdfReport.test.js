import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {buildOperationsPdfReport} from '../src/lib/operationsPdfReport.js';
import {buildSalesReportSnapshot,salesReportDateRange} from '../src/lib/salesReportPeriod.js';
import {generateSalesAnalyticsPDF} from '../src/lib/salesAnalyticsPdf.js';

const file=path=>readFile(new URL(path,import.meta.url),'utf8');
const first='63a92c99-c4c8-4831-8e7f-33c8e0a6e653';
const second='f8829a0b-348d-4218-a764-5cb27c7e634f';
const branches=[{id:first,branch_key:'rayyan',name:'فرع الريان'},
 {id:second,branch_key:'b2',name:'فرع النخيل'}];
const sales=[
 {id:'s1',date:'2026-10-09',closing_state:'finalized',branch_id:first,restaurant_cash:400,restaurant_network:440,credit:45,
  sales_sources_json:[{amount:885}]},
 {id:'s2',date:'2026-10-09',closing_state:'finalized',branch_id:first,restaurant_cash:77,restaurant_network:308,credit:65},
 {id:'s3',date:'2026-10-09',closing_state:'finalized',branch_id:second,restaurant_cash:400,restaurant_network:100,credit:0},
 {id:'draft',date:'2026-10-09',closing_state:'draft',branch_id:first,restaurant_cash:100000},
];
const purchases=[
 {date:'2026-10-09',branch_id:first,approval_status:'auto_approved',total_amount:867},
 {date:'2026-10-09',branch_id:second,approval_status:'auto_approved',total_amount:200},
 {date:'2026-10-09',branch_id:second,approval_status:'pending',total_amount:9000},
];
const categories=[{id:'rent',name:'Rent',is_fixed:true},{id:'electric',name:'Electricity',is_fixed:false}];
const expenses=[
 {date:'2026-10-01',branch_id:first,category_id:'rent',amount:310,status:'approved'},
 {date:'2026-10-09',branch_id:first,category_id:'electric',amount:20,status:'approved'},
 {date:'2026-10-09',branch_id:second,category_id:'electric',amount:50,status:'approved'},
];
const inventory=[
 {id:'i1',branch_id:first,product_id:'rice',product_name:'Rice bag',quantity:85,low_stock_threshold:20,unit:'bag'},
 {id:'i2',branch_id:first,product_id:'chicken',product_name:'Chicken carton',quantity:2,low_stock_threshold:5,unit:'carton'},
 {id:'i3',branch_id:first,product_id:'oil',product_name:'Cooking oil',quantity:0,low_stock_threshold:3,unit:'can'},
];
const inventoryTransactions=[
 {branch_id:first,product_id:'chicken',quantity:-2,unit_cost:40,transaction_type:'recipe_consumption',created_date:'2026-10-09T12:00:00Z'},
 {branch_id:first,product_id:'oil',quantity:-1,unit_cost:25,transaction_type:'waste',created_date:'2026-10-09T12:00:00Z'},
 {branch_id:first,product_id:'rice',quantity:-1000,unit_cost:5,transaction_type:'recipe_consumption',created_date:'2026-10-08T12:00:00Z'},
];
const debts=[
 {branch_id:first,party_type:'customer',type:'receivable',remaining_amount:110,status:'open'},
 {branch_id:first,party_type:'supplier',type:'payable',remaining_amount:400,status:'open'},
 {branch_id:first,type:'receivable',remaining_amount:999,status:'settled'},
];
const range=salesReportDateRange('today',new Date(2026,9,9,12));
const run=args=>buildOperationsPdfReport({
 branches,sales,purchases,expenses,expenseCategories:categories,inventory,inventoryTransactions,
 customerDebts:debts,range,revenueSources:[],asOfDate:'2026-10-09',...args,
});
describe('Operations, Branches & Inventory ERP PDF',()=>{
 it('uses finalized and approved financial data, branch-specific totals and real fixed-cost allocation',()=>{
   const r=run();
   expect(r.branches).toHaveLength(2);
   const rayyan=r.branches.find(x=>x.id===first);
   expect(rayyan.sales).toBe(1335);
   expect(rayyan.purchases).toBe(867);
   expect(rayyan.expenses).toBe(30);
   expect(rayyan.netProfit).toBe(438);
   expect(rayyan.margin).toBeCloseTo(438/1335*100);
   const b2=r.branches.find(x=>x.id===second);
   expect(b2).toMatchObject({sales:500,purchases:200,expenses:50,netProfit:250});
   expect(r.best.id).toBe(first);
   expect(r.worst.id).toBe(second);
 });
 it('filters an authenticated single branch and avoids showing other branch values',()=>{
   const only=run({branches:branches.slice(0,1),sales:sales.filter(x=>x.branch_id===first),
     purchases:purchases.filter(x=>x.branch_id===first),expenses:expenses.filter(x=>x.branch_id===first)});
   expect(only.branches).toHaveLength(1);
   expect(only.branches[0].name).toBe('فرع الريان');
   expect(only.best).toBeNull();
 });
 it('shows on-hand stock as of now and consumption only during the selected range',()=>{
   const r=run();
   expect(r.stockCount).toBe(3);
   expect(r.lowStock).toHaveLength(2);
   expect(r.noStock).toBe(1);
   expect(r.consumption).toHaveLength(1);
   expect(r.consumption[0]).toMatchObject({name:'Chicken carton',quantity:2,estimatedCost:80});
   expect(r.wasteQuantity).toBe(1);
   expect(r.wasteCost).toBe(25);
   expect(r.asOfDate).toBe('2026-10-09');
 });
 it('does not mix paid balances into current open debt and does not mislabel 0 when inventory is absent',()=>{
   const r=run();
   expect(r.debts).toMatchObject({receivables:110,payables:400,unknown:0});
   const empty=run({inventory:[],inventoryTransactions:[],customerDebts:[]});
   expect(empty.hasInventoryData).toBe(false);
   expect(empty.hasConsumptionData).toBe(false);
   expect(empty.stockCount).toBe(0);
   expect(empty.hasDebtData).toBe(false);
 });
 it('renders downloadable-quality A4 operational pages in all three SaaS languages from the same reporting period',async()=>{
  const snapshot=buildSalesReportSnapshot({sales,purchases,expenses,expenseCategories:categories,from:range.from,to:range.to});
  for(const lang of ['en','ar','fa']){
   const doc=await generateSalesAnalyticsPDF({
    snapshot,range,previousSnapshot:null,growth:null,
    operationsReport:run(),businessName:'مطاعم شمعة الريان',
    branchLabel:'فرع الريان',currency:'SAR',lang,download:false,
   });
   expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(5);
   expect(Buffer.from(doc.output('arraybuffer')).subarray(0,8).toString()).toContain('%PDF-');
   expect(doc.__erpPdfRTL).toBe(lang!=='en');
  }
 });
 it('fetches inventory, movement and debt under tenant and branch access and blocks incomplete PDF',async()=>{
  const reports=await file('../src/pages/Reports.jsx');
  expect(reports).toContain("queryKey:['report_inventory_snapshot',activeRestaurant?.id,selectedBranchId]");
  expect(reports).toContain("queryKey:['report_stock_movements',activeRestaurant?.id,selectedBranchId,reportRange.from,reportRange.to]");
  expect(reports).toContain("queryKey:['report_open_debts_snapshot',activeRestaurant?.id,selectedBranchId]");
  expect(reports).toContain(".eq('restaurant_id',activeRestaurant.id)");
  expect(reports).toContain("load(q=>q.eq('branch_id',selectedBranchId))");
  expect(reports).toContain("if (hasReportError || isLoading) return;");
  expect(reports).toContain('operationsReport,');
 });
});
