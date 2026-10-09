import { drawLocalizedPdfText } from './pdfLocalization';

const TEXT = {
  en: {
    name:'OPERATIONS / BRANCHES / INVENTORY',title:['Operations & Branches','Inventory Intelligence'],
    subtitle:'Financial performance, stock and operational control',business:'BUSINESS',
    branch:'BRANCH',period:'REPORT PERIOD',sectionBranches:'BRANCH PERFORMANCE',
    branchName:'Branch',sales:'Sales',purchases:'Purchases',expenses:'Expenses',profit:'Net P/L',
    margin:'Margin',best:'BEST BRANCH',worst:'LOWEST RESULT',noRanking:'One branch selected',
    sectionChart:'SALES VS NET RESULT',sectionStock:'INVENTORY & CONSUMPTION',
    totalStock:'Stock records',low:'Low stock',out:'Out of stock',stockMissing:'Not recorded',
    used:'Period consumption',noUsage:'No recorded consumption',sectionExpenses:'OPERATING EXPENSES',
    sectionDebts:'OUTSTANDING BALANCES',receivables:'Receivables',payables:'Payables',
    asOf:'Current open balances',sectionRisks:'MANAGEMENT ATTENTION',
    noIssues:'No detected exceptions',loss:'Branch net loss',stockRisk:'Low stock',
    outRisk:'Stock depleted',debtRisk:'Customer receivables',unassigned:'Unallocated branch entries',
    noData:'No recorded data',more:'more',now:'As of',note:'Only verified closing and approved purchase records. Current stock and debts are separate from period flows.',
    source:'ERP financial & inventory ledger',page:'PAGE 1 / 1',unknown:'Not available',
  },
  ar: {
    name:'تقارير نظام BizCTRL',title:['الأداء التشغيلي والفروع','والمخزون'],
    subtitle:'تحليل أداء الفروع، الاستهلاك، المصروفات والذمم',business:'المنشأة',
    branch:'الفرع',period:'فترة التقرير',sectionBranches:'أداء الفروع الرئيسية',
    branchName:'الفرع',sales:'المبيعات',purchases:'المشتريات',expenses:'المصروفات',profit:'صافي الربح',
    margin:'الهامش',best:'أفضل فرع',worst:'الأقل أداءً',noRanking:'تم اختيار فرع واحد',
    sectionChart:'مقارنة المبيعات وصافي الربح',sectionStock:'المخزون والاستهلاك',
    totalStock:'أصناف المخزون',low:'مخزون منخفض',out:'نفاد المخزون',stockMissing:'غير مسجل',
    used:'الاستهلاك خلال الفترة',noUsage:'لا توجد حركات استهلاك مسجلة',sectionExpenses:'المصروفات التشغيلية',
    sectionDebts:'الذمم المدينة والدائنة',receivables:'الذمم المدينة',payables:'الذمم الدائنة',
    asOf:'الرصيد الحالي المفتوح',sectionRisks:'أهم المخاطر التشغيلية',
    noIssues:'لا توجد تنبيهات من السجلات المتاحة',loss:'خسارة صافية لفرع',stockRisk:'انخفاض المخزون',
    outRisk:'نفاد أصناف',debtRisk:'ذمم العملاء',unassigned:'قيود غير موزعة على الفروع',
    noData:'لا توجد بيانات مسجلة',more:'إضافي',now:'حالة البيانات في',note:'المبيعات المعتمدة والمشتريات الموافَق عليها فقط. أرصدة المخزون والديون حالية وليست مبيعات الفترة.',
    source:'سجلات ERP المالية والمخزون',page:'الصفحة 1 / 1',unknown:'غير متاح',
  },
  fa: {
    name:'گزارش‌های BizCTRL',title:['عملکرد عملیاتی و شعبه‌ها','و مدیریت انبار'],
    subtitle:'تحلیل عملکرد شعبه‌ها، مصرف، مصارف و طلب‌ها',business:'کسب‌وکار',
    branch:'شعبه',period:'دوره گزارش',sectionBranches:'عملکرد شعبه‌ها',
    branchName:'شعبه',sales:'فروشات',purchases:'خرید',expenses:'مصارف',profit:'فایده خالص',
    margin:'حاشیه',best:'بهترین شعبه',worst:'کمترین عملکرد',noRanking:'یک شعبه انتخاب شده',
    sectionChart:'مقایسه فروشات و فایده خالص',sectionStock:'انبار و مصرف',
    totalStock:'ردیف انبار',low:'موجودی کم',out:'تمام‌شده',stockMissing:'ثبت نشده',
    used:'مصرف این دوره',noUsage:'مصرف ثبت‌شده وجود ندارد',sectionExpenses:'مصارف عملیاتی',
    sectionDebts:'طلب‌ها و بدهی‌ها',receivables:'طلب مشتریان',payables:'بدهی پرداختنی',
    asOf:'مانده باز فعلی',sectionRisks:'هشدارهای مدیریتی',
    noIssues:'در اطلاعات موجود هشداری ثبت نیست',loss:'نقصان خالص شعبه',stockRisk:'کمبود انبار',
    outRisk:'محصولات تمام‌شده',debtRisk:'طلب مشتریان',unassigned:'رکوردهای بدون شعبه',
    noData:'اطلاعات ثبت نشده',more:'بیشتر',now:'وضعیت در',note:'فقط فروشات نهایی و خریدهای تأییدشده. موجودی و بدهی‌ها مانده فعلی‌اند، نه فروشات دوره.',
    source:'دفتر مالی و انبار ERP',page:'صفحه ۱ / ۱',unknown:'ناموجود',
  },
};

