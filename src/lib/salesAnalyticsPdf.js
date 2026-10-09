import jsPDF from 'jspdf';
import { prepareLocalizedPdf, drawLocalizedPdfText, safePdfFilename } from './pdfLocalization';
import { drawSinglePageERPReport } from './singlePageERPReport';

const L={
 en:{title:'ERP Sales Analytics',branch:'Branch',range:'Reporting period',sales:'Verified sales',purchase:'Approved purchases',gross:'Gross profit',net:'Net profit / loss',expenses:'Total expenses',margin:'Net margin',payments:'Payment channels',cash:'Cash sales',network:'Network sales',credit:'Credit sales',other:'Other revenue',comparison:'Previous comparable period',growth:'Sales change',noCompare:'No previous sales data',trend:'Sales trend',details:'Period breakdown',date:'Date',gp:'Gross P/L',note:'Confirmed closings only. Cash sales are not the physical drawer balance. Payment channels are included in sales, not added again.',generated:'Generated',page:'Page',of:'of',periodDays:'Reported days',grossMargin:'Gross margin'},
 ar:{title:'تحليلات المبيعات ERP',branch:'الفرع',range:'فترة التقرير',sales:'المبيعات المعتمدة',purchase:'المشتريات المعتمدة',gross:'الربح الإجمالي',net:'صافي الربح / الخسارة',expenses:'إجمالي المصروفات',margin:'هامش صافي الربح',payments:'طرق الدفع',cash:'مبيعات النقد',network:'مبيعات الشبكة',credit:'مبيعات الآجل',other:'مصادر إضافية',comparison:'الفترة السابقة المماثلة',growth:'تغير المبيعات',noCompare:'لا توجد مبيعات سابقة',trend:'اتجاه المبيعات',details:'تفاصيل الفترة',date:'التاريخ',gp:'الربح الإجمالي',note:'فقط الإقفالات المعتمدة. المبيعات النقدية ليست رصيد الصندوق الفعلي. طرق الدفع جزء من المبيعات ولا تُضاف مرة أخرى.',generated:'تاريخ الإنشاء',page:'صفحة',of:'من',periodDays:'أيام التقرير',grossMargin:'هامش الربح الإجمالي'},
 fa:{title:'تحلیل فروشات ERP',branch:'شعبه',range:'دوره گزارش',sales:'فروشات تأییدشده',purchase:'خریدهای تأییدشده',gross:'فایده ناخالص',net:'فایده / نقصان خالص',expenses:'مجموع مصارف',margin:'حاشیه فایده خالص',payments:'روش‌های پرداخت',cash:'فروشات نقد',network:'فروشات شبکه',credit:'فروشات نسیه',other:'منابع اضافی',comparison:'دوره مشابه قبلی',growth:'تغییر فروشات',noCompare:'فروشات قبلی ثبت نشده',trend:'روند فروشات',details:'جزئیات دوره',date:'تاریخ',gp:'فایده ناخالص',note:'فقط فروشات نهایی. فروشات نقد موجودی واقعی صندوق نیست. روش‌های پرداخت در مجموع فروش شامل‌اند و دوباره اضافه نمی‌شوند.',generated:'تاریخ تولید',page:'صفحه',of:'از',periodDays:'روزهای دوره',grossMargin:'حاشیه فایده ناخالص'},
};
const navy=[15,23,42],blue=[37,99,235],muted=[100,116,139],green=[5,150,105],red=[225,29,72];
const money=(value,currency)=>`${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(value)||0)} ${currency}`;
const number=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(value)||0);
const dateLabel=range=>`${range.from} — ${range.to}`;

