import { drawLocalizedPdfText } from './pdfLocalization';

const I18N={
 en:{
  title:'Operations, Branches & Inventory',subtitle:'Confirmed branch results · Stock & resource control',
  branch:'Branch',sales:'Sales',purchase:'Purchases',expense:'Expenses',net:'Net profit',margin:'Margin',
  performance:'Branch performance',best:'Highest net profit',worst:'Lowest net profit',
  branchGraph:'Branch sales vs net result',stockTitle:'Stock health (latest recorded)',
  stock:'Product',onHand:'On hand',minimum:'Minimum',status:'Status',low:'Low',out:'Out',ok:'OK',noData:'Not recorded',
  inventory:'Inventory and consumption',asOf:'Balance as of',skus:'Stock records',lowStock:'Low stock',outStock:'Out of stock',
  consumption:'Recorded consumption in selected period',qty:'Quantity',cost:'Estimated cost',waste:'Waste',
  operations:'Expenses, Debts & Risks',costs:'Operating expenses by category',variableHint:'Fixed monthly expenses allocated by calendar day',
  customerDebt:'Customer receivables',supplierDebt:'Payables',balanceHint:'Outstanding balances as of report generation; not period sales',
  risks:'Operational attention',loss:'Branch recorded a net loss',stockRisk:'Low stock items require review',
  outRisk:'Out-of-stock items require review',collection:'Customer debt requires collection review',
  unknown:'Unverified debt balances',noRisks:'No reportable issues from available records',
  incomplete:'Some records could not be allocated to a known branch; branch totals may differ from the consolidated report.',
  sampleNote:'Based on recorded ERP data only. An absent inventory or debt record is not treated as a confirmed zero.',
  source:'Source: finalized sales · approved invoices · expenses · inventory ledger',
  showMore:'Additional rows in continuation',noConsumption:'No recorded consumption for this period',
 },
 ar:{
  title:'الأداء التشغيلي والفروع والمخزون',subtitle:'نتائج الفروع المعتمدة · متابعة المخزون والاستهلاك',
  branch:'الفرع',sales:'المبيعات',purchase:'المشتريات',expense:'المصروفات',net:'صافي الربح',margin:'هامش الربح',
  performance:'أداء الفروع',best:'أعلى ربح صافي',worst:'أقل ربح صافي',
  branchGraph:'مقارنة المبيعات وصافي الربح',stockTitle:'حالة المخزون المسجلة',
  stock:'الصنف',onHand:'الرصيد',minimum:'الحد الأدنى',status:'الحالة',low:'منخفض',out:'نفد',ok:'جيد',noData:'غير مسجل',
  inventory:'المخزون والاستهلاك',asOf:'الرصيد حتى',skus:'أصناف المخزون',lowStock:'مخزون منخفض',outStock:'نفاد مخزون',
  consumption:'الاستهلاك المسجل خلال الفترة',qty:'الكمية',cost:'التكلفة التقديرية',waste:'الهدر',
  operations:'المصروفات والذمم والمخاطر',costs:'المصروفات حسب الفئة',variableHint:'توزيع المصروفات الشهرية الثابتة حسب أيام التقويم',
  customerDebt:'الذمم المدينة للعملاء',supplierDebt:'الذمم الدائنة',balanceHint:'الأرصدة المفتوحة بتاريخ إنشاء التقرير، وليست مبيعات الفترة',
  risks:'تنبيهات تشغيلية',loss:'خسارة صافية مسجلة في أحد الفروع',stockRisk:'راجع الأصناف منخفضة المخزون',
  outRisk:'راجع الأصناف النافدة',collection:'متابعة تحصيل ديون العملاء',
  unknown:'أرصدة ذمم غير متحققة',noRisks:'لا توجد مخاطر قابلة للتقرير في البيانات المتاحة',
  incomplete:'بعض القيود ليست مرتبطة بفرع محدد؛ قد تختلف نتائج الفروع عن الإجمالي.',
  sampleNote:'اعتماداً على قيود ERP المسجلة فقط. البيانات المفقودة لا تعني رصيداً صفرياً مؤكداً.',
  source:'المصدر: المبيعات المعتمدة · فواتير الشراء · المصروفات · سجل المخزون',
  showMore:'صفوف إضافية في صفحة لاحقة',noConsumption:'لا توجد حركات استهلاك مسجلة للفترة',
 },
 fa:{
  title:'عملکرد عملیاتی، شعبه‌ها و انبار',subtitle:'نتایج قطعی شعبه‌ها · کنترل موجودی و مصرف',
  branch:'شعبه',sales:'فروشات',purchase:'خرید',expense:'مصارف',net:'فایده خالص',margin:'حاشیه فایده',
  performance:'عملکرد شعبه‌ها',best:'بیشترین فایده خالص',worst:'کمترین فایده خالص',
  branchGraph:'مقایسه فروشات و فایده خالص',stockTitle:'وضعیت انبار ثبت‌شده',
  stock:'محصول',onHand:'موجودی',minimum:'حداقل',status:'وضعیت',low:'کم',out:'تمام',ok:'مناسب',noData:'ثبت نشده',
  inventory:'انبار و مصرف',asOf:'موجودی تا تاریخ',skus:'ردیف موجودی',lowStock:'موجودی کم',outStock:'تمام‌شده',
  consumption:'مصرف ثبت‌شده در این دوره',qty:'مقدار',cost:'هزینه تخمینی',waste:'ضایعات',
  operations:'مصارف، طلب‌ها و خطرات',costs:'مصارف بر اساس دسته',variableHint:'سهم روزانه مصارف ثابت از ماه محاسبه شده',
  customerDebt:'طلب مشتریان',supplierDebt:'بدهی قابل پرداخت',balanceHint:'مانده‌های باز در زمان تولید گزارش؛ نه فروشات دوره',
  risks:'هشدارهای عملیاتی',loss:'یکی از شعبه‌ها نقصان خالص ثبت کرده',stockRisk:'محصولات دارای موجودی کم بررسی شوند',
  outRisk:'محصولات تمام‌شده بررسی شوند',collection:'طلب مشتریان نیاز به پیگیری دارد',
  unknown:'مانده‌های نامشخص',noRisks:'در اطلاعات موجود هشدار ثبت‌شدنی دیده نشد',
  incomplete:'بعضی رکوردها به شعبه مشخص مربوط نیستند؛ جمع شعبه‌ها ممکن است با جمع عمومی فرق کند.',
  sampleNote:'فقط براساس ثبت‌های واقعی ERP؛ نبود داده به معنای صفر قطعی نیست.',
  source:'منبع: فروشات نهایی · فاکتور خرید · مصارف · دفتر انبار',
  showMore:'ردیف‌های دیگر در ادامه',noConsumption:'مصرف ثبت‌شده برای این دوره وجود ندارد',
 },
};
const NAVY=[15,23,42],BLUE=[37,99,235],GREEN=[5,150,105],RED=[225,29,72],MUTED=[100,116,139];
const fmtNumber=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(n)||0);
const shortened=(str,n=34)=>{const t=String(str||'—');return t.length>n?t.slice(0,n-1)+'…':t;};

