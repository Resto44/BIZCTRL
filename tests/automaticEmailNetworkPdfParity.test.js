import {describe,it,expect,vi} from 'vitest';
import {buildAutomaticReportPdf} from '../src/lib/automaticReportPdf.js';
import {fetchScheduledERPReportData} from '../src/lib/scheduledERPReportData.js';

const sales=[
 {id:'prior',date:'2026-11-06',restaurant_id:'org-1',closing_state:'finalized',
  branch_id:'branch-1',branch:'rayyan',restaurant_cash:60,restaurant_network:20,credit:0},
 {id:'current',date:'2026-11-07',restaurant_id:'org-1',closing_state:'finalized',
  branch_id:'branch-1',branch:'rayyan',restaurant_cash:90,restaurant_network:40,credit:0,
  pos_entries_json:[{network_account_id:'mada-1',device_name:'Mada',amount:40}]},
];
vi.mock('../src/lib/scheduledERPReportData.js',()=>({
 fetchScheduledERPReportData:vi.fn(async()=>({
  sales,purchases:[],expenses:[],inventory:[],inventoryTransactions:[],
  customerDebts:[],expenseCategories:[],walletTransactions:[],
  drivers:[{id:'driver-1',restaurant_id:'org-1',branch_id:'branch-1',full_name:'Delivery Driver'}],
  driverSalesEntries:[
   {id:'e-current',restaurant_id:'org-1',branch_id:'branch-1',driver_id:'driver-1',
    closing_id:'current',date:'2026-11-07',status:'finalized',cash_amount:30,network_amount:20,total_amount:50},
   {id:'e-prior',restaurant_id:'org-1',branch_id:'branch-1',driver_id:'driver-1',
    closing_id:'prior',date:'2026-11-06',status:'finalized',cash_amount:20,network_amount:10,total_amount:30},
  ],
 }))
}));
const db={from:table=>{
 const q={select:()=>q,eq:()=>q,limit:async()=>({
  data:table==='branches'?[{id:'branch-1',restaurant_id:'org-1',branch_key:'rayyan',name:'Rayyan'}]:[],
  error:null,
 })};
 return q;
}};
function pageCount(base64){
 const raw=Buffer.from(base64,'base64');
 expect(raw.subarray(0,5).toString()).toBe('%PDF-');
 return (raw.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
}
describe('automatic emailed PDF must match manual Network Management appendix',()=>{
 it.each(['en','ar','fa'])('generates a full A4 three-page attachment with network data (%s)',async language=>{
  const b64=await buildAutomaticReportPdf({
   db,job:{restaurant_id:'org-1',report_date:'2026-11-07',frequency:'daily'},
   context:{restaurant_id:'org-1',branch_id:null,language,currency:'SAR',
    name:'BizCTRL Demo',inventoryTransactions:[]},
  });
  expect(pageCount(b64)).toBe(3);
  expect(fetchScheduledERPReportData).toHaveBeenCalledWith(expect.objectContaining({
   restaurantId:'org-1',allBranches:true,range:expect.objectContaining({
    from:'2026-11-07',to:'2026-11-07',previousFrom:'2026-11-06',
   }),
  }));
 });
 it('ensures the generator uses the exact shared manual PDF module, never a separate two-page renderer',async()=>{
  const {readFileSync}=await import('node:fs');
  const src=readFileSync(new URL('../src/lib/automaticReportPdf.js',import.meta.url),'utf8');
  expect(src).toContain("import {generateSalesAnalyticsPDF} from './salesAnalyticsPdf'");
  expect(src).toContain('REPORT_NETWORK_APPENDIX_MISSING');
  expect(src).toContain('doc.getNumberOfPages() !== requiredPages');
 });
});
