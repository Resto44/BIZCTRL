// Deterministic visual QA only; no production records or network requests.
import {createServer} from 'vite';
import fs from 'node:fs/promises';
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
try {
 const {generateSalesAnalyticsPDF}=await server.ssrLoadModule('/src/lib/salesAnalyticsPdf.js');
 const out='tmp/pdfs';await fs.mkdir(out,{recursive:true});
 const snapshot={sales:7953,purchases:7758.6,totalExpenses:0,grossProfit:194.4,netProfit:194.4,netMargin:2.44,
  cash:1267,network:4630,credit:320,other:1736,variableExpenses:0,fixedDeduction:0,finalizedClosings:14,
  breakdown:Array.from({length:10},(_,i)=>({date:`2026-${String(i+1).padStart(2,'0')}`,sales:i===9?7953:0,netProfit:i===9?194.4:0}))};
 const report={branches:[{name:'فرع الريان',sales:7953,netProfit:194.4}],hasInventoryData:true,stockCount:5,lowStock:Array(5).fill({}),noStock:5,hasDebtData:true,debts:{receivables:300,payables:0},hasConsumptionData:false,consumption:[]};
 for(const lang of ['fa','ar','en']){
  const doc=await generateSalesAnalyticsPDF({snapshot,range:{from:'2026-01-01',to:'2026-10-15'},branchLabel:'فرع الريان',businessName:'مطاعم شمعة الريان',currency:'SAR',lang,operationsReport:report,download:false});
  await fs.writeFile(`${out}/sales-${lang}.pdf`,Buffer.from(doc.output('arraybuffer')));
 }
 const busy={...report,hasConsumptionData:true,hasWasteData:true,wasteCostComplete:true,wasteCost:104.5,consumption:[{name:'برنج باسمتی درجه یک ویژه رستورانت',quantity:1234.5,unit:'کیلوگرام',estimatedCost:9876.5,costAvailable:true},{name:'دجاج طازج كامل مخصص للطلبات العائلية',quantity:324,unit:'كرتون',estimatedCost:45200,costAvailable:true}],costGroups:[{name:'مصروفات الصيانة والتشغيل الشهرية',value:12000.5}],branches:Array.from({length:4},(_,i)=>({name:'فرع طريق المدينة المنورة - القسم الرئيسي '+(i+1),sales:1234567.89,netProfit:i?-12345.67:45678.9}))};
 const doc=await generateSalesAnalyticsPDF({snapshot:{...snapshot,sales:1234567.89,netProfit:-54321.21,totalExpenses:12000.5},previousSnapshot:{sales:10000,purchases:5000,totalExpenses:100},range:{from:'2026-01-01',to:'2026-10-15'},branchLabel:'جميع الفروع',businessName:'مؤسسة شمعة الريان للمطاعم والخدمات التجارية',currency:'SAR',lang:'fa',operationsReport:busy,download:false});
 await fs.writeFile(`${out}/sales-long-fa.pdf`,Buffer.from(doc.output('arraybuffer')));
} finally {await server.close();}