export async function generateSalesAnalyticsPDF({
 snapshot, previousSnapshot, growth, range, branchLabel, businessName='BizCTRL', currency='SAR',
 lang='en', dir='ltr', operationsReport=null, download=true,
}={}){
 if(!snapshot || !range || !branchLabel)throw new Error('A verified report, period and branch are required');
 const language=L[lang]?lang:'en',t=L[language],rtl=language!=='en' || dir==='rtl';
 const doc=new jsPDF({unit:'mm',format:'a4',putOnlyUsedFonts:true});
 prepareLocalizedPdf(doc,{lang:language,dir:rtl?'rtl':'ltr'});
 // Operations ERP report is a deliberately single-page A4 management dashboard.
 // Do not generate the older two-page sales report before this page; that was
 // causing the 6-page output which did not match the owner's reference layout.
 if(operationsReport){
  drawSinglePageERPReport(doc,{
   snapshot,report:operationsReport,range,branchLabel,businessName,currency,lang:language,
  });
  if(doc.getNumberOfPages()!==1)throw new Error('ERP single-page PDF did not fit A4');
  if(download)doc.save(safePdfFilename('BizCTRL-ERP-One-Page-'+range.type+'-'+range.from+'-'+range.to,language));
  return doc;
 }

 const W=210,M=14,CW=W-2*M;
 const label=(value,x,y,{bold=false,size=9,color=navy,align=rtl?'right':'left'}={})=>{
  drawLocalizedPdfText(doc,String(value??''),x,y,{rtl,bold,size,color,align,maxWidth:CW});
 };
 const leftLabel=(v,y,opts={})=>label(v,rtl?W-M:M,y,opts);
 const simpleNumber=(v,x,y,opts={})=>label(v,x,y,{...opts,align:'right'});
 const addHeader=(title)=>{
  doc.setFillColor(...navy);doc.rect(0,0,W,40,'F');
  label(businessName,rtl?W-M:M,14,{bold:true,size:13,color:[255,255,255]});
  label(title,rtl?W-M:M,25,{bold:true,size:11,color:[219,234,254]});
  label(`${branchLabel}  |  ${dateLabel(range)}`,rtl?W-M:M,34,{size:8,color:[191,219,254]});
 };
 const box=(x,y,w,h,title,value,accent=blue)=>{
  doc.setFillColor(247,250,252);doc.setDrawColor(226,232,240);doc.roundedRect(x,y,w,h,3,3,'FD');
  doc.setFillColor(...accent);doc.rect(rtl?x+w-1.8:x,y,1.8,h,'F');
  label(title,rtl?x+w-5:x+5,y+9,{size:8,color:muted});
  label(value,rtl?x+w-5:x+5,y+22,{bold:true,size:12,color:accent});
 };
 const footer=()=>{
  const pages=doc.getNumberOfPages();
  for(let index=1;index<=pages;index++){
   doc.setPage(index);doc.setDrawColor(226,232,240);doc.line(M,284,W-M,284);
   label(`${t.generated}: ${new Date().toISOString().slice(0,10)}`,rtl?W-M:M,290,{size:8,color:muted});
   label(`${t.page} ${index} ${t.of} ${pages}`,rtl?M:W-M,290,{size:8,color:muted,align:rtl?'left':'right'});
  }
 };
 addHeader(t.title);
 const gap=4,w=(CW-2*gap)/3;
 box(M,47,w,28,t.sales,money(snapshot.sales,currency),blue);
 box(M+w+gap,47,w,28,t.purchase,money(snapshot.purchases,currency));
 box(M+(w+gap)*2,47,w,28,t.gross,money(snapshot.grossProfit,currency),snapshot.grossProfit<0?red:green);
 box(M,79,w,28,t.expenses,money(snapshot.totalExpenses,currency));
 box(M+w+gap,79,w,28,t.net,money(snapshot.netProfit,currency),snapshot.netProfit<0?red:green);
 box(M+(w+gap)*2,79,w,28,t.margin,snapshot.netMargin===null?'—':`${snapshot.netMargin.toFixed(1)}%`,snapshot.netProfit<0?red:green);
 leftLabel(t.payments,117,{bold:true,size:11});
 const channels=[[t.cash,snapshot.cash],[t.network,snapshot.network],[t.credit,snapshot.credit],[t.other,snapshot.other]];
 channels.forEach(([name,value],i)=>{
  const col=i%2,row=Math.floor(i/2);
  const x=M+col*(CW/2+1),y=122+row*19;
  label(name,rtl?x+CW/2-5:x+3,y+7,{size:8,color:muted});
  label(money(value,currency),rtl?x+CW/2-5:x+3,y+15,{size:9,bold:true});
 });
 doc.setFillColor(239,246,255);doc.roundedRect(M,166,CW,24,2,2,'F');
 leftLabel(`${t.comparison}: ${previousSnapshot?money(previousSnapshot.sales,currency):t.noCompare}`,174,{size:9});
 leftLabel(`${t.growth}: ${growth===null?'—':`${growth>=0?'+':''}${growth.toFixed(1)}%`}`,184,{size:9,bold:true,color:growth===null?muted:growth<0?red:green});
 leftLabel(t.trend,201,{size:10,bold:true});
 const rows=snapshot.breakdown||[],max=Math.max(1,...rows.map(r=>r.sales));
 const chartRows=rows.length>22?rows.filter((_,i)=>i%Math.ceil(rows.length/22)===0):rows;
 const chartX=M+4,chartY=208,chartW=CW-8,chartH=42;
 chartRows.forEach((row,i)=>{
  const step=chartW/chartRows.length,barW=Math.max(1.1,Math.min(6,step-1));
  const height=40*Math.max(0,row.sales)/max;
  doc.setFillColor(...blue);doc.roundedRect(chartX+i*step+step/2-barW/2,chartY+chartH-height,barW,Math.max(.6,height),.4,.4,'F');
 });
 doc.setDrawColor(203,213,225);doc.line(chartX,chartY+chartH,chartX+chartW,chartY+chartH);
 doc.setFillColor(248,250,252);doc.roundedRect(M,258,CW,18,2,2,'F');
 leftLabel(t.note,266,{size:7,color:muted});
 leftLabel(`${t.periodDays}: ${snapshot.days} · ${t.grossMargin}: ${snapshot.grossMargin===null?'—':snapshot.grossMargin.toFixed(1)+'%'}`,273,{size:7,color:muted});

 const headers=[t.date,t.sales,t.cash,t.network,t.credit,t.purchase,t.net];
 const cols=[29,28,22,23,22,29,29];
 const drawTableHeader=(top)=>{
  doc.setFillColor(239,246,255);doc.roundedRect(M,top,CW,11,1.5,1.5,'F');
  let x=M;headers.forEach((name,i)=>{const center=x+cols[i]/2;label(name,center,top+7,{size:7,color:navy,bold:true,align:'center'});x+=cols[i]});
 };
 doc.addPage();addHeader(t.details);let y=48;drawTableHeader(y);y+=12;
 for(const row of rows){
  if(y>269){doc.addPage();addHeader(t.details);y=48;drawTableHeader(y);y+=12;}
  if(Math.floor((y-60)/9)%2===0){doc.setFillColor(248,250,252);doc.rect(M,y-1,CW,9,'F');}
  const cells=[row.date,number(row.sales),number(row.cash),number(row.network),number(row.credit),number(row.purchases),number(row.netProfit)];
  let x=M;
  cells.forEach((v,i)=>{label(v,x+cols[i]-2,y+5.5,{size:7,color:i===6&&row.netProfit<0?red:navy,align:'right'});x+=cols[i]});
  y+=9;
 }
 if(y<260) {
  doc.setDrawColor(203,213,225);doc.line(M,y+3,W-M,y+3);
  label(`${t.sales}: ${money(snapshot.sales,currency)}   |   ${t.net}: ${money(snapshot.netProfit,currency)}`,rtl?W-M:M,y+12,{bold:true,size:9});
 }
 footer();
 if(download)doc.save(safePdfFilename(`BizCTRL-Sales-Analytics-${range.type}-${range.from}-${range.to}`,language));
 return doc;
}
