import {drawLocalizedPdfText} from './pdfLocalization';
import {drawERPReportBrand} from './erpPdfBrand';
import {drawPdfDriverSalesSection} from './drawPdfDriverSalesSection';

const COLORS={
  ink:[15,32,60], muted:[92,110,136],line:[221,232,247],
  blue:[34,98,232],cyan:[10,169,188],green:[0,150,127],
  amber:[214,133,29],purple:[109,81,202],bg:[247,250,255],
};
const copy={
  en:{
    title:'Network Management · Branch Intelligence',branch:'Branch / POS channel',
    current:'Network sales',previous:'Previous period',growth:'Period change',
    mix:'Card share of sales',trend:'Network sales trend',weekday:'Weekday pattern',
    branches:'Branch performance and comparisons',branchName:'Branch',
    share:'Share',gap:'POS allocation gap',allocation:'POS allocations (not extra revenue)',
    noRecords:'No finalized network sales for this period',
    unknown:'Unattributed branch',other:'Additional branches',
    note:'Only finalized or locked closings. Card / POS allocations are included in sales, not additional income.',
    receipt:'Bank settlements are excluded from revenue. A gap is not a verified bank balance.',
    mismatch:'Review: card totals differ from canonical report snapshot',
    none:'No prior period for comparison',growthInfo:'Change is not defined when prior-period sales are zero.',
    noAccounts:'No saved POS allocation in this period',
    continuation:'Branch detail · continued',previousShort:'Prior',
    branchTrend:'Branch-by-branch card contribution',period:'Reporting period',
    unassigned:'Unattributed',source:'Source: authenticated Sales Closing data',
    mappingTitle:'POS account attribution',mappedShort:'Matched to saved POS accounts',
    unmappedShort:'Unmapped in closing metadata',mappingMissing:'No saved POS mapping available',
    accountingNotes:'Accounting notes',noteShort:'Finalized card sales are counted only once.',
    receiptShort:'Bank transfers are not extra revenue or proof of collection.',
    noPriorShort:'No prior confirmed closings',mappingNotLoss:'Unmapped is not a cash shortage',
  },
  fa:{
    title:'مدیریت شبکه · تحلیل شعبه‌ها',branch:'شعبه / کانال POS',
    current:'فروشات شبکه',previous:'دوره قبلی',growth:'تغییر دوره',
    mix:'سهم کارت از کل فروش',trend:'روند فروشات شبکه',weekday:'الگوی روزهای هفته',
    branches:'عملکرد و مقایسه شعبه‌ها',branchName:'شعبه',
    share:'سهم',gap:'اختلاف تخصیص POS',allocation:'مبالغ تخصیص‌یافته POS (نه درآمد اضافه)',
    noRecords:'در این دوره فروشات نهایی شبکه ثبت نشده',
    unknown:'شعبه تخصیص‌نیافته',other:'شعبه‌های دیگر',
    note:'فقط کلوزینگ نهایی یا قفل‌شده؛ مبالغ POS جزو فروشات است و دوباره جمع نمی‌شود.',
    receipt:'تسویه بانک درآمد جدید نیست. اختلاف به معنی مانده تأییدشده بانک نمی‌باشد.',
    mismatch:'بررسی: مجموع شبکه با گزارش اصلی مطابقت ندارد',
    none:'دوره قبل فروش قابل مقایسه ندارد',growthInfo:'اگر فروش دوره قبل صفر باشد، فیصدی رشد مشخص نیست.',
    noAccounts:'تخصیص POS در این دوره ثبت نشده',
    continuation:'جزئیات شعبه‌ها · ادامه',previousShort:'قبلی',
    branchTrend:'سهم فروش شبکه به تفکیک شعبه',period:'دوره گزارش',
    unassigned:'تخصیص‌نیافته',source:'منبع: کلوزینگ نهایی و مجاز سازمان',
    mappingTitle:'تخصیص حساب POS',mappedShort:'مبلغ مرتبط با حساب ثبت‌شده POS',
    unmappedShort:'بدون تخصیص POS در کلوزینگ',mappingMissing:'اطلاعات تخصیص POS موجود نیست',
    accountingNotes:'یادداشت حسابداری',noteShort:'فروش نهایی کارت فقط یک بار محاسبه شده است.',
    receiptShort:'تسویه بانک درآمد جدید یا تأیید وصول وجه نیست.',
    noPriorShort:'کلوزینگ تأییدشده قبلی موجود نیست',mappingNotLoss:'این اختلاف کسری صندوق نیست',
  },
  ar:{
    title:'إدارة الشبكات · تحليلات الفروع',branch:'الفرع / قناة POS',
    current:'مبيعات الشبكة',previous:'الفترة السابقة',growth:'تغير الفترة',
    mix:'نسبة البطاقة من المبيعات',trend:'اتجاه مبيعات الشبكة',weekday:'نمط أيام الأسبوع',
    branches:'أداء الفروع والمقارنة',branchName:'الفرع',
    share:'الحصة',gap:'فرق تخصيص أجهزة POS',allocation:'تخصيص أجهزة POS (ليس إيراداً جديداً)',
    noRecords:'لا توجد مبيعات شبكة نهائية خلال الفترة',
    unknown:'فرع غير مخصص',other:'فروع إضافية',
    note:'الإقفالات النهائية أو المقفلة فقط. مبالغ POS ضمن الإيرادات ولا تُجمع مرة أخرى.',
    receipt:'التسويات البنكية ليست إيراداً جديداً. الفرق ليس رصيد بنك معتمداً.',
    mismatch:'راجع: مبيعات الشبكة لا تطابق الإجمالي المعتمد',
    none:'لا توجد فترة سابقة للمقارنة',growthInfo:'لا تُحسب نسبة النمو عندما تكون الفترة السابقة صفراً.',
    noAccounts:'لا توجد تخصيصات لأجهزة POS خلال الفترة',
    continuation:'تفاصيل الفروع · متابعة',previousShort:'السابق',
    branchTrend:'مساهمة كل فرع في مبيعات البطاقة',period:'فترة التقرير',
    unassigned:'غير مخصص',source:'المصدر: إقفالات المبيعات المصرح بها',
    mappingTitle:'تخصيص حسابات POS',mappedShort:'المربوط بحسابات POS المسجلة',
    unmappedShort:'غير مخصص لجهاز في الإقفال',mappingMissing:'بيانات تخصيص POS غير متاحة',
    accountingNotes:'ملاحظات محاسبية',noteShort:'تُحتسب مبيعات البطاقة النهائية مرة واحدة فقط.',
    receiptShort:'التسوية البنكية ليست إيراداً أو إثبات تحصيل.',
    noPriorShort:'لا إقفالات مؤكدة للفترة السابقة',mappingNotLoss:'الفرق ليس نقصاً في الصندوق',
  },
};
const advancedCopy={
  en:{
    operations:'Finalized network operations',closings:'Final closings',
    avgClose:'Avg card / closing',peakDay:'Peak card day',weekend:'Fri + Sat share',
    branchReliance:'Card reliance by branch',signals:'Card sales intelligence',
    topWeekday:'Top weekday',activeDays:'Card-active days',
    topBranch:'Largest card branch',noBranchActivity:'No branch sales mix available',
  },
  ar:{
    operations:'مؤشرات عمليات الشبكة النهائية',closings:'الإقفالات النهائية',
    avgClose:'متوسط البطاقة / إقفال',peakDay:'أعلى يوم للبطاقة',weekend:'حصة الجمعة والسبت',
    branchReliance:'اعتماد الفروع على البطاقة',signals:'مؤشرات مبيعات البطاقة',
    topWeekday:'أقوى يوم أسبوعي',activeDays:'أيام نشاط البطاقة',
    topBranch:'أعلى فرع للشبكة',noBranchActivity:'لا توجد بيانات لمزيج مبيعات الفروع',
  },
  fa:{
    operations:'شاخص‌های نهایی فروش شبکه',closings:'کلوزینگ نهایی',
    avgClose:'میانگین کارت / کلوزینگ',peakDay:'روز پرفروش شبکه',weekend:'سهم جمعه و شنبه',
    branchReliance:'وابستگی شعبه به کارت',signals:'هوش فروشات شبکه',
    topWeekday:'بهترین روز هفته',activeDays:'روزهای دارای فروش کارت',
    topBranch:'بالاترین شعبه',noBranchActivity:'معلومات سهم کارت شعبه موجود نیست',
  },
};
const fmt = n => n===null||!Number.isFinite(Number(n))?'—':
  Number(n).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2});
