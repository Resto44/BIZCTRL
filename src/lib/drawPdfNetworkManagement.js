import {drawLocalizedPdfText} from './pdfLocalization';
import {drawERPReportBrand} from './erpPdfBrand';

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
  },
};
const fmt = n => n===null||!Number.isFinite(Number(n))?'—':
  Number(n).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2});
const pct = value => value==null?'—':(value>0?'+':'')+fmt(value)+'%';
const clamp = (value,min,max)=>Math.min(max,Math.max(min,value));

/** An additive read-only appendix; the existing two-page financial report is not modified. */
export function drawPdfNetworkManagement(doc,{
  insights,range,currency='SAR',lang='en',businessName='BizCTRL',
  branchLabel='All branches',iconData=null,
}={}){
  if(!insights?.available)return 0;
  const t=copy[lang]||copy.en;
  const rtl=lang==='fa'||lang==='ar';
  const branches=insights.branches||[];
  const chunkSize=9;
  const pageCount=Math.max(1,Math.ceil(branches.length/chunkSize));
  const numberPages=2+pageCount;
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
    panel(title,7,y-21,196,Math.min(103,35+8.1*rows.length));
    const cols=[
      [t.branchName,10,64,'left'],
      [t.current,76,32,'right'],
      [t.previousShort,111,29,'right'],
      [t.growth,142,27,'right'],
      [t.share,174,24,'right'],
    ];
    doc.setFillColor(...COLORS.bg);doc.rect(10,y-11,190,9,'F');
    cols.forEach(([label,x,w,align])=>T(label,x,y-5,w,7.6,COLORS.muted,true,align));
    if(!rows.length)T(t.noRecords,12,y+7,182,9,COLORS.muted);
    rows.forEach((b,i)=>{
      const yy=y+4+i*8.1;
      if(i%2===1){doc.setFillColor(249,251,255);doc.rect(10,yy-5.8,190,8.1,'F');}
      T(b.name==='Unattributed branch'?t.unknown:b.name,11,yy,63,8.3,COLORS.ink,true);
      T(fmt(b.current.network),76,yy,32,8.2,COLORS.blue,true,'right');
      T(fmt(b.previous.network),111,yy,29,8.1,COLORS.muted,false,'right');
      T(pct(b.growth),142,yy,27,8.0,b.growth<0?COLORS.amber:COLORS.green,false,'right');
      T(pct(b.share),174,yy,24,8.0,COLORS.ink,false,'right');
    });
  }
  for(let page=0;page<pageCount;page++){
    doc.addPage();
    const first=page===0;
    const rows=branches.slice(page*chunkSize,(page+1)*chunkSize);
    if(first){
      tiles.forEach(([label,value,color,isAmount],i)=>{
        const x=7+i*49.7;
        doc.setFillColor(247,250,255);doc.setDrawColor(...COLORS.line);
        doc.roundedRect(x,29,47.5,25,2.6,2.6,'FD');
        T(label,x+3,35,41.4,8,COLORS.muted,true);
        T(isAmount?fmt(value):pct(value),x+3,45,41.4,16,color,true);
        if(isAmount)T(currency,x+3,51,41.4,7,COLORS.muted);
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
      plot(previous,[153,181,220]);plot(current,COLORS.blue);
      T(t.current,14,109,42,7,COLORS.blue,true);
      T(t.previous,70,109,47,7,COLORS.muted);
      // Weekday pattern is not an amount added to network revenue.
      panel(t.weekday,134,58,69,56);
      const weekdays=insights.weekdays||[];
      const highest=Math.max(1,...weekdays.map(x=>x.value));
      weekdays.forEach((item,i)=>{
        const x=139+i*8.7,w=5.1,h=28*clamp(item.value/highest,0,1);
        doc.setFillColor(...COLORS.cyan);doc.roundedRect(x,101-h,w,h,.75,.75,'F');
        T(item.day.slice(0,2),x-2,107,w+4,6.7,COLORS.muted,false,'center');
      });
      T(fmt(highest),140,77,56,8,COLORS.muted);
      // Branch network contribution: positive and negative values displayed without hiding adjustments.
      panel(t.branchTrend,7,118,196,24);
      const positive=Math.max(1,...branches.map(x=>Math.abs(x.current.network)));
      const swatches=[[COLORS.blue,0],[COLORS.cyan,1],[COLORS.purple,2],[COLORS.green,3],[COLORS.amber,4]];
      branches.slice(0,5).forEach((b,i)=>{
        const x=11+i*37.5,w=33,h=6;
        doc.setFillColor(237,242,250);doc.roundedRect(x,128,w,h,1,1,'F');
        doc.setFillColor(...swatches[i][0]);
        doc.roundedRect(x,128,Math.max(0.3,clamp(Math.abs(b.current.network)/positive,0,1)*w),h,1,1,'F');
        T(b.name==='Unattributed branch'?t.unknown:b.name,x,139,w,6.9,COLORS.ink);
      });
      drawTable(rows,158);
      panel(t.allocation,7,236,94,36);
      T(t.allocation,10,243,88,8,COLORS.muted,true);
      T(fmt(insights.allocation)+' '+currency,10,253,88,11.8,COLORS.blue,true);
      T(t.gap,10,261,88,7.5,COLORS.muted);
      T(fmt(insights.allocationGap)+' '+currency,10,268,88,10,COLORS.amber,true);
      panel(t.note,106,236,97,36);
      T(t.note,109,249,91,7.3,COLORS.muted);
      T(t.receipt,109,259,91,7.2,COLORS.muted);
      if(insights.sourceMismatch!=null && Math.abs(insights.sourceMismatch)>.01)
        T(t.mismatch+': '+fmt(insights.sourceMismatch),109,267,91,7,COLORS.amber,true);
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