// Deterministic synthetic visual QA. Never writes business records.
import {createServer} from 'vite';
import fs from 'node:fs/promises';
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
try{
 const {buildSalesReportSnapshot,salesReportGrowth}=await server.ssrLoadModule('/src/lib/salesReportPeriod.js');
 const {buildOperationsPdfReport}=await server.ssrLoadModule('/src/lib/operationsPdfReport.js');
 const {buildFullSalesAnalyticsReport}=await server.ssrLoadModule('/src/lib/fullSalesAnalyticsReport.js');
 const {generateSalesAnalyticsPDF}=await server.ssrLoadModule('/src/lib/salesAnalyticsPdf.js');
 const range={from:'2026-10-01',to:'2026-10-15',previousFrom:'2026-09-01',previousTo:'2026-09-15'};
 const branches=Array.from({length:5},(_,i)=>({id:'b'+i,name:'فرع الريان '+(i+1)}));
 const sales=Array.from({length:15},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),branch_id:'b'+i%5,closing_state:'finalized',restaurant_cash:180+i*20,restaurant_network:290+i*10,credit:40,sales_sources_json:[{source_key:'delivery',name_en:'Delivery',name_ar:'التوصيل',name_fa:'دلیوری',amount:100+i*2}]}));
 sales.push(...sales.map(s=>({...s,date:s.date.replace('2026-10','2026-09'),restaurant_network:s.restaurant_network*.7})),...sales.slice(0,5).map(s=>({...s,date:s.date.replace('2026','2025')})));
 const purchases=Array.from({length:10},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),branch_id:'b'+i%5,approval_status:'approved',total_amount:350+i*20,items:[{product_id:'p'+i,product_name:i%2?'برنج باسمتی درجه یک مخصوص رستورانت':'دجاج طازج معبأ للاستخدام في المطعم',quantity:i+2,unit:i%2?'bag':'carton',line_total:350+i*20}]}));
 const expenseCategories=[{id:'fixed',name:'کرایه / إيجار',branch_id:'b0',expense_type:'fixed',monthly_amount:4500,allocation_days:30},{id:'variable',name:'مصارف عملیاتی / تشغيل',is_fixed:false}];
 const expenses=[{date:'2026-10-10',branch_id:'b0',category_id:'variable',amount:1400}];
 const inventoryTransactions=Array.from({length:8},(_,i)=>({id:'t'+i,created_date:'2026-10-10',product_id:'p'+i,product_name:i%2?'برنج باسمتی':'دجاج طازج',quantity:i+3,unit:i%2?'bag':'carton',unit_cost:10,transaction_type:i<4?'recipe_consumption':'sale'}));
 const walletTransactions=[{transaction_date:'2026-10-10',transaction_type:'branch_to_owner_network',amount:3000}];
 const base={branches,sales,purchases,expenses,expenseCategories,inventoryTransactions,range};
 const snapshot=buildSalesReportSnapshot({...base,from:range.from,to:range.to});
 const previousSnapshot=buildSalesReportSnapshot({...base,from:range.previousFrom,to:range.previousTo});
 const operationsReport=buildOperationsPdfReport(base);
 await fs.mkdir('tmp/pdfs',{recursive:true});
 for(const lang of ['fa','ar','en']){
  const fullAnalytics=buildFullSalesAnalyticsReport({...base,walletTransactions,snapshot,previousSnapshot,operationsReport,lang,historyAvailable:true});
  const doc=await generateSalesAnalyticsPDF({snapshot,previousSnapshot,fullAnalytics,operationsReport,range,growth:salesReportGrowth(snapshot,previousSnapshot),branchLabel:'جميع الفروع',businessName:'BizCTRL - QA',lang,download:false});
  await fs.writeFile('tmp/pdfs/complete-'+lang+'.pdf',Buffer.from(doc.output('arraybuffer')));
 }
}finally{await server.close();}
