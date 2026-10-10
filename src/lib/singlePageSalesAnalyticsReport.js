import {drawLocalizedPdfText} from './pdfLocalization';
import {drawERPReportBrand} from './erpPdfBrand';

const L={
 en:{title:'ERP Sales Analytics Report',period:'Reporting period',sales:'Verified sales',purchases:'Approved purchases',
  expenses:'Period expenses',net:'Net profit / loss',trend:'Sales & profit trend',
  payment:'Payment channel breakdown',cash:'Cash',network:'Network',credit:'Customer credit',other:'Other sales sources',
  profit:'Net result',gross:'Gross profit',margin:'Net margin',branches:'Branch performance',name:'Branch',
  stock:'Inventory / consumption',items:'Stock records',low:'Low stock',out:'Out of stock',
  debt:'Outstanding balances',receivables:'Receivables',payables:'Payables',risk:'Management attention',
  risks:'Items requiring review',noData:'Not recorded',generated:'Generated',note:'Finalized closings only · Network and credit are included in sales · Cash sales ≠ cash in drawer',
  summary:'Cost & profitability',fixed:'Allocated fixed expenses',variable:'Variable expenses',closing:'Finalized closings',
  unknown:'Source not available',page:'PAGE 1 / 1',details:'Top recorded branches',total:'Total',growth:'vs previous period'},
 ar:{title:'تقرير تحليلات المبيعات ERP',period:'فترة التقرير',sales:'المبيعات المعتمدة',purchases:'المشتريات المعتمدة',
  expenses:'مصروفات الفترة',net:'صافي الربح / الخسارة',trend:'اتجاه المبيعات والأرباح',
  payment:'توزيع طرق الدفع',cash:'نقد',network:'شبكة',credit:'آجل',other:'مصادر مبيعات أخرى',
  profit:'النتيجة الصافية',gross:'الربح الإجمالي',margin:'هامش صافي الربح',branches:'أداء الفروع',name:'الفرع',
  stock:'المخزون والاستهلاك',items:'أصناف المخزون',low:'مخزون منخفض',out:'نفاد المخزون',
  debt:'الأرصدة المستحقة',receivables:'الذمم المدينة',payables:'الذمم الدائنة',risk:'متابعة الإدارة',
  risks:'تنبيهات تحتاج متابعة',noData:'غير مسجل',generated:'تم الإنشاء',note:'فقط المبيعات المعتمدة · الشبكة والآجل ضمن المبيعات · النقد ليس رصيد الصندوق',
  summary:'التكلفة والربحية',fixed:'المصروفات الثابتة الموزعة',variable:'المصروفات المتغيرة',closing:'إقفالات معتمدة',
  unknown:'المصدر غير متاح',page:'صفحة ١ / ١',details:'الفروع المسجلة',total:'المجموع',growth:'مقارنة بالفترة السابقة'},
 fa:{title:'گزارش تحلیل فروشات ERP',period:'دوره گزارش',sales:'فروشات نهایی',purchases:'خریدهای تأییدشده',
  expenses:'مصارف دوره',net:'فایده / نقصان خالص',trend:'روند فروشات و فایده',
  payment:'تقسیم روش‌های پرداخت',cash:'نقد',network:'شبکه',credit:'نسیه',other:'منابع دیگر فروش',
  profit:'نتیجه خالص',gross:'فایده ناخالص',margin:'حاشیه فایده خالص',branches:'عملکرد شعبه‌ها',name:'شعبه',
  stock:'موجودی و مصرف',items:'ردیف‌های انبار',low:'موجودی کم',out:'تمام‌شده',
  debt:'مانده بدهی‌ها',receivables:'مطالبات',payables:'بدهی‌ها',risk:'توجه مدیریت',
  risks:'موارد نیازمند بررسی',noData:'ثبت نشده',generated:'ایجاد شده',note:'تنها فروشات نهایی · شبکه و نسیه داخل فروشات است · نقد فروش با مانده صندوق فرق دارد',
  summary:'هزینه و سودآوری',fixed:'مصارف ثابت تخصیص‌یافته',variable:'مصارف متغیر',closing:'بستن‌های نهایی',
  unknown:'منبع در دسترس نیست',page:'صفحه ۱ / ۱',details:'شعبه‌های ثبت‌شده',total:'مجموع',growth:'مقایسه با دوره گذشته'}
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
 const draw=(value,x,y,{size=8,bold=false,color=navy,align,maxWidth}={})=>{
  drawLocalizedPdfText(doc,String(value??'—'),x,y,{rtl,bold,size,color,align:align||(rtl?'right':'left'),maxWidth});
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
  period:range.from+' → '+range.to,iconData,pageLabel:tr.page});
 // Blue business headline, including report scope.
 block(7,27,196,27,[237,245,255],null);
 draw(tr.title,rtl?195:14,39,{size:15.3,bold:true,color:navy,maxWidth:180});
 draw(tr.period+': '+range.from+' → '+range.to+'    |    '+tr.closing+': '+(snapshot.finalizedClosings??0),
   rtl?195:14,47.5,{size:8,color:muted,maxWidth:182});
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
 draw(points.length>0?points[0].date:tr.noData,16,146,{size:6.7,color:muted});
 draw(points.length>0?points[points.length-1].date:tr.noData,121,146,{size:6.7,color:muted,align:'right'});
 // Payment channels as values, never re-add them to sales.
 block(133,87,70,63);title(135,89,66,tr.payment);
 const channels=[[tr.cash,snapshot.cash,green],[tr.network,snapshot.network,blue],
  [tr.credit,snapshot.credit,[124,58,237]],[tr.other,snapshot.other,[235,156,47]]];
 const total=Math.max(0,Number(snapshot.sales)||0),part=Math.max(0,total);
 let barLeft=139;
 channels.forEach(([label,value,color],i)=>{
  doc.setFillColor(...color);
  doc.circle(141,108+i*10,1.7,'F');
  draw(label,146,110+i*10,{size:7.3,maxWidth:28});
  draw(money(value,currency),199,110+i*10,{size:7.3,bold:true,color:navy,align:'right',maxWidth:22});
  const width=part>0?Math.min(55,Math.max(0,Number(value)||0)/part*55):0;
  const available=Math.max(0,194-barLeft);
  const segment=Math.min(available,width);
  if(segment>0){doc.setFillColor(...color);doc.rect(barLeft,144,segment,2,'F');barLeft+=segment;}
 });
 // Branch summary
 block(7,154,122,57);title(9,156,118,tr.branches);
 draw(tr.name,13,174,{size:7.1,bold:true,color:muted,maxWidth:50});
 draw(tr.sales,89,174,{size:7.1,bold:true,color:muted,align:'right'});
 draw(tr.net,123,174,{size:7.1,bold:true,color:muted,align:'right'});
 const branchRows=chooseBranch(report);
 if(!report)draw(tr.unknown,13,186,{color:muted,size:7.5});
 else if(!branchRows.length)draw(tr.noData,13,186,{color:muted,size:7.5});
 else branchRows.forEach((b,i)=>{
  const y=183+i*6.6;
  if(i%2===0){doc.setFillColor(246,249,253);doc.rect(11,y-4.6,114,6.6,'F');}
  draw(String(b.name||b.label||tr.noData).slice(0,24),13,y,{size:7.2,maxWidth:52});
  draw(num(b.sales),89,y,{size:7.1,align:'right'});
  draw(num(b.netProfit),123,y,{size:7.1,bold:true,color:tone(b.netProfit),align:'right'});
 });
 block(133,154,70,57);title(135,156,66,tr.summary);
 const rows=[[tr.gross,snapshot.grossProfit],[tr.variable,snapshot.variableExpenses],
  [tr.fixed,snapshot.fixedDeduction],[tr.margin,snapshot.netMargin==null?null:snapshot.netMargin]];
 rows.forEach(([label,value],i)=>{
  draw(label,139,177+i*8.4,{size:7.2,maxWidth:31,color:muted});
  draw(value===null?'—':i===3?Number(value).toFixed(1)+'%':money(value,currency),198,177+i*8.4,{
   size:7.6,bold:true,align:'right',maxWidth:25,color:i===3?tone(snapshot.netProfit):navy});
 });
 // Operations intelligence as-of-now, rather than artificial zeros.
 block(7,215,62,57);title(9,217,58,tr.stock);
 const inventoryRows=report?[
  [tr.items,report.hasInventoryData?report.stockCount:null],
  [tr.low,report.hasInventoryData?report.lowStock?.length:null],
  [tr.out,report.hasInventoryData?report.noStock:null],
 ]: [[tr.items,null],[tr.low,null],[tr.out,null]];
 inventoryRows.forEach(([label,value],i)=>{draw(label,12,238+i*9,{size:7.1,color:muted,maxWidth:37});
  draw(value==null?'—':String(value),63,238+i*9,{size:8.5,bold:true,align:'right',color:value>0&&i>0?red:navy});});
 block(73,215,62,57);title(75,217,58,tr.debt);
 const debts=[ [tr.receivables,report?.hasDebtData?report.debts?.receivables:null],
   [tr.payables,report?.hasDebtData?report.debts?.payables:null]];
 debts.forEach(([label,value],i)=>{draw(label,78,240+i*12,{size:7.2,color:muted,maxWidth:45});
   draw(value==null?'—':money(value,currency),130,245+i*12,{size:9,bold:true,color:i===0?green:red,align:'right',maxWidth:50});});
 block(139,215,64,57);title(141,217,60,tr.risk);
 const count=report? (report.lowStock?.length||0)+(report.debts?.receivables>0?1:0)+(report.branches||[]).filter(b=>Number(b.netProfit)<0).length:null;
 draw(tr.risks,145,239,{size:7.1,color:muted,maxWidth:54});
 draw(count==null?tr.unknown:String(count),198,250,{size:13.4,bold:true,color:count>0?red:green,align:'right'});
 draw(tr.note,rtl?195:12,280,{size:7,color:muted,maxWidth:180});
 if(doc.getNumberOfPages()!==1)throw Error('Single-page ERP Sales Analytics overflow');
}
