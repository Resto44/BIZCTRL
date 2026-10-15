import {drawLocalizedPdfText} from './pdfLocalization';
import {drawERPReportBrand} from './erpPdfBrand';
import {buildPdfConsumptionCostControl} from './reportConsumptionCostControl';

const L={
 en:{title:'ERP Sales Analytics Report',period:'Reporting period',sales:'Verified sales',purchases:'Approved purchases',
  expenses:'Period expenses',net:'Net profit / loss',trend:'Sales & profit trend',
  payment:'Payment channel breakdown',cash:'Cash',network:'Network',credit:'Customer credit',other:'Other sales sources',
  profit:'Net result',gross:'Gross profit',margin:'Net margin',branches:'Branch performance',name:'Branch',
  stock:'Inventory / consumption',items:'Stock records',low:'Low stock',out:'Out of stock',
  debt:'Outstanding balances',receivables:'Receivables',payables:'Payables',risk:'Management attention',
  risks:'Items requiring review',noData:'Not recorded',generated:'Generated',note:'Finalized closings only · Network and credit are included in sales · Cash sales ≠ cash in drawer',
  summary:'Cost & profitability',fixed:'Allocated fixed expenses',variable:'Variable expenses',closing:'Finalized closings',
  unknown:'Source not available',page:'PAGE 1 / 1',details:'Top recorded branches',total:'Total',growth:'vs previous period',consumption:'Product Consumption Analytics',costControl:'Cost Control',purchaseRatio:'Purchases / sales',expenseRatio:'Expenses / sales',waste:'Waste cost',costCategory:'Largest expense',units:'SKUs',lowShort:'low',outShort:'out'},
 ar:{title:'تقرير تحليلات المبيعات ERP',period:'فترة التقرير',sales:'المبيعات المعتمدة',purchases:'المشتريات المعتمدة',
  expenses:'مصروفات الفترة',net:'صافي الربح / الخسارة',trend:'اتجاه المبيعات والأرباح',
  payment:'توزيع طرق الدفع',cash:'نقد',network:'شبكة',credit:'آجل',other:'مصادر مبيعات أخرى',
  profit:'النتيجة الصافية',gross:'الربح الإجمالي',margin:'هامش صافي الربح',branches:'أداء الفروع',name:'الفرع',
  stock:'المخزون والاستهلاك',items:'أصناف المخزون',low:'مخزون منخفض',out:'نفاد المخزون',
  debt:'الأرصدة المستحقة',receivables:'الذمم المدينة',payables:'الذمم الدائنة',risk:'متابعة الإدارة',
  risks:'تنبيهات تحتاج متابعة',noData:'غير مسجل',generated:'تم الإنشاء',note:'فقط المبيعات المعتمدة · الشبكة والآجل ضمن المبيعات · النقد ليس رصيد الصندوق',
  summary:'التكلفة والربحية',fixed:'المصروفات الثابتة الموزعة',variable:'المصروفات المتغيرة',closing:'إقفالات معتمدة',
  unknown:'المصدر غير متاح',page:'صفحة ١ / ١',details:'الفروع المسجلة',total:'المجموع',growth:'مقارنة بالفترة السابقة',consumption:'تحليلات استهلاك المنتجات',costControl:'التحكم في التكاليف',purchaseRatio:'المشتريات / المبيعات',expenseRatio:'المصروفات / المبيعات',waste:'تكلفة الهدر',costCategory:'أعلى مصروف',units:'صنف',lowShort:'منخفض',outShort:'نافد'},
 fa:{title:'گزارش تحلیل فروشات ERP',period:'دوره گزارش',sales:'فروشات نهایی',purchases:'خریدهای تأییدشده',
  expenses:'مصارف دوره',net:'فایده / نقصان خالص',trend:'روند فروشات و فایده',
  payment:'تقسیم روش‌های پرداخت',cash:'نقد',network:'شبکه',credit:'نسیه',other:'منابع دیگر فروش',
  profit:'نتیجه خالص',gross:'فایده ناخالص',margin:'حاشیه فایده خالص',branches:'عملکرد شعبه‌ها',name:'شعبه',
  stock:'موجودی و مصرف',items:'ردیف‌های انبار',low:'موجودی کم',out:'تمام‌شده',
  debt:'مانده بدهی‌ها',receivables:'مطالبات',payables:'بدهی‌ها',risk:'توجه مدیریت',
  risks:'موارد نیازمند بررسی',noData:'ثبت نشده',generated:'ایجاد شده',note:'تنها فروشات نهایی · شبکه و نسیه داخل فروشات است · نقد فروش با مانده صندوق فرق دارد',
  summary:'هزینه و سودآوری',fixed:'مصارف ثابت تخصیص‌یافته',variable:'مصارف متغیر',closing:'بستن‌های نهایی',
  unknown:'منبع در دسترس نیست',page:'صفحه ۱ / ۱',details:'شعبه‌های ثبت‌شده',total:'مجموع',growth:'مقایسه با دوره گذشته',consumption:'تحلیل مصرف محصولات',costControl:'کنترل هزینه‌ها',purchaseRatio:'خرید / فروشات',expenseRatio:'مصارف / فروشات',waste:'هزینه ضایعات',costCategory:'بیشترین مصرف',units:'قلم',lowShort:'کم',outShort:'تمام'}
};
const navy=[18,33,68],muted=[99,116,139],blue=[29,100,236],green=[5,150,105],red=[222,46,86],border=[216,228,243];
const num=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(n)||0);
const money=(v,c)=>num(v)+' '+c;
const tone=n=>Number(n)<0?red:green;
function chooseBranch(report){return (report?.branches||[]).slice(0,4);}
export function drawSinglePageSalesAnalytics(doc,{snapshot,previousSnapshot=null,growth=null,range,
  report=null,branchLabel='',businessName='BizCTRL',currency='SAR',lang='en',iconData=null}={}){
 if(!snapshot||!range||!branchLabel)throw Error('Verified data, date range and branch required');
 const tr=L[lang]||L.en,rtl=lang==='ar'||lang==='fa',W=210;
 const draw=(value,x,y,{size=8,bold=true,color=navy,align,maxWidth}={})=>{
  drawLocalizedPdfText(doc,String(value??'—'),x,y,{rtl,bold,size,color,align:align||(rtl?'right':'left'),maxWidth,fit:true});
 };
 // Coordinates are physical PDF cells; direction only chooses the anchor
 // within a cell. Never right-align an RTL label at the cell's left edge.
 const cell=(value,x,y,w,options={})=>draw(value,rtl?x+w:x,y,{maxWidth:w,...options});
 const pair=(label,value,x,y,w,options={})=>{
  const labelWidth=w*.54,valueWidth=w*.41;
  cell(label,rtl?x+w-labelWidth:x,y,labelWidth,{size:8,color:muted});
  draw(value,rtl?x:x+w,y,{size:8,bold:true,align:rtl?'left':'right',maxWidth:valueWidth,...options});
 };
 const block=(x,y,w,h,fill=[255,255,255],outline=border)=>{
  doc.setFillColor(...fill);if(outline)doc.setDrawColor(...outline);
  doc.roundedRect(x,y,w,h,3,3,outline?'FD':'F');
 };
 const title=(x,y,w,name)=>{
  doc.setFillColor(239,246,255);doc.roundedRect(x,y,w,10,2,2,'F');
  doc.setFillColor(...blue);doc.roundedRect(rtl?x+w-4:x+2,y+2,2,6,0.6,0.6,'F');
  draw(name,rtl?x+w-8:x+8,y+6.8,{size:9,bold:true,maxWidth:w-12});
 };
 const metric=(x,y,w,text,value,color=blue,sub=null)=>{
  block(x,y,w,25,[248,251,255]);
  draw(text,rtl?x+w-3:x+3,y+7,{size:7.3,color:muted,bold:true,maxWidth:w-7});
  draw(value,rtl?x+w-3:x+3,y+16.4,{size:12.2,color,bold:true,maxWidth:w-6});
  if(sub)draw(sub,rtl?x+w-3:x+3,y+22,{size:6.3,color:muted,maxWidth:w-6});
 };
 drawERPReportBrand(doc,{lang,title:tr.title,business:businessName,branch:branchLabel,
  period:range.from+' / '+range.to,iconData,pageLabel:tr.page});
 // Blue business headline, including report scope.
 block(7,27,196,27,[237,245,255],null);
 draw(tr.title,rtl?195:14,39,{size:15.3,bold:true,color:navy,maxWidth:180});
 // Keep ISO dates in a separate Latin run so bidi cannot reverse YYYY-MM-DD.
 cell(tr.period,rtl?161:14,47.5,34,{size:8,color:muted});
 draw(range.from+' / '+range.to,rtl?157:52,47.5,{size:8,color:muted,align:rtl?'right':'left',maxWidth:67});
 cell(tr.closing+': '+(snapshot.finalizedClosings??0),rtl?14:125,47.5,70,{size:8,color:muted});
 const g=growth==null?null:(growth>=0?'+':'')+growth.toFixed(1)+'% '+tr.growth;
 metric(7,58,46,tr.sales,money(snapshot.sales,currency),blue,g);
 metric(57,58,46,tr.purchases,money(snapshot.purchases,currency),[42,103,183]);
 metric(107,58,46,tr.expenses,money(snapshot.totalExpenses,currency),[211,133,32]);
 metric(157,58,46,tr.net,money(snapshot.netProfit,currency),tone(snapshot.netProfit));
 // Sales/Net profit trend panel
 block(7,87,122,63);title(9,89,118,tr.trend);
 const series=(snapshot.breakdown||[]);
 const points=series.length>15?series.filter((v,i)=>i%Math.ceil(series.length/15)===0):series;
 const chart={x:15,y:111,w:105,h:29};
 const max=Math.max(1,...points.map(p=>Math.abs(p.sales)||0),...points.map(p=>Math.abs(p.netProfit)||0));
 doc.setDrawColor(220,230,242);doc.setLineWidth(.35);
 [0,0.5,1].forEach(f=>doc.line(chart.x,chart.y+chart.h*f,chart.x+chart.w,chart.y+chart.h*f));
 const barStep=chart.w/Math.max(1,points.length);
 for(let i=0;i<points.length;i++){
  const p=points[i],v=Math.max(0,Number(p.sales)||0);
  const barW=Math.min(6,Math.max(1,barStep*.52));
  const ht=v/max*chart.h;
  doc.setFillColor(...blue);doc.roundedRect(chart.x+barStep*i+(barStep-barW)/2,chart.y+chart.h-ht,barW,Math.max(.25,ht),.5,.5,'F');
  const net=Number(p.netProfit)||0,profitHeight=Math.abs(net)/max*chart.h;
  doc.setFillColor(...tone(net));
  const markX=chart.x+barStep*(i+.5);
  doc.circle(markX,chart.y+chart.h-profitHeight,0.8,'F');
 }
 draw(points.length>0?points[0].date:tr.noData,16,146,{size:7,color:muted,align:'left',maxWidth:48});
 draw(points.length>0?points[points.length-1].date:tr.noData,121,146,{size:6.7,color:muted,align:'right'});
 // Payment channels as values, never re-add them to sales.
 block(133,87,70,63);title(135,89,66,tr.payment);
 const channels=[[tr.cash,snapshot.cash,green],[tr.network,snapshot.network,blue],
  [tr.credit,snapshot.credit,[124,58,237]],[tr.other,snapshot.other,[235,156,47]]];
 const total=Math.max(0,Number(snapshot.sales)||0),part=Math.max(0,total);
 let barLeft=139;
 channels.forEach(([label,value,color],i)=>{
  doc.setFillColor(...color);
  doc.circle(rtl?198:140,108+i*10,1.5,'F');
  pair(label,money(value,currency),rtl?138:144,110+i*10,rtl?56:55,{size:8,color:navy});
  const width=part>0?Math.min(55,Math.max(0,Number(value)||0)/part*55):0;
  const available=Math.max(0,194-barLeft);
  const segment=Math.min(available,width);
  if(segment>0){doc.setFillColor(...color);doc.rect(barLeft,144,segment,2,'F');barLeft+=segment;}
 });
 // Branch summary
 block(7,154,122,57);title(9,156,118,tr.branches);
 cell(tr.name,rtl?70:13,174,52,{size:8,color:muted});
 cell(tr.sales,rtl?42:70,174,24,{size:7.7,color:muted});
 cell(tr.net,rtl?13:98,174,25,{size:7.7,color:muted});
 const branchRows=chooseBranch(report);
 if(!report)cell(tr.unknown,13,186,110,{color:muted,size:8});
 else if(!branchRows.length)cell(tr.noData,13,186,110,{color:muted,size:8});
 else branchRows.forEach((b,i)=>{
  const y=183+i*6.6;
  if(i%2===0){doc.setFillColor(246,249,253);doc.rect(11,y-4.6,114,6.6,'F');}
  cell(String(b.name||b.label||tr.noData),rtl?70:13,y,52,{size:8});
  cell(num(b.sales),rtl?42:70,y,24,{size:8});
  cell(num(b.netProfit),rtl?13:98,y,25,{size:8,color:tone(b.netProfit)});
 });
 block(133,154,70,57);title(135,156,66,tr.summary);
 const rows=[[tr.gross,snapshot.grossProfit],[tr.variable,snapshot.variableExpenses],
  [tr.fixed,snapshot.fixedDeduction],[tr.margin,snapshot.netMargin==null?null:snapshot.netMargin]];
 rows.forEach(([label,value],i)=>{
  pair(label,value===null?'—':i===3?Number(value).toFixed(1)+'%':money(value,currency),138,177+i*8.4,60,{color:i===3?tone(snapshot.netProfit):navy});
 });

 // Recorded product consumption; never equate approved purchases to real food COGS.
 const control=buildPdfConsumptionCostControl({snapshot,previousSnapshot,operationsReport:report});
 const pct=(value,prior)=>value===null?'—':num(value)+'%'+(prior===null?'':' ('+(value-prior>=0?'+':'')+num(value-prior)+'pp)');
 block(7,215,94,35);title(9,217,90,tr.consumption);
 if(!control.productRows.length)draw(tr.noData,rtl?95:12,235,{size:7.3,color:muted,maxWidth:80});
 control.productRows.forEach((item,i)=>{
   const y=235+i*7;
   cell(item.name,rtl?58:12,y,37,{size:8});
   cell(num(item.quantity)+' '+item.unit,rtl?36:51,y,19,{size:8,color:blue});
   cell(item.estimatedCost===null?'—':money(item.estimatedCost,currency),rtl?12:73,y,22,{size:8,color:item.estimatedCost===null?muted:green});
 });
 pair(tr.waste,control.wasteCost===null?'—':money(control.wasteCost,currency),12,247,83,{size:7.5,color:muted});
 block(105,215,98,35);title(107,217,94,tr.costControl);
 pair(tr.purchaseRatio,pct(control.purchaseRatio,control.prevPurchaseRatio),110,234,89);
 pair(tr.expenseRatio,pct(control.expenseRatio,control.prevExpenseRatio),110,241,89);
 const category=control.topExpenseCategory;
 pair(category?category.name:tr.costCategory,category?money(category.value,currency):'—',110,248,89);
 // Keep previous inventory, receivables and operational risk summaries.
 block(7,253,62,22);title(9,254,58,tr.stock);
 if(report?.hasInventoryData){
  [[report.stockCount,tr.units],[report.lowStock?.length||0,tr.lowShort],[report.noStock||0,tr.outShort]].forEach(([value,label],i)=>{
   const x=12+(rtl?2-i:i)*17;
   cell(String(value)+' '+label,x,269,16,{size:7.5});
  });
 }else cell(tr.unknown,12,269,51,{size:7.5});
 block(73,253,62,22);title(75,254,58,tr.debt);
 const debtRows=[[tr.receivables,report?.hasDebtData?report.debts?.receivables:null],
   [tr.payables,report?.hasDebtData?report.debts?.payables:null]];
 debtRows.forEach(([label,value],i)=>{
   const y=265.5+i*6.8;
   pair(label,value==null?'—':money(value,currency),78,y,52,{size:8,color:i===0?green:red});
 });
 block(139,253,64,22);title(141,254,60,tr.risk);
 const count=report?(report.lowStock?.length||0)+(report.debts?.receivables>0?1:0)+
   (report.branches||[]).filter(b=>Number(b.netProfit)<0).length:null;
 cell(tr.risks,145,266,53,{size:7.3,color:muted});
 draw(count==null?'—':String(count),rtl?145:198,272,{size:11,bold:true,color:count>0?red:green,align:rtl?'left':'right'});
 draw(tr.note,rtl?195:12,280,{size:7,color:muted,maxWidth:180});
 if(doc.getNumberOfPages()!==1)throw Error('Single-page ERP Sales Analytics overflow');
}