const pct = (value,showSign=false) => value==null?'—':(showSign&&value>0?'+':'')+fmt(value)+'%';
const clamp = (value,min,max)=>Math.min(max,Math.max(min,value));

/** An additive read-only appendix; the existing two-page financial report is not modified.
 * Keep each panel heading exactly once; missing POS metadata is not an accounting shortage.
 */
export function drawPdfNetworkManagement(doc,{
  insights,range,currency='SAR',lang='en',businessName='BizCTRL',
  branchLabel='All branches',iconData=null,driverSales=null,
}={}){
  if(!insights?.available)return 0;
  const t={...(copy[lang]||copy.en),...(advancedCopy[lang]||advancedCopy.en)};
  const rtl=lang==='fa'||lang==='ar';
  const branches=insights.branches||[];
  const ops=insights.operational||{};
  // Page 3 is shared by Network and Driver Sales. Never create a fourth page.
  // Large tenants retain totals by combining overflow rows, not dropping sales.
  const driverAvailable=driverSales?.available===true;
  const maxRows=driverAvailable?4:8;
  const visibleRows=branches.length<=maxRows?branches:[...branches.slice(0,maxRows-1),(()=>{
    const rest=branches.slice(maxRows-1);
    const current=rest.reduce((acc,b)=>({
      network:acc.network+Number(b.current?.network||0),
      total:acc.total+Number(b.current?.total||0),
      closings:acc.closings+Number(b.current?.closings||0),
    }),{network:0,total:0,closings:0});
    const previous=rest.reduce((acc,b)=>({
      network:acc.network+Number(b.previous?.network||0),
      total:acc.total+Number(b.previous?.total||0),
      closings:acc.closings+Number(b.previous?.closings||0),
    }),{network:0,total:0,closings:0});
    return {
      id:'__other_branches__',name:t.other+' ('+rest.length+')',
      current,previous,
      share:insights.total>0?current.network/insights.total*100:null,
      growth:previous.network>0?(current.network-previous.network)/previous.network*100:null,
      cardMix:current.total>0?current.network/current.total*100:null,
    };
  })()];
  const pageCount=1;
  const numberPages=3;
  const T=(v,x,y,w=40,size=8.3,color=COLORS.ink,bold=false,align=rtl?'right':'left')=>
    drawLocalizedPdfText(doc,String(v??'—'),align==='right'?x+w:align==='center'?x+w/2:x,y,{
      rtl,size,color,bold,align,fit:true,maxWidth:w,
    });
  const panel=(title,x,y,w,h)=>{
    doc.setFillColor(255,255,255);doc.setDrawColor(...COLORS.line);doc.setLineWidth(.23);
    doc.roundedRect(x,y,w,h,2.4,2.4,'FD');
    if(title)T(title,x+3,y+6,w-6,10,COLORS.ink,true);
  };
  const foot=(index,label)=>{
    drawERPReportBrand(doc,{lang,title:label,business:businessName,branch:branchLabel,
      period:range.from+' / '+range.to,iconData,pageLabel:(3+index)+' / '+numberPages});
  };
  const tiles=[
    [t.current,insights.total,COLORS.blue,true],
    [t.previous,insights.previousTotal,COLORS.purple,true],
    [t.growth,insights.change,COLORS.green,false],
    [t.mix,insights.shareOfAllSales,COLORS.cyan,false],
  ];
  function drawTable(rows,y=144,title=t.branches){
    panel('',7,y-13,196,Math.min(91,18+8.1*rows.length));
    T(title,10,y-7,190,8.6,COLORS.ink,true);
    const cols=[
      [t.branchName,10,64,'left'],
      [t.current,76,32,'right'],
      [t.previousShort,111,29,'right'],
      [t.growth,142,27,'right'],
      [t.share,174,24,'right'],
    ];
    doc.setFillColor(...COLORS.bg);doc.rect(10,y-5,190,7,'F');
    cols.forEach(([label,x,w,align])=>T(label,x,y,w,7.1,COLORS.muted,true,align));
    if(!rows.length)T(t.noRecords,12,y+10,182,9,COLORS.muted);
    rows.forEach((b,i)=>{
      const yy=y+8+i*8.1;
      if(i%2===1){doc.setFillColor(249,251,255);doc.rect(10,yy-5.8,190,8.1,'F');}
      T(b.name==='Unattributed branch'?t.unknown:b.name,11,yy,63,8.3,COLORS.ink,true);
      T(fmt(b.current.network),76,yy,32,8.2,COLORS.blue,true,'right');
      T(fmt(b.previous.network),111,yy,29,8.1,COLORS.muted,false,'right');
      T(pct(b.growth,true),142,yy,27,8.0,b.growth<0?COLORS.amber:COLORS.green,false,'right');
      T(pct(b.share),174,yy,24,8.0,COLORS.ink,false,'right');
    });
  }
  for(let page=0;page<pageCount;page++){
    doc.addPage();
    const first=page===0;
    const rows=visibleRows;
    if(first){
      tiles.forEach(([label,value,color,isAmount],i)=>{
        const x=7+i*49.7;
        doc.setFillColor(247,250,255);doc.setDrawColor(...COLORS.line);
        doc.roundedRect(x,29,47.5,25,2.6,2.6,'FD');
        T(label,x+3,35,41.4,8,COLORS.muted,true);
        const noPrior=(i===1||i===2)&&!insights.previousClosings;
        T(noPrior?'—':isAmount?fmt(value):pct(value,i===2),x+3,45,41.4,16,color,true);
        if(noPrior)T(t.noPriorShort,x+3,51,41.4,6.8,COLORS.muted);
        else if(isAmount)T(currency,x+3,51,41.4,7,COLORS.muted);
      });
      // Plot the current and comparable previous period without mixing them.
      panel(t.trend,7,58,123,56);
      const left=22,right=126,top=75,bottom=100;
      const current=(insights.trend||[]).map(p=>Number(p.value)||0);
      const previous=(insights.previousTrend||[]).map(p=>Number(p.value)||0);
      const all=[0,...current,...previous],min=Math.min(...all),max=Math.max(1,...all);
      const yFor=v=>bottom-(v-min)*(bottom-top)/(max-min);
      [0,0.5,1].forEach(frac=>{
        const y=bottom-(bottom-top)*frac;
        doc.setDrawColor(...COLORS.line);doc.line(left,y,right,y);
        T(fmt(min+(max-min)*frac),9,y+1,11,6.8,COLORS.muted,false,'right');
      });
      const plot=(values,color)=>{
        doc.setDrawColor(...color);doc.setLineWidth(.6);
        values.forEach((v,i)=>{
          const x=left+(values.length===1?.5:i/Math.max(1,values.length-1))*(right-left);
          if(i)doc.line(left+(i-1)/Math.max(1,values.length-1)*(right-left),yFor(values[i-1]),x,yFor(v));
          doc.setFillColor(...color);doc.circle(x,yFor(v),.5,'F');
        });
      };
      if(insights.previousClosings>0)plot(previous,[153,181,220]);
      plot(current,COLORS.blue);
      T(t.current,14,109,42,7,COLORS.blue,true);
      T(insights.previousClosings>0?t.previous:t.none,70,109,47,7,COLORS.muted);
      // Weekday pattern is not an amount added to network revenue.
      panel(t.weekday,134,58,69,56);
      const weekdays=insights.weekdays||[];
      const highest=Math.max(1,...weekdays.map(x=>x.value));
      weekdays.forEach((item,i)=>{
        const x=139+i*8.7,w=5.1,h=20*clamp(item.value/highest,0,1);
        doc.setFillColor(...COLORS.cyan);doc.roundedRect(x,101-h,w,h,.75,.75,'F');
        T(item.day.slice(0,2),x-2,107,w+4,6.7,COLORS.muted,false,'center');
      });
      T(fmt(highest),140,77,56,7.5,COLORS.muted); // Above the highest bar, never overprint data
      // Four diagnostics are based exclusively on finalized or locked Closing
      // records and never represent additional revenue.
      panel(t.operations,7,118,196,24);
      const operationalTiles=[
        [t.closings,String(ops.closingCount??insights.currentClosings??0),'',COLORS.blue],
        [t.avgClose,ops.averageCardPerClosing==null?'—':fmt(ops.averageCardPerClosing),currency,COLORS.green],
        [t.peakDay,ops.peakDay?fmt(ops.peakDay.value):'—',ops.peakDay?.date||'',COLORS.purple],
        [t.weekend,pct(ops.weekendShare),t.period,COLORS.cyan],
      ];
      operationalTiles.forEach(([label,value,detail,color],i)=>{
        const x=10+i*48.5;
        if(i){doc.setDrawColor(...COLORS.line);doc.line(x-2,126,x-2,139);}
        T(label,x,129,44,7.2,COLORS.muted,true);
        T(value,x,136,44,10.7,color,true);
        if(detail)T(detail,x,140.1,44,6.5,COLORS.muted);
      });
      drawTable(rows,158);
      if(driverAvailable){
        // Replace lower POS diagnostic boxes with a compact two-line audit
        // note and the Driver Sales panel; all remain on this third A4 page.
        T(t.noteShort,10,200,190,7,COLORS.muted);
        T(insights.allocationCoverage==='unavailable'?t.mappingNotLoss:t.receiptShort,10,205,190,7,COLORS.muted);
        drawPdfDriverSalesSection(doc,{insights:driverSales,lang,currency});
      }else{
      // Position both footer panels below the last branch row without covering
      // either the table or the fixed BizCTRL footer on the A4 page.
      const tableBottom=145+Math.min(91,18+8.1*rows.length);
      const notesY=Math.min(236,Math.max(205,tableBottom+7));
      panel(t.mappingTitle,7,notesY,94,36);
      if(insights.allocationCoverage==='unavailable'){
        T(t.mappingMissing,10,notesY+18,88,10,COLORS.muted,true);
        T(t.mappingNotLoss,10,notesY+28,88,8.2,COLORS.amber);
      }else if(insights.allocationCoverage==='not_applicable'){
        T(t.noRecords,10,notesY+19,88,8.6,COLORS.muted);
      }else{
        T(t.mappedShort,10,notesY+14,88,7.9,COLORS.muted);
        T(fmt(insights.allocation)+' '+currency,10,notesY+21,88,11,COLORS.blue,true);
        T(t.unmappedShort,10,notesY+27,88,7.5,COLORS.muted);
        T(fmt(insights.allocationGap)+' '+currency,10,notesY+33,88,9.4,COLORS.amber,true);
      }
      panel(t.accountingNotes,106,notesY,97,36);
      T(t.noteShort,109,notesY+15,91,8.2,COLORS.muted);
      T(t.receiptShort,109,notesY+25,91,8.2,COLORS.muted);
      if(insights.sourceMismatch!=null&&Math.abs(insights.sourceMismatch)>.01)
        T(t.mismatch+': '+fmt(insights.sourceMismatch),109,notesY+32,91,7.1,COLORS.amber,true);
      // Typical 1-5 branch businesses had a large unused lower-page area.
      // Use it for a true branch card-mix bar chart and explainable signals.
      // For 6-8 branch tables preserve legibility and footer clearance.
      const diagnosticY=notesY+38;
      if(rows.length<=5 && diagnosticY+25<=274){
        panel(t.branchReliance,7,diagnosticY,96,25);
        const activeBranches=branches.filter(b=>b.current.total>0).slice(0,3);
        if(!activeBranches.length)T(t.noBranchActivity,10,diagnosticY+16,89,7.7,COLORS.muted);
        activeBranches.forEach((branch,i)=>{
          const y=diagnosticY+11+i*6;
          T(branch.name==='Unattributed branch'?t.unknown:branch.name,10,y,37,7,COLORS.ink);
          const mix=branch.cardMix;
          doc.setFillColor(233,239,248);
          doc.roundedRect(51,y-2.9,27,2.8,.7,.7,'F');
          if(mix!=null && mix>=0 && mix<=100){
            doc.setFillColor(...[COLORS.blue,COLORS.cyan,COLORS.purple][i]);
            if(mix>0)doc.roundedRect(51,y-2.9,27*mix/100,2.8,.7,.7,'F');
          }
          T(pct(mix),80,y,19,7.2,COLORS.blue,true,'right');
        });
        panel(t.signals,106,diagnosticY,97,25);
        const peak=ops.peakWeekday;
        T(t.topWeekday+': '+(peak?peak.day+' · '+fmt(peak.value):'—'),109,diagnosticY+12,91,7.1,COLORS.ink);
        T(t.activeDays+': '+String(ops.activeCardDays??'—'),109,diagnosticY+18,91,7.1,COLORS.ink);
        const top=ops.topBranch;
        T(t.topBranch+': '+(top?top.name+' · '+pct(top.share):'—'),109,diagnosticY+24,91,7.1,COLORS.blue,true);
      }
      }
    }else{
      T(t.continuation,9,36,190,12,COLORS.ink,true);
      drawTable(rows,65,t.branches);
      T(t.note,10,245,188,8,COLORS.muted);
      T(t.receipt,10,255,188,7.8,COLORS.muted);
    }
    foot(page,first?t.title:t.continuation);
  }
  return pageCount;
}