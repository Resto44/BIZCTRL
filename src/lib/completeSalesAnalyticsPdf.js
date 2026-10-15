import {drawLocalizedPdfText} from './pdfLocalization';
import {drawERPReportBrand} from './erpPdfBrand';
import {buildFullSalesAnalyticsReport} from './fullSalesAnalyticsReport';

/** Fixed two-page executive coverage of every Sales Analytics section. */
export function drawCompleteSalesAnalyticsPdf(doc,{snapshot:s,previousSnapshot:previous=null,growth=null,
 report:r=null,range,branchLabel,businessName,currency='SAR',lang='en',iconData,fullAnalytics=null}={}){
 if(!s||!range?.from||!range?.to)throw new Error('Verified report data and dates required');
 const a=fullAnalytics||buildFullSalesAnalyticsReport({snapshot:s,previousSnapshot:previous,operationsReport:r,range,lang});
 const rtl=lang==='fa'||lang==='ar';
 const tr=(en,fa,ar)=>lang==='fa'?fa:lang==='ar'?ar:en;
 const C={ink:[17,34,63],muted:[91,108,133],line:[220,230,244],bg:[247,250,255],blue:[34,98,232],green:[0,151,130],purple:[118,75,218],orange:[220,129,35],red:[203,66,75]};
 const num=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
 const money=v=>v==null?'—':num(v)+' '+currency;
 const pct=v=>v==null?'—':num(v)+'%';
 const text=(v,x,y,w,size=8,color=C.ink,align=rtl?'right':'left')=>drawLocalizedPdfText(doc,String(v??'—'),align==='right'?x+w:x,y,{rtl,bold:true,size,color,align,fit:true,maxWidth:w});
 const panel=(title,x,y,w,h)=>{doc.setFillColor(...C.bg);doc.setDrawColor(...C.line);doc.setLineWidth(.2);doc.roundedRect(x,y,w,h,2.5,2.5,'FD');text(title,x+3,y+6,w-6,9,C.ink);};
 const empty=(x,y,w)=>text(tr('No recorded data','اطلاعات ثبت نشده','لا بيانات مسجلة'),x,y,w,8,C.muted);
 const row=(label,value,x,y,w,color=C.blue)=>{text(label,x,y,w*.56,7.7,C.muted);text(value,x+w*.59,y,w*.41,8,color);};
 const compact=(rows,limit,key='value')=>rows.length<=limit?rows:[...rows.slice(0,limit-1),{name:tr('Other / combined','سایر موارد / مجموع','أخرى / مجمعة'),[key]:rows.slice(limit-1).reduce((n,r)=>n+(Number(r[key])||0),0)}];
 const note=(value,y)=>text(value,8,y,194,6.7,C.muted);
 const band=(title,page)=>{panel('',7,27,196,15);text(title,11,34,172,11,C.ink);text(range.from+' / '+range.to,11,39,158,7,C.muted,'left');text('0'+page,189,36,9,10,C.blue,'right');};
 const kpis=items=>items.forEach(([label,value,color=C.blue],i)=>{const x=7+(rtl?5-i:i)*33;panel(label,x,46,31,20);text(value,x+2,61,27,9.4,color);});
 // Aggregate contiguous buckets without dropping values. Monetary axes include zero and corrections.
 const points=(rows,key,limit=31)=>{const n=Math.max(1,Math.ceil(rows.length/limit)),out=[];for(let i=0;i<rows.length;i+=n)out.push(rows.slice(i,i+n).reduce((v,r)=>v+(Number(r[key])||0),0));return out;};
 const chart=(title,x,y,w,h,series,from=range.from,to=range.to)=>{
  panel(title,x,y,w,h);
  series.forEach((s,i)=>{const xx=x+3+i*(w-6)/series.length;doc.setFillColor(...s.color);doc.circle(xx+1,y+10,0.7,'F');text(s.name,xx+3,y+11,(w-6)/series.length-4,6.7,C.muted,'left');});
  const all=series.flatMap(s=>s.values),min=Math.min(0,...all),max=Math.max(1,...all),span=max-min;
  const left=x+17,right=x+w-4,top=y+15,bottom=y+h-7;
  for(let i=0;i<=2;i++){const yy=bottom-(bottom-top)*i/2;doc.setDrawColor(...C.line);doc.setLineWidth(.15);doc.line(left,yy,right,yy);text(num(min+span*i/2),x+1,yy+.5,14,5.6,C.muted,'right');}
  for(const s of series){const py=v=>bottom-(bottom-top)*(v-min)/span,px=i=>left+(s.values.length===1?.5:i/(s.values.length-1))*(right-left);doc.setDrawColor(...s.color);doc.setFillColor(...s.color);doc.setLineWidth(.5);s.values.forEach((v,i)=>{if(i)doc.line(px(i-1),py(s.values[i-1]),px(i),py(v));doc.circle(px(i),py(v),.35,'F');});}
  if(!all.length)empty(x+19,y+h/2+3,w-24);
  text(from,x+3,y+h-2,w/2-3,6,C.muted,'left');text(to,x+w/2,y+h-2,w/2-3,6,C.muted,'right');
 };
 const table=(title,x,y,w,h,headers,rows,widths,limit=5)=>{
  panel(title,x,y,w,h);let xx=x+3;
  headers.forEach((v,i)=>{text(v,xx,y+12,(w-6)*widths[i]-2,6.8,C.muted);xx+=(w-6)*widths[i];});
  if(!rows.length)empty(x+3,y+23,w-6);
  rows.slice(0,limit).forEach((values,index)=>{let xx=x+3;const yy=y+19+index*6.3;values.forEach((v,i)=>{text(i===0&&String(v).length>42?String(v).slice(0,40)+'…':v,xx,yy,(w-6)*widths[i]-3,7.1,i?C.blue:C.ink);xx+=(w-6)*widths[i];});});
  if(rows.length>limit)text(tr('Shown / total: ','نمایش / مجموع: ','المعروض / الإجمالي: ')+limit+' / '+rows.length,x+3,y+h-2,w-6,6,C.muted);
 };
 const daily=s.breakdown||[],prior=previous?.breakdown||[];
 const current=tr('Current','فعلی','الحالي'),before=tr('Previous','قبلی','السابق');
 const channelNames={cash:tr('Cash','نقد','نقد'),network:tr('Network','شبکه','الشبكة'),credit:tr('Credit','نسیه','آجل'),other:tr('Other','سایر','أخرى')};
 const channelColors={cash:C.green,network:C.blue,credit:C.purple,other:C.orange};
 const unit=u=>({kg:tr('kg','کیلوگرام','كجم'),carton:tr('carton','کارتن','كرتون'),bag:tr('bag','کیسه','كيس'),unit:tr('unit','عدد','وحدة'),litre:tr('litre','لیتر','لتر')})[u]||u||'';
 const qty=p=>num(p.quantity)+' '+unit(p.unit);
 const showCost=v=>v==null?'—':money(v);

 band(tr('Sales Analytics · Complete overview','تحلیل فروشات · گزارش جامع','تحليل المبيعات · نظرة شاملة'),1);
 kpis([[tr('Sales','فروشات','المبيعات'),money(s.sales)],[channelNames.cash,money(s.cash),C.green],[channelNames.network,money(s.network)],[channelNames.credit,money(s.credit),C.purple],[tr('Daily average','اوسط روزانه','المتوسط اليومي'),money(s.averageDailySales)],[tr('Growth','رشد','النمو'),pct(growth),growth<0?C.red:C.green]]);
 chart(tr('Period sales trend','روند فروشات دوره','اتجاه مبيعات الفترة'),7,70,120,48,[{name:current,color:C.blue,values:points(daily,'sales')},...(previous?[{name:before,color:C.green,values:points(prior,'sales')}]:[])]);
 panel(tr('Payment mix','ترکیب پرداخت‌ها','توزيع المدفوعات'),131,70,72,48);
 a.payment.channels.forEach((c,i)=>row(channelNames[c.key],money(c.value)+' / '+pct(c.pct),134,85+i*7,66,channelColors[c.key]));
 chart(tr('Monthly sales / year comparison','فروش ماهانه / مقایسه سالانه','المبيعات الشهرية / مقارنة السنوات'),7,122,95.5,44,[
  {name:String(a.history.year),color:C.blue,values:a.history.available?a.history.rows.map(r=>r.current):[]},
  {name:String(a.history.previousYear),color:C.green,values:a.history.available?a.history.rows.map(r=>r.previous):[]},
 ],String(a.history.year)+'-01',range.to.slice(0,7));
 chart(tr('Payment channel trends','روند روش‌های پرداخت','اتجاهات قنوات الدفع'),107.5,122,95.5,44,Object.keys(channelNames).map(k=>({name:channelNames[k],color:channelColors[k],values:points(daily,k)})));
 const sources=compact(a.payment.sources,4);
 if(a.payment.sources.length>4)sources.at(-1).previous=a.payment.sources.slice(3).reduce((n,p)=>n+p.previous,0);
 table(tr('Sales sources (already included)','منابع فروش (شامل مجموع)','مصادر المبيعات (ضمن الإجمالي)'),7,170,95.5,43,
  [tr('Source','منبع','المصدر'),current,before],sources.map(p=>[p.name,money(p.value),p.previous==null?'—':money(p.previous)]),[.44,.28,.28],4);
 panel(tr('Network receipts / reconciliation','دریافت شبکه / تطبیق','تحصيل الشبكة / المطابقة'),107.5,170,95.5,43);
 row(tr('Period network sales','فروش شبکه دوره','مبيعات الشبكة'),money(s.network),111,183,88);
 row(tr('Recorded network receipts','دریافت ثبت‌شدهٔ شبکه','تحصيل الشبكة المسجل'),a.network.available?money(a.network.received):'—',111,190,88,C.green);
 row(tr('Sales minus receipts','فروش منهای دریافت','المبيعات ناقص التحصيل'),a.network.available?money(a.network.difference):'—',111,197,88,C.orange);
 text(tr('Period flow difference; not a verified bank balance.','تفاوت جریان دوره؛ ماندهٔ تأییدشدهٔ بانک نیست.','فرق تدفقات الفترة؛ ليس رصيد بنك مؤكداً.'),111,208,88,6.3,C.muted);
 panel(tr('Branch performance & sales signals','عملکرد شعبه‌ها و شاخص‌های فروش','أداء الفروع ومؤشرات المبيعات'),7,217,196,55);
 const perf=a.performance;
 const dayLabel=d=>d?d.date.slice(5)+' / '+money(d.value):'—';
 const peak=perf.peakWeekday==null?'—':new Intl.DateTimeFormat(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US',{weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2026,9,11+perf.peakWeekday)));
 [[tr('Best day','بهترین روز','أفضل يوم'),dayLabel(perf.best)],[tr('Lowest posted day','کمترین روز ثبت‌شده','أقل يوم مسجل'),dayLabel(perf.worst)],[tr('Peak weekday / closings','روز اوج / بستن‌ها','يوم الذروة / الإقفالات'),peak+' / '+num(s.finalizedClosings)]].forEach(([label,value],i)=>{text(label,11+i*64,230,59,6.7,C.muted);text(value,11+i*64,236,59,7.4,C.blue);});
 const branches=[...(r?.branches||[])];
 if(branches.length>3){const rest=branches.splice(2);branches.push({name:tr('Other branches','سایر شعبه‌ها','الفروع الأخرى'),...Object.fromEntries(['sales','purchases','expenses','netProfit'].map(k=>[k,rest.reduce((n,b)=>n+(Number(b[k])||0),0)]))});}
 const heads=[tr('Branch','شعبه','الفرع'),tr('Sales','فروش','المبيعات'),tr('Purchases','خرید','المشتريات'),tr('Expenses','مصارف','المصروفات'),tr('Operating result*','نتیجه عملیاتی*','النتيجة التشغيلية*'),tr('Margin*','حاشیه*','الهامش*')];
 const widths=[.26,.15,.15,.14,.18,.12];
 let bx=11;heads.forEach((v,i)=>{text(v,bx,243,188*widths[i]-2,6.5,C.muted);bx+=188*widths[i];});
 branches.forEach((b,j)=>{let xx=11;[b.name.length>38?b.name.slice(0,36)+'…':b.name,num(b.sales),num(b.purchases),num(b.expenses),num(b.netProfit),pct(b.sales>0?100*b.netProfit/b.sales:null)].forEach((v,i)=>{text(v,xx,250+j*6.3,188*widths[i]-2,7.3,i?C.blue:C.ink);xx+=188*widths[i];});});
 note(tr('All amounts: ','تمام مبالغ: ','جميع المبالغ: ')+currency+tr(' · Sources are non-additive. Calendar comparison ends on the shown date.',' · منابع دوباره جمع نمی‌شوند. مقایسهٔ تقویمی تا تاریخ نمایش‌داده‌شده است.',' · المصادر لا تُجمع مجدداً. المقارنة التقويمية حتى التاريخ المعروض.'),278);
 drawERPReportBrand(doc,{lang,title:tr('Complete Sales Analytics','گزارش جامع فروشات','تحليل المبيعات الشامل'),business:businessName,branch:branchLabel,period:range.from+' / '+range.to,iconData,pageLabel:'1 / 2'});
 doc.addPage();
 band(tr('Costs · Profit · Products · Actions','مصارف · نتیجه مالی · کالا · اقدامات','التكاليف · النتائج · الأصناف · الإجراءات'),2);
 kpis([[tr('Purchases','خریداری','المشتريات'),money(s.purchases)],[tr('Fixed','مصارف ثابت','الثابتة'),money(s.fixedDeduction),C.purple],[tr('Variable','مصارف متغیر','المتغيرة'),money(s.variableExpenses),C.orange],[tr('Sales − purchases','فروش − خرید','المبيعات − المشتريات'),money(s.grossProfit),C.green],[tr('Operating result*','نتیجه عملیاتی*','النتيجة التشغيلية*'),money(s.netProfit),s.netProfit<0?C.red:C.green],[tr('Operating margin*','حاشیه عملیاتی*','الهامش التشغيلي*'),pct(s.netMargin)]]);
 chart(tr('Purchases trend','روند خریداری','اتجاه المشتريات'),7,70,95.5,46,[{name:current,color:C.blue,values:points(daily,'purchases')},...(previous?[{name:before,color:C.green,values:points(prior,'purchases')}]:[])]);
 chart(tr('Fixed / variable expense trends','روند مصارف ثابت / متغیر','اتجاه الثابتة / المتغيرة'),107.5,70,95.5,46,[{name:tr('Fixed','ثابت','ثابتة'),color:C.purple,values:points(daily,'fixed')},{name:tr('Variable','متغیر','متغيرة'),color:C.orange,values:points(daily,'variable')}]);
 chart(tr('Sales / operating result*','روند فروش / نتیجه عملیاتی*','المبيعات / النتيجة التشغيلية*'),7,120,95.5,42,[{name:tr('Sales','فروش','المبيعات'),color:C.blue,values:points(daily,'sales')},{name:tr('Result*','نتیجه*','النتيجة*'),color:C.green,values:points(daily,'netProfit')}]);
 panel(tr('Cost control · current / prior','کنترل هزینه · فعلی / قبلی','ضبط التكلفة · الحالي / السابق'),107.5,120,95.5,42);
 row(tr('Purchases / sales','خرید / فروش','المشتريات / المبيعات'),pct(a.cost.purchaseRatio)+' / '+pct(a.cost.prevPurchaseRatio),111,134,88);
 row(tr('Expenses / sales','مصارف / فروش','المصروفات / المبيعات'),pct(a.cost.expenseRatio)+' / '+pct(a.cost.prevExpenseRatio),111,141,88);
 row(tr('Total period expenses','مجموع مصارف دوره','إجمالي مصروفات الفترة'),money(s.totalExpenses),111,148,88,C.orange);
 text(s.hasExpenseSource===false?tr('No expense sources in period.','مصارف این دوره ثبت نشده است.','لا مصادر مصروفات في الفترة.'):
  tr('Fixed allocation follows configured daily basis.','مصارف ثابت بر اساس تنظیم روزانه تقسیم شده است.','توزيع الثابت حسب الأساس اليومي المحدد.'),111,158,88,6.4,C.muted);
 table(tr('Expense categories','دسته‌های مصارف','فئات المصروفات'),7,166,95.5,43,[tr('Category','دسته','الفئة'),tr('Amount','مبلغ','المبلغ')],compact(r?.costGroups||[],4).map(c=>[c.name,money(c.value)]),[.62,.38],4);
 const consumption=r?.consumption||[];
 table(tr('Actual inventory use / direct sales','مصرف واقعی انبار / فروش مستقیم','الاستهلاك الفعلي / البيع المباشر'),107.5,166,95.5,43,[tr('Product / unit','کالا / واحد','الصنف / الوحدة'),tr('Used','مصرف','مستهلك'),tr('Sold net','فروش خالص','صافي المباع')],consumption.map(p=>[p.name+' / '+unit(p.unit),num(p.usedQuantity??p.quantity),num(p.soldQuantity??0)]),[.60,.20,.20],3);
 table(tr('Purchased products (not consumption)','کالاهای خریداری‌شده (نه مصرف)','الأصناف المشتراة (ليست استهلاكاً)'),7,213,95.5,59,[tr('Product','کالا','الصنف'),tr('Quantity / unit','تعداد / واحد','الكمية / الوحدة'),tr('Line cost','هزینه ردیف','تكلفة البند')],a.products.map(p=>[p.name,qty(p),showCost(p.cost)]),[.44,.28,.28],5);
 panel(tr('Management actions & balances','اقدامات مدیریتی و مانده‌ها','الإجراءات الإدارية والأرصدة'),107.5,213,95.5,59);
 row(tr('Current receivables','مطالبات فعلی','المستحقات الحالية'),r?.hasDebtData?money(r.debts?.receivables):'—',111,226,88);
 row(tr('Low / out-of-stock now','کمبود / اتمام فعلی','منخفض / نافد حالياً'),r?.hasInventoryData?num(r.lowStock?.length)+' / '+num(r.noStock):'—',111,233,88,C.orange);
 row(tr('Current payables','بدهی‌های فعلی','الالتزامات الحالية'),r?.hasDebtData?money(r.debts?.payables):'—',111,240,88);
 const actions=[];
 if(a.signals.unreconciledPayments)actions.push(tr('Review payment-to-sales mismatch.','اختلاف پرداخت با فروش بررسی شود.','راجع اختلاف المدفوعات والمبيعات.'));
 if(a.signals.loss)actions.push(tr('Review negative operating result.','نتیجهٔ منفی عملیاتی بررسی شود.','راجع النتيجة التشغيلية السلبية.'));
 if(a.signals.missingExpenses)actions.push(tr('Review expense dates and fixed-cost setup.','تاریخ مصارف و تنظیم هزینهٔ ثابت بررسی شود.','راجع تواريخ المصروفات وإعداد الثابت.'));
 if(a.signals.missingConsumption)actions.push(tr('Record stock-out / link recipes for usage.','برای مصرف، خروج انبار یا دستور غذا ثبت شود.','سجّل الصرف أو اربط الوصفات للاستهلاك.'));
 if(a.signals.lowStock)actions.push(tr('Review low-stock products before ordering.','کالاهای کمبوددار قبل از سفارش بررسی شود.','راجع الأصناف المنخفضة قبل الطلب.'));
 if(!actions.length)actions.push(tr('Review source records before closing the period.','قبل از بستن دوره، اسناد اصلی بررسی شود.','راجع المستندات قبل إقفال الفترة.'));
 actions.slice(0,3).forEach((v,i)=>text('• '+v,111,248+i*5.4,88,6.8,C.muted));
 text(tr('Waste cost: ','هزینه ضایعات: ','تكلفة الهدر: ')+(r?.hasWasteData&&r?.wasteCostComplete?money(r.wasteCost):'—'),111,267,88,7,C.orange);
 note(tr('*Operating proxy = sales − purchases − expenses; not inventory-adjusted COGS or audited profit. Units stay separate.',
  '*نتیجه عملیاتی = فروش − خرید − مصارف؛ سود حسابرسی‌شده نیست. واحدهای متفاوت جمع نمی‌شوند.',
  '*مؤشر تشغيلي = المبيعات − المشتريات − المصروفات؛ ليس ربحاً مدققاً. لا تُجمع الوحدات المختلفة.'),278);
 drawERPReportBrand(doc,{lang,title:tr('Costs, products & management','مصارف، کالا و مدیریت','التكاليف والأصناف والإدارة'),business:businessName,branch:branchLabel,period:range.from+' / '+range.to,iconData,pageLabel:'2 / 2'});
 if(doc.getNumberOfPages()!==2)throw new Error('ERP management PDF must be exactly two pages');
}