const NAVY=[16,32,63], BLUE=[33,103,239], PALE=[232,243,255], GRAY=[95,112,137],
  GREEN=[10,163,114], RED=[225,52,83], AMBER=[235,150,34], BORDER=[214,226,241];
const numeric=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(Number(n)||0);
const money=(n,c)=>numeric(n)+' '+c;
const trunc=(value,n=20)=>{
  const raw=String(value??'—').trim() || '—';
  return raw.length>n?raw.slice(0,n-1)+'…':raw;
};
const possible=n=>typeof n==='number' && Number.isFinite(n);
const colorOf=n=>Number(n)<0?RED:GREEN;

export function drawSinglePageERPReport(doc,{snapshot,report,range,branchLabel,
  businessName='BizCTRL',currency='SAR',lang='en'}={}) {
  if(!report || !snapshot || !range)throw new Error('An operations report and a date-scoped financial snapshot are required');
  const key=TEXT[lang]?lang:'en',t=TEXT[key],rtl=key!=='en';
  const W=210, M=7, CW=196;
  // Font sizing is deliberately print-focused: one reference-layout A4 page, not six pages.
  const draw=(value,x,y,{size=8,bold=false,color=NAVY,align,limit=80,maxWidth}={})=>{
    drawLocalizedPdfText(doc,trunc(value,limit),x,y,{
      rtl,size,bold,color,align:align||(rtl?'right':'left'),maxWidth,
    });
  };
  const box=(x,y,w,h,{fill=[255,255,255],border=BORDER,r=3}={})=>{
    doc.setFillColor(...fill);
    if(border)doc.setDrawColor(...border);
    doc.roundedRect(x,y,w,h,r,r,border?'FD':'F');
  };
  const label=(text,x,y,size=8,color=NAVY)=>draw(text,x,y,{size,bold:true,color});
  const title=(x,y,w,text)=>{
    box(x,y,w,11,{fill:[245,249,255],border:null,r:2});
    doc.setFillColor(...BLUE);
    doc.roundedRect(rtl?x+w-3:x,y+2,2,7,.6,.6,'F');
    draw(text,rtl?x+w-7:x+7,y+7.5,{size:9.1,bold:true,color:NAVY,limit:39});
  };
  const metric=(x,y,w,h,labelText,value,tone=BLUE,sub=null)=>{
    box(x,y,w,h,{fill:[250,252,255],border:[228,237,248],r:2.5});
    draw(labelText,rtl?x+w-3:x+3,y+5.7,{size:6.8,bold:true,color:GRAY,limit:20});
    draw(value,rtl?x+w-3:x+3,y+13.8,{size:10.4,bold:true,color:tone,limit:26});
    if(sub)draw(sub,rtl?x+w-3:x+3,y+h-3.2,{size:6.2,color:GRAY,limit:23});
  };
  const display=report.branches||[];

  // BRAND STRIP
  box(M,6,13,12,{fill:BLUE,border:null,r:2.5});
  doc.setDrawColor(255,255,255);doc.setLineWidth(.8);
  doc.line(10,12,13.5,9);doc.line(13.5,9,17,12);doc.line(10,12,13.5,15.5);doc.line(17,12,13.5,15.5);
  draw('BizCTRL',23,12.1,{size:16,bold:true,color:NAVY,align:'left'});
  draw('Restaurant ERP System',23,17,{size:7.2,color:GRAY,align:'left'});
  box(157,7.1,21,8,{fill:[240,246,255],border:null,r:2});
  draw('AR / EN / FA',167.5,12.3,{size:7,color:BLUE,align:'center'});
  box(180,7.1,23,8,{fill:[229,249,239],border:null,r:2});
  draw('ERP PDF',191.5,12.3,{size:7.5,bold:true,color:GREEN,align:'center'});

  // LIGHT BLUE HERO - accurate business and branch/date data rather than fictional decoration.
  box(M,21,CW,40,{fill:[237,246,255],border:[217,232,250],r:4});
  doc.setFillColor(218,236,255);doc.circle(139,29,15,'F');
  doc.setFillColor(205,229,254);doc.circle(138,61,17,'F');
  const tx=rtl?130:12;
  draw(t.title[0],tx,35.5,{size:13.2,bold:true,color:NAVY,limit:41,align:rtl?'right':'left'});
  draw(t.title[1],tx,46.4,{size:13,bold:true,color:BLUE,limit:40,align:rtl?'right':'left'});
  draw(t.subtitle,tx,54,{size:7.3,color:GRAY,limit:60,align:rtl?'right':'left'});
  doc.setDrawColor(198,220,246);doc.line(143,25,143,56);
  draw(t.business+':',rtl?200:148,31,{size:6.8,color:GRAY,limit:20,align:rtl?'right':'left'});
  draw(businessName,rtl?200:148,37.3,{size:8.3,bold:true,limit:27,align:rtl?'right':'left'});
  draw(t.branch+':',rtl?200:148,44,{size:6.8,color:GRAY,align:rtl?'right':'left'});
  draw(branchLabel,rtl?200:148,49.5,{size:8.1,bold:true,limit:27,align:rtl?'right':'left'});
  draw(range.from+' - '+range.to,rtl?200:148,56,{size:7.2,color:BLUE,align:rtl?'right':'left'});

  // BRANCH TABLE AND BEST/WORST PANEL
  box(M,64,CW,64);
  title(9,66,192,t.sectionBranches);
  const bx=10,tableW=144,tableTop=80;
  box(bx,tableTop,tableW,8,{fill:PALE,border:null,r:1.3});
  const cols=[35,22,25,22,25,15];
  const colTitles=[t.branchName,t.sales,t.purchases,t.expenses,t.profit,t.margin];
  let cursor=bx;
  colTitles.forEach((v,i)=>{draw(v,cursor+cols[i]/2,85.4,{size:6.5,bold:true,align:'center',limit:16});cursor+=cols[i]});
  const tableRows=display.slice(0,4);
  if(!tableRows.length)draw(t.noData,bx+3,98,{size:8,color:GRAY});
  tableRows.forEach((r,i)=>{
    const y=90+i*8.4;
    if(i%2===0)box(bx,y-1,tableW,8.3,{fill:[248,250,253],border:null,r:0.7});
    const values=[trunc(r.name,19),numeric(r.sales),numeric(r.purchases),numeric(r.expenses),
      numeric(r.netProfit),possible(r.margin)?r.margin.toFixed(1)+'%':'—'];
    let pos=bx;
    values.forEach((v,j)=>{
      draw(v,pos+cols[j]/2,y+4.9,{size:j===0?6.3:7.2,bold:j===4,color:j===4?colorOf(r.netProfit):NAVY,
        align:'center',limit:j===0?19:14});
      pos+=cols[j];
    });
  });
  if(display.length>4)draw('+'+(display.length-4)+' '+t.more,bx+4,126,{size:6.2,color:GRAY});
  const rx=157,rw=43;
  if(display.length>1){
    metric(rx,80,rw,21,t.best,trunc(report.best?.name,20),GREEN,
      report.best?money(report.best.netProfit,currency):null);
    metric(rx,104,rw,21,t.worst,trunc(report.worst?.name,20),colorOf(report.worst?.netProfit),
      report.worst?money(report.worst.netProfit,currency):null);
  }else{
    metric(rx,80,rw,45,t.noRanking,display[0]?trunc(display[0].name,20):'—',BLUE,
      display[0]?money(display[0].netProfit,currency):null);
  }

  // MIDDLE LEFT: COMPARATIVE TWO-TONE BAR CHART
  box(M,131,96,71);
  title(9,133,92,t.sectionChart);
  const bars=display.slice(0,4), max=Math.max(1,...bars.map(x=>Math.max(0,Number(x.sales)||0)));
  if(!bars.length)draw(t.noData,rtl?98:12,159,{size:7.4,color:GRAY});
  bars.forEach((b,i)=>{
    const y=154+i*11.8;
    draw(trunc(b.name,18),rtl?39:11,y,{size:6.65,limit:18,color:NAVY,align:rtl?'right':'left'});
    const barX=42,barW=42;
    doc.setFillColor(227,236,250);doc.roundedRect(barX,y-4,barW,3.4,.8,.8,'F');
    const sw=Math.max(0,barW*Math.max(0,b.sales)/max);
    if(sw>0){doc.setFillColor(...BLUE);doc.roundedRect(barX,y-4,Math.max(.5,sw),3.4,.8,.8,'F');}
    const pn=Math.max(0,barW*Math.abs(b.netProfit||0)/max);
    if(pn>0){doc.setFillColor(...colorOf(b.netProfit));doc.roundedRect(barX,y-.1,Math.max(.5,pn),2.25,.6,.6,'F');}
    draw(numeric(b.sales),99,y-1.1,{size:6.6,bold:true,color:BLUE,align:'right'});
    draw(numeric(b.netProfit),99,y+4.4,{size:6.4,color:colorOf(b.netProfit),align:'right'});
  });
  if(bars.length){
    doc.setFillColor(...BLUE);doc.circle(15,197,1.2,'F');
    draw(t.sales,18,198.5,{size:6.3,color:GRAY,align:'left'});
    doc.setFillColor(...GREEN);doc.circle(53,197,1.2,'F');
    draw(t.profit,56,198.5,{size:6.3,color:GRAY,align:'left'});
  }

  // MIDDLE RIGHT: TOP THREE STOCK ITEMS, THEN CONSUMPTION (NOT ESTIMATED).
  box(106,131,97,71);
  title(108,133,93,t.sectionStock);
  const hasStock=!!report.hasInventoryData;
  const stocks=(report.stocks||[]).slice(0,3), tileW=28.4;
  for(let i=0;i<3;i++){
    const x=110+i*30.5,row=stocks[i];
    box(x,149,tileW,25,{fill:[247,251,255],border:[226,235,249],r:2});
    draw(row?trunc(row.name,15):t.stockMissing,x+tileW/2,155,
      {size:6.7,bold:true,color:NAVY,align:'center',limit:15});
    draw(row && row.quantity!==null?numeric(row.quantity):'—',x+tileW/2,165,
      {size:12,bold:true,color:row?.low?RED:BLUE,align:'center'});
    draw(row?trunc(row.unit,10):'',x+tileW/2,170.3,
      {size:6.3,color:GRAY,align:'center',limit:10});
  }
  // Small stock-alert counters.
  draw(t.low+': '+(hasStock?String(report.lowStock?.length||0):'—'),rtl?198:111,182,
    {size:7,color:RED,limit:32,align:rtl?'right':'left'});
  draw(t.out+': '+(hasStock?String(report.noStock||0):'—'),rtl?198:159,182,
    {size:7,color:AMBER,limit:31,align:rtl?'left':'left'});
  doc.setDrawColor(...BORDER);doc.line(110,185,199,185);
  draw(t.used,rtl?199:110,190,{size:7.4,bold:true,color:BLUE,limit:32,align:rtl?'right':'left'});
  const usage=(report.consumption||[]).slice(0,2);
  if(!usage.length)draw(t.noUsage,rtl?199:110,198,{size:6.4,color:GRAY,limit:40,align:rtl?'right':'left'});
  usage.forEach((item,i)=>{
    draw(trunc(item.name,22),rtl?199:110,194.5+i*6.2,
      {size:6.55,color:NAVY,align:rtl?'right':'left'});
    draw(numeric(item.quantity)+' '+trunc(item.unit,9),rtl?111:199,194.5+i*6.2,
      {size:6.6,color:BLUE,bold:true,align:rtl?'left':'right'});
  });

  // BOTTOM: EXPENSE TYPES, CURRENT OPEN BALANCES, ACTIONABLE RISKS
  const yy=205,h=73;
  box(7,yy,63,h);
  box(73,yy,64,h);
  box(140,yy,63,h);
  title(9,207,59,t.sectionExpenses);
  title(75,207,60,t.sectionDebts);
  title(142,207,59,t.sectionRisks);

  const expenses=(report.costGroups||[]).slice(0,5),base=Math.max(1,...expenses.map(x=>x.value));
  if(!expenses.length)draw(t.noData,rtl?67:11,230,{size:7,color:GRAY});
  expenses.forEach((r,i)=>{
    const y=228+i*9.0, x=11;
    draw(trunc(r.name,18),rtl?66:x,y,{size:6.5,limit:18,color:NAVY,align:rtl?'right':'left'});
    draw(numeric(r.value),67,y,{size:6.6,color:BLUE,align:'right'});
    doc.setFillColor(232,238,249);doc.roundedRect(x,y+1.5,55,2.3,.7,.7,'F');
    const len=55*Math.max(0,r.value)/base;
    if(len>0){doc.setFillColor(...([GREEN,BLUE,AMBER,[136,91,230],RED][i]));doc.roundedRect(x,y+1.5,Math.max(.7,len),2.3,.7,.7,'F');}
  });
  const known=report.hasDebtData && report.debts?.unknown===0;
  metric(76,226,58,18,t.receivables,known?money(report.debts.receivables,currency):'—',GREEN);
  metric(76,248,58,18,t.payables,known?money(report.debts.payables,currency):'—',RED);
  draw(t.asOf,rtl?133:76,273,{size:6.4,color:GRAY,limit:24,align:rtl?'right':'left'});

  const riskItems=[];
  if(report.worst && report.worst.netProfit<0)riskItems.push(t.loss+': '+trunc(report.worst.name,12));
  if(report.noStock>0)riskItems.push(t.outRisk+': '+report.noStock);
  if((report.lowStock||[]).length>0)riskItems.push(t.stockRisk+': '+report.lowStock.length);
  if(known && report.debts.receivables>0)riskItems.push(t.debtRisk+': '+money(report.debts.receivables,currency));
  if(report.branchProfitUnallocated)riskItems.push(t.unassigned);
  if(!riskItems.length)riskItems.push(t.noIssues);
  riskItems.slice(0,4).forEach((risk,i)=>{
    const y=230+i*11.1;
    box(144,y-5,55,10,{fill:i===0&&report.worst?.netProfit<0?[255,240,242]:[246,250,255],border:null,r:1.3});
    box(146,y-3,5.5,5.5,{fill:i===0&&report.worst?.netProfit<0?RED:BLUE,border:null,r:1.3});
    draw(String(i+1),148.7,y+1.2,{size:6.7,color:[255,255,255],bold:true,align:'center'});
    draw(trunc(risk,28),rtl?196:154,y+1.2,{size:6.3,color:NAVY,limit:28,
      align:rtl?'right':'left'});
  });
  if(riskItems.length>4)draw('+'+(riskItems.length-4)+' '+t.more,rtl?198:145,276,{size:6,color:GRAY});

  // RULE + FOOTER: one page, no dangling page or unverifiable certificate.
  doc.setDrawColor(...BORDER);doc.line(M,281,203,281);
  draw('BizCTRL',M,287.4,{size:9,bold:true,color:BLUE,align:'left'});
  draw(t.source,M,292.2,{size:6.7,color:GRAY,limit:64,align:'left'});
  draw(t.note,105,286.2,{size:6.15,color:GRAY,align:'center',limit:115});
  draw(t.now+': '+String(report.asOfDate || range.to),166,292.2,{size:6.4,color:GRAY,align:'right'});
  draw(t.page,203,292.2,{size:7,bold:true,color:NAVY,align:'right'});
  // Enforce generation of exactly one page even when numerous branches/products exist.
  if(doc.getNumberOfPages()!==1)throw new Error('One-page ERP PDF layout exceeded a single A4 page');
  return doc;
}