/** Append three dedicated landscape-inspired A4 portrait report pages.
 * All financial values come from the shared period snapshot or scoped sources.
 * QR/verification badges are deliberately omitted: a PDF is not audit-certified
 * merely because a JS report generator created it.
 */
export function appendOperationsPdfPages(doc,{
 report,range,branchLabel,businessName,currency='SAR',lang='en',
}={}){
 if(!report || !range) return;
 const language=I18N[lang]?lang:'en',t=I18N[language],rtl=language!=='en';
 const W=210,M=13,CW=W-2*M;
 const money=value=>`${fmtNumber(value)} ${currency}`;
 const write=(s,x,y,opts={})=>drawLocalizedPdfText(doc,shortened(s,opts.limit||80),x,y,{
  rtl,bold:!!opts.bold,size:opts.size||9,
  color:opts.color||NAVY,align:opts.align||(rtl?'right':'left'),maxWidth:opts.width,
 });
 const startPage=(heading,sub)=>{
  doc.addPage();doc.setFillColor(...NAVY);doc.rect(0,0,W,40,'F');
  write(businessName||'BizCTRL',rtl?W-M:M,12,{bold:true,size:12,color:[255,255,255]});
  write(heading,rtl?W-M:M,23,{bold:true,size:13,color:[255,255,255]});
  write(`${sub} · ${branchLabel} · ${range.from} — ${range.to}`,
    rtl?W-M:M,33,{size:7.8,color:[191,219,254],limit:105});
 };
 const section=(heading,y)=>{
  doc.setFillColor(239,246,255);doc.roundedRect(M,y,CW,11,2,2,'F');
  write(heading,rtl?W-M+0-4:M+4,y+7.4,{bold:true,size:10,color:BLUE});
 };
 const card=(x,y,w,h,heading,value,{tone='blue',sub}={})=>{
  const palette=tone==='green'?GREEN:tone==='red'?RED:BLUE;
  doc.setFillColor(249,251,255);doc.setDrawColor(219,231,246);
  doc.roundedRect(x,y,w,h,2.5,2.5,'FD');
  doc.setFillColor(...palette);doc.rect(rtl?x+w-2:x,y,2,h,'F');
  write(heading,rtl?x+w-5:x+5,y+7.5,{size:7.3,color:MUTED,limit:24});
  write(value,rtl?x+w-5:x+5,y+18,{size:12,bold:true,color:palette,limit:32});
  if(sub)write(sub,rtl?x+w-5:x+5,y+h-5,{size:7,color:MUTED,limit:34});
 };
 const kvRow=(labels,values,y,widths,totalWidth=CW)=>{
  let x=M;
  for(let i=0;i<labels.length;i++){
   const w=widths[i] || totalWidth/labels.length;
   const center=x+w/2;
   write(values[i],center,y,{size:7.5,bold:i===labels.length-2,
    color:i===labels.length-2&&Number(values[i])<0?RED:NAVY,
    align:'center',width:w-2,limit:i===0?30:22});
   x+=w;
  }
 };
 // --- Page: branch comparison ---
 startPage(t.title,t.subtitle);
 section(t.performance,47);
 const widths=[44,28,29,28,30,25], labels=[t.branch,t.sales,t.purchase,t.expense,t.net,t.margin];
 const branchRows=report.branches||[];
 const branchHeader=y=>{
  doc.setFillColor(241,245,249);doc.roundedRect(M,y,CW,11,1.5,1.5,'F');
  let x=M;
  labels.forEach((label,i)=>{write(label,x+widths[i]/2,y+7,{bold:true,size:7.1,align:'center',width:widths[i]-2,limit:20});x+=widths[i];});
 };
 let y=61;branchHeader(y);y+=12;
 if(!branchRows.length){write(t.noData,rtl?W-M:M,y+7,{size:9,color:MUTED});y+=14;}
 for(let index=0;index<branchRows.length;index++){
  if(y>135){startPage(t.performance,t.showMore);y=49;branchHeader(y);y+=12;}
  const b=branchRows[index];
  if(index%2===0){doc.setFillColor(249,251,255);doc.rect(M,y-1,CW,9,'F');}
  kvRow(labels,[shortened(b.name,22),fmtNumber(b.sales),fmtNumber(b.purchases),fmtNumber(b.expenses),
   fmtNumber(b.netProfit),b.margin===null?'—':b.margin.toFixed(1)+'%'],y+5.2,widths);
  y+=9;
 }
 // Avoid overfilling branch continuation pages.
 if(y>131){startPage(t.performance,t.branchGraph);y=48;}
 const chartTop=Math.max(151,y+11);
 section(t.branchGraph,chartTop);
 const chartRows=branchRows.slice(0,6), top=chartTop+16;
 if(!chartRows.length)write(t.noData,rtl?W-M:M,top+5,{size:8,color:MUTED});
 for(let i=0;i<chartRows.length;i++){
  const b=chartRows[i],base=top+i*13;
  const max=Math.max(1,...chartRows.map(r=>r.sales));
  write(shortened(b.name,22),rtl?W-M:M,base,{size:7.4,limit:22});
  const chartX=M+61,wide=110;
  doc.setFillColor(226,232,240);doc.roundedRect(chartX,base-5,wide,4,1,1,'F');
  doc.setFillColor(...BLUE);doc.roundedRect(chartX,base-5,Math.max(0.6,wide*b.sales/max),4,1,1,'F');
  const profitLen=Math.min(wide,wide*Math.abs(b.netProfit)/max);
  doc.setFillColor(...(b.netProfit<0?RED:GREEN));
  if(profitLen>0)doc.roundedRect(chartX,base,Math.max(0.6,profitLen),2.6,.7,.7,'F');
  write(money(b.netProfit),rtl?chartX:chartX+wide+2,base+1.3,
   {size:7,color:b.netProfit<0?RED:GREEN,align:rtl?'right':'left',limit:25});
 }
 if(branchRows.length>6)write(`${t.showMore}: ${branchRows.length-6}`,rtl?W-M:M,264,{size:7,color:MUTED});
 if(report.best && report.worst){
  const lower=Math.min(267,top+chartRows.length*13+12);
  if(lower<247){
   card(M,lower,(CW-4)/2,26,t.best,shortened(report.best.name,22),{tone:'green',sub:money(report.best.netProfit)});
   card(M+CW/2+2,lower,(CW-4)/2,26,t.worst,shortened(report.worst.name,22),{tone:report.worst.netProfit<0?'red':'blue',sub:money(report.worst.netProfit)});
  }
 }
 if(report.branchProfitUnallocated)write(t.incomplete,rtl?W-M:M,277,{size:7,color:RED,limit:85});

 // --- Page: Inventory ---
 startPage(t.inventory,t.asOf+' '+report.asOfDate);
 const stockRows=report.stocks||[];
 const cGap=4,cW=(CW-8)/3;
 card(M,47,cW,29,t.skus,report.hasInventoryData?String(stockRows.length):'—');
 card(M+cW+4,47,cW,29,t.lowStock,report.hasInventoryData?String(report.lowStock.length):'—',
  {tone:report.lowStock.length?'red':'green'});
 card(M+2*(cW+4),47,cW,29,t.outStock,report.hasInventoryData?String(report.noStock):'—',
  {tone:report.noStock?'red':'green'});
 section(t.stockTitle,83);
 doc.setFillColor(241,245,249);doc.rect(M,96,CW,10,'F');
 const stockWidths=[82,32,32,38],columns=[t.stock,t.onHand,t.minimum,t.status];
 let x=M;
 columns.forEach((label,i)=>{write(label,x+stockWidths[i]/2,102,{size:7.5,bold:true,align:'center',limit:18});x+=stockWidths[i];});
 const displayStock=stockRows.slice(0,8);
 if(!stockRows.length)write(t.noData,rtl?W-M:M,117,{size:9,color:MUTED});
 displayStock.forEach((row,i)=>{
  const top=108+i*10;
  if(i%2===0){doc.setFillColor(249,251,255);doc.rect(M,top-1,CW,10,'F');}
  const status=row.quantity===null?t.noData:row.quantity<=0?t.out:row.low?t.low:t.ok;
  let cur=M;
  [shortened(row.name,32),row.quantity===null?'—':`${fmtNumber(row.quantity)} ${row.unit}`,
   row.threshold===null?'—':fmtNumber(row.threshold),status].forEach((value,j)=>{
   write(value,cur+stockWidths[j]/2,top+6,{size:7.3,align:'center',color:j===3&&row.low?RED:NAVY,
    width:stockWidths[j]-2,limit:j===0?32:18});
   cur+=stockWidths[j];
  });
 });
 if(stockRows.length>8)write(`${t.showMore}: ${stockRows.length-8}`,rtl?W-M:M,199,{size:7,color:MUTED});
 section(t.consumption,207);
 const consumed=(report.consumption||[]).slice(0,6);
 if(!consumed.length)write(t.noConsumption,rtl?W-M:M,228,{size:8,color:MUTED,limit:65});
 consumed.forEach((row,i)=>{
  const yy=225+i*8;
  write(shortened(row.name,32),rtl?W-M:M,yy,{size:7.4,limit:31});
  write(`${fmtNumber(row.quantity)} ${row.unit}`,rtl?M+CW-5:M+107,yy,{size:7.5,color:BLUE,align:rtl?'right':'left'});
  if(row.costAvailable)write(money(row.estimatedCost),rtl?M+48:W-M,yy,
    {size:7.2,color:MUTED,align:rtl?'left':'right'});
 });
 if(report.wasteQuantity)write(`${t.waste}: ${fmtNumber(report.wasteQuantity)} · ${money(report.wasteCost)}`,
   rtl?W-M:M,281,{size:8,color:RED,limit:55});

 // --- Page: Expenses / debt / risks ---
 startPage(t.operations,t.subtitle);
 section(t.costs,47);
 write(t.variableHint,rtl?W-M:M,67,{size:7.5,color:MUTED,limit:76});
 const costs=report.costGroups||[],biggest=Math.max(1,...costs.map(c=>c.value));
 if(!costs.length)write(t.noData,rtl?W-M:M,89,{color:MUTED,size:9});
 costs.slice(0,8).forEach((row,i)=>{
  const yy=79+i*14;
  write(shortened(row.name,27),rtl?W-M:M,yy,{size:8,limit:30});
  write(money(row.value),rtl?M+43:W-M,yy,{size:8,align:rtl?'left':'right',color:BLUE});
  const len=Math.max(.6,120*row.value/biggest);
  doc.setFillColor(229,236,246);doc.roundedRect(M+38,yy+2,120,3,1,1,'F');
  doc.setFillColor(...BLUE);doc.roundedRect(M+38,yy+2,len,3,1,1,'F');
 });
 if(costs.length>8)write(`${t.showMore}: ${costs.length-8}`,rtl?W-M:M,194,{size:7,color:MUTED});
 section(t.balanceHint,202);
 card(M,218,(CW-4)/2,31,t.customerDebt,
  report.debts.unknown>0?money(report.debts.receivables)+'*':money(report.debts.receivables),
  {tone:'green',sub:t.asOf+' '+report.asOfDate});
 card(M+CW/2+2,218,(CW-4)/2,31,t.supplierDebt,
  report.debts.unknown>0?money(report.debts.payables)+'*':money(report.debts.payables),
  {tone:'red',sub:t.asOf+' '+report.asOfDate});
 section(t.risks,255);
 const risks=[];
 if(report.worst?.netProfit<0)risks.push(t.loss+': '+report.worst.name);
 if(report.lowStock.length)risks.push(t.stockRisk+': '+report.lowStock.length);
 if(report.noStock)risks.push(t.outRisk+': '+report.noStock);
 if(report.debts.unknown)risks.push(t.unknown+': '+report.debts.unknown);
 if(!risks.length)risks.push(t.noRisks);
 // The narrative continues on a dedicated follow-up page if it cannot fit.
 if(risks.length>1){
  write(shortened(risks[0],75),rtl?W-M:M,273,{size:8,color:RED});
  startPage(t.risks,t.subtitle);
  risks.forEach((risk,i)=>{
   doc.setFillColor(249,251,255);doc.roundedRect(M,49+i*19,CW,15,2,2,'F');
   write(risk,rtl?W-M-4:M+4,58+i*19,{size:9,color:i?NAVY:RED,limit:90});
  });
  write(t.sampleNote,rtl?W-M:M,194,{size:8,color:MUTED,limit:110});
  write(t.source,rtl?W-M:M,203,{size:7,color:MUTED,limit:110});
 }else{
  write(shortened(risks[0],73),rtl?W-M:M,273,{size:8,color:RED});
 }
}
