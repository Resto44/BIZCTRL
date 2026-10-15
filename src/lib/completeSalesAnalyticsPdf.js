import {drawLocalizedPdfText} from './pdfLocalization';
import {drawERPReportBrand} from './erpPdfBrand';
import {buildFullSalesAnalyticsReport} from './fullSalesAnalyticsReport';

/** Fixed two-page executive coverage of every Sales Analytics section. */
export function drawCompleteSalesAnalyticsPdf(document,{snapshot:s,previousSnapshot:previous=null,growth=null,
 report:r=null,range,branchLabel,businessName,currency='SAR',lang='en',iconData,fullAnalytics=null}={}){
 if(!s||!range?.from||!range?.to)throw new Error('Verified report data and dates required');
 const a=fullAnalytics||buildFullSalesAnalyticsReport({snapshot:s,previousSnapshot:previous,operationsReport:r,range,lang});
 // Map the detail grid into the space below the six executive cards. Keep
 // branding outside this viewport and preserve real text/font sizes.
 let detailViewport=false;
 const yMap=y=>detailViewport?100+(y-70)*.85:y;
 const doc=new Proxy(document,{get(target,key){
  const fn=target[key];if(typeof fn!=='function')return fn;
  return (...args)=>{
   if(detailViewport){
    if(key==='text')args[2]=yMap(args[2]);
    else if(['roundedRect','rect','ellipse'].includes(key)){args[1]=yMap(args[1]);args[3]*=.85;}
    else if(key==='circle')args[1]=yMap(args[1]);
    else if(key==='line'){args[1]=yMap(args[1]);args[3]=yMap(args[3]);}
    else if(key==='triangle'){args[1]=yMap(args[1]);args[3]=yMap(args[3]);args[5]=yMap(args[5]);}
   }
   return fn.apply(target,args);
  };
 }});
 const rtl=lang==='fa'||lang==='ar';
 const tr=(en,fa,ar)=>lang==='fa'?fa:lang==='ar'?ar:en;
 const C={ink:[17,34,63],muted:[91,108,133],line:[220,230,244],bg:[247,250,255],blue:[34,98,232],green:[0,151,130],purple:[118,75,218],orange:[220,129,35],red:[203,66,75]};
 const num=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
 const money=v=>v==null?'—':num(v)+' '+currency;
 const pct=v=>v==null?'—':num(v)+'%';
 const text=(v,x,y,w,size=8,color=C.ink,align=rtl?'right':'left')=>drawLocalizedPdfText(doc,String(v??'—'),align==='right'?x+w:align==='center'?x+w/2:x,y,{rtl,bold:true,size,color,align,fit:true,maxWidth:w});
 const panel=(title,x,y,w,h)=>{doc.setFillColor(255,255,255);doc.setDrawColor(...C.line);doc.setLineWidth(.2);doc.roundedRect(x,y,w,h,2.5,2.5,'FD');if(title){doc.setFillColor(...C.bg);doc.roundedRect(x+1.5,y+1.5,w-3,7,1.5,1.5,'F');text(title,x+3,y+6,w-6,9,C.ink);}};
 const empty=(x,y,w)=>text(tr('No recorded data','اطلاعات ثبت نشده','لا بيانات مسجلة'),x,y,w,8,C.muted);
 const row=(label,value,x,y,w,color=C.blue)=>{text(label,x,y,w*.56,7.7,C.muted);text(value,x+w*.59,y,w*.41,8,color);};
 const compact=(rows,limit,key='value')=>rows.length<=limit?rows:[...rows.slice(0,limit-1),{name:tr('Other / combined','سایر موارد / مجموع','أخرى / مجمعة'),[key]:rows.slice(limit-1).reduce((n,r)=>n+(Number(r[key])||0),0)}];
 const note=(value,y)=>{const active=detailViewport;detailViewport=false;text(value,8,y,194,6.7,C.muted);detailViewport=active;};
 const band=()=>{panel('',7,27,196,15);
  const fields=[[tr('Business','کسب‌وکار','المنشأة'),businessName||'BizCTRL'],[tr('Branches','شعبه‌ها','الفروع'),branchLabel||tr('All branches','تمام شعبه‌ها','جميع الفروع')],[tr('Report period','دوره گزارش','فترة التقرير'),range.from+' / '+range.to],[tr('Currency','واحد پول','العملة'),currency]];
  fields.forEach(([label,value],i)=>{const widths=[49,44,73,30],x=7+widths.slice(0,i).reduce((a,b)=>a+b,0);text(label,x+3,32,widths[i]-6,6.4,C.muted);text(value,x+3,38,widths[i]-6,7.4,C.ink);if(i){doc.setDrawColor(...C.line);doc.line(x,30,x,39);}});
 };
 const tint=(color,amount=.93)=>color.map(v=>Math.round(v+(255-v)*amount));
 const spark=(values,x,y,w,h,color)=>{
  if(!values.length)return;
  const lo=Math.min(0,...values),hi=Math.max(1,...values),py=v=>y+h-h*(v-lo)/(hi-lo);
  doc.setDrawColor(...color);doc.setLineWidth(.45);
  values.forEach((v,i)=>{if(i)doc.line(x+(i-1)*w/Math.max(1,values.length-1),py(values[i-1]),x+i*w/Math.max(1,values.length-1),py(v));});
 };
 const polygon=vertices=>{if(vertices.length<3)return;doc.path(vertices.map(([x,y],i)=>({op:i?'l':'m',c:[x,yMap(y)]})).concat([{op:'h',c:[]}])).fill();};
 const donut=(segments,total,cx,cy,radius)=>{
  if(!(total>0)||segments.some(c=>c.value<0))return false;
  let angle=-Math.PI/2;
  for(const c of segments){const end=angle+c.value/total*Math.PI*2,vertices=[[cx,cy]];
   for(let t=angle;t<end;t+=.035)vertices.push([cx+Math.cos(t)*radius,cy+Math.sin(t)*radius]);
   vertices.push([cx+Math.cos(end)*radius,cy+Math.sin(end)*radius]);doc.setFillColor(...c.color);polygon(vertices);angle=end;
  }
  doc.setFillColor(255,255,255);doc.ellipse(cx,cy,radius*.66,radius*.66,'F');return true;
 };
 const kpis=(items,keys)=>{detailViewport=false;items.forEach(([label,value,color=C.blue],i)=>{
  const x=7+(rtl?2-i%3:i%3)*66,y=46+Math.floor(i/3)*25;
  doc.setFillColor(...tint(color));doc.setDrawColor(...tint(color,.78));doc.roundedRect(x,y,64,23,2.5,2.5,'FD');
  text(label,x+3,y+5.5,58,8,C.ink);text(value,x+3,y+13,58,13,color);
  const key=keys[i];
  if(key==='growth'){text(growth==null?tr('No comparable prior sales','فروش قبلی قابل مقایسه نیست','لا مبيعات سابقة قابلة للمقارنة'):tr('Compared with prior period','مقایسه با دورهٔ قبلی','مقارنة بالفترة السابقة'),x+3,y+20,58,7,C.muted);return;}
  const vals=key==='netMargin'?daily.map(d=>d.sales>0?100*(Number(d.netProfit)||0)/d.sales:0):points(daily,({fixedDeduction:'fixed',variableExpenses:'variable',averageDailySales:'sales',netMargin:'netProfit'})[key]||key);
  const now=key==='netMargin'?s.netMargin:key==='averageDailySales'?s.averageDailySales:s[key];
  const was=previous?.[key];const change=was>0?(now-was)/was*100:null;
  spark(vals,x+3,y+16,20,4,color);
  text(change==null?tr('Period trend','روند دوره','اتجاه الفترة'):((change>0?'+':'')+pct(change)),x+26,y+20,35,6.8,change<0?C.red:C.green);
 });detailViewport=true;};
 // Aggregate contiguous buckets without dropping values. Monetary axes include zero and corrections.
 const points=(rows,key,limit=31)=>{const n=Math.max(1,Math.ceil(rows.length/limit)),out=[];for(let i=0;i<rows.length;i+=n)out.push(rows.slice(i,i+n).reduce((v,r)=>v+(Number(r[key])||0),0));return out;};
 const chart=(title,x,y,w,h,series,from=range.from,to=range.to)=>{
  panel(title,x,y,w,h);
  series.forEach((s,i)=>{const xx=x+3+i*(w-6)/series.length;doc.setFillColor(...s.color);doc.circle(xx+1,y+10,0.7,'F');text(s.name,xx+3,y+11,(w-6)/series.length-4,6.7,C.muted,'left');});
  const all=series.flatMap(s=>s.values),min=Math.min(0,...all),max=Math.max(1,...all),span=max-min;
  const left=x+17,right=x+w-4,top=y+15,bottom=y+h-7;
  for(let i=0;i<=2;i++){const yy=bottom-(bottom-top)*i/2;doc.setDrawColor(...C.line);doc.setLineWidth(.15);doc.line(left,yy,right,yy);text(num(min+span*i/2),x+1,yy+.5,14,5.6,C.muted,'right');}
  for(const s of series){const py=v=>bottom-(bottom-top)*(v-min)/span,px=i=>left+(s.values.length===1?.5:i/(s.values.length-1))*(right-left);doc.setFillColor(...tint(s.color,.87));if(s.values.length)polygon([[px(0),py(0)],...s.values.map((v,i)=>[px(i),py(v)]),[px(s.values.length-1),py(0)]]);doc.setDrawColor(...s.color);doc.setFillColor(...s.color);doc.setLineWidth(.5);s.values.forEach((v,i)=>{if(i)doc.line(px(i-1),py(s.values[i-1]),px(i),py(v));doc.circle(px(i),py(v),.35,'F');});}
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
 kpis([[tr('Sales','فروشات','المبيعات'),money(s.sales)],[channelNames.cash,money(s.cash),C.green],[channelNames.network,money(s.network)],[channelNames.credit,money(s.credit),C.orange],[tr('Daily average','اوسط روزانه','المتوسط اليومي'),money(s.averageDailySales)],[tr('Growth','رشد','النمو'),pct(growth),growth<0?C.red:C.green]],['sales','cash','network','credit','averageDailySales','growth']);
 chart(tr('Period sales trend','روند فروشات دوره','اتجاه مبيعات الفترة'),7,70,120,48,[{name:current,color:C.blue,values:points(daily,'sales')},...(previous?[{name:before,color:[151,190,240],values:points(prior,'sales')}]:[])]);
 panel(tr('Payment mix','ترکیب پرداخت‌ها','توزيع المدفوعات'),131,70,72,48);
 const mix=a.payment.channels,positiveMix=mix.every(c=>c.value>=0)&&a.payment.total>0;
 if(positiveMix){donut(mix.map(c=>({...c,color:channelColors[c.key]})),a.payment.total,148,95,11);
  text(num(a.payment.total),140,95,16,7,C.ink,'center');text(currency,140,99,16,5.5,C.muted,'center');
 }else empty(134,96,26);
 mix.forEach((c,i)=>{const yy=84+i*8;doc.setFillColor(...channelColors[c.key]);doc.circle(199,yy-1,.8,'F');text(channelNames[c.key],162,yy,34,6.6,C.muted);text(money(c.value)+' / '+pct(c.pct),161,yy+3.6,37,6.6,channelColors[c.key]);});
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
 const branches=[...(r?.branches||[])]; // Every selected branch; never collapse into “Other”.
 const metrics=[['sales',tr('Sales','فروشات','المبيعات'),C.blue],['purchases',tr('Purchases','خرید','المشتريات'),C.purple],['expenses',tr('Expenses','هزینه','المصروفات'),C.orange],['netProfit',tr('Profit / loss*','سود / زیان*','الربح / الخسارة*'),C.green]];
 metrics.forEach(([,label,color],i)=>{const x=12+i*47;doc.setFillColor(...color);doc.rect(x,226,2,2,'F');text(label,x+4,228,42,7,C.muted);});
 const active=branches.filter(b=>b.closings>0||metrics.some(([key])=>(Number(b[key])||0)!==0));
 const bestValue=active.length?Math.max(...active.map(b=>Number(b.netProfit)||0)):null;
 const winners=active.filter(b=>Number(b.netProfit)===bestValue);
 const winnerLabel=active.length===0?tr('No branch activity in this period','در این دوره فعالیت شعبه ثبت نشده','لا نشاط للفروع خلال الفترة'):
  active.length===1?tr('Only branch with recorded activity','تنها شعبه با فعالیت ثبت‌شده','الفرع الوحيد ذو نشاط مسجل'):
  r?.branchProfitUnallocated?tr('Provisional leader (unallocated costs)','پیشتاز موقت (هزینهٔ تخصیص‌نیافته)','متصدر مؤقت (تكاليف غير موزعة)'):
  bestValue<0?tr('Lowest operating loss','کمترین زیان عملیاتی','أقل خسارة تشغيلية'):
  tr('Best branch by operating result','بهترین شعبه بر اساس نتیجه عملیاتی','أفضل فرع حسب النتيجة التشغيلية');
 text(winnerLabel,11,234,86,7.2,C.muted);
 text(winners.map(b=>b.name).join(' / ')||'—',100,234,65,7.5,C.ink);
 text(money(bestValue),168,234,31,8,bestValue<0?C.red:C.green,'right');
 if(!branches.length)empty(12,252,186);
 else{
  const values=branches.flatMap(b=>metrics.map(([key])=>Number(b[key])||0));
  const min=Math.min(0,...values),max=Math.max(1,...values),left=24,right=199,top=240,bottom=260;
  const py=value=>bottom-(value-min)/(max-min)*(bottom-top),zero=py(0),group=(right-left)/branches.length,bar=group*.16;
  for(let i=0;i<=2;i++){const v=min+(max-min)*i/2,yy=py(v);doc.setDrawColor(...C.line);doc.setLineWidth(.15);doc.line(left,yy,right,yy);text(num(v),8,yy+.8,14,5.5,C.muted,'right');}
  doc.setDrawColor(...C.muted);doc.line(left,zero,right,zero);
  branches.forEach((branch,i)=>{const x=left+(rtl?branches.length-1-i:i)*group;
   const hasActivity=active.includes(branch);
   if(!hasActivity)text(tr('No recorded activity','فعالیت ثبت نشده','لا نشاط مسجل'),x,255,group-1,6.4,C.muted,'center');
   metrics.forEach(([key,,color],j)=>{const value=Number(branch[key])||0,yy=py(value),xx=x+group*.1+j*bar*1.18;
    doc.setFillColor(...color);if(value!==0)doc.rect(xx,Math.min(yy,zero),bar,Math.abs(zero-yy),'F');
    if(hasActivity)text(num(value),xx-bar*.12,value>=0?yy-1:yy+2.2,bar*1.24,5.2,color,'center');
   });
   text(branch.name,x,266,group-1,7,C.ink,'center');
  });
 }
 text(tr('*Profit shown = sales − purchases − expenses; same selected period and currency.',
  '*سود نمایش‌داده‌شده = فروش − خرید − هزینه؛ در دوره و واحد پول انتخاب‌شده.',
  '*الربح المعروض = المبيعات − المشتريات − المصروفات؛ لنفس الفترة والعملة.'),11,271,188,6,C.muted);
 const performance=a.performance;
 const day=d=>d?d.date+' / '+money(d.value):'—';
 note(tr('Best day: ','بهترین روز: ','أفضل يوم: ')+day(performance.best)+' · '+tr('Lowest posted day: ','کمترین روز ثبت‌شده: ','أقل يوم مسجل: ')+day(performance.worst)+' · '+tr('Closings: ','بستن‌ها: ','الإقفالات: ')+num(s.finalizedClosings),275);
 note(tr('All amounts: ','تمام مبالغ: ','جميع المبالغ: ')+currency+tr(' · Sources are non-additive. Calendar comparison ends on the shown date.',' · منابع دوباره جمع نمی‌شوند. مقایسهٔ تقویمی تا تاریخ نمایش‌داده‌شده است.',' · المصادر لا تُجمع مجدداً. المقارنة التقويمية حتى التاريخ المعروض.'),278);
 detailViewport=false;
 drawERPReportBrand(document,{lang,title:tr('Complete Sales Analytics','گزارش جامع فروشات','تحليل المبيعات الشامل'),business:businessName,branch:branchLabel,period:range.from+' / '+range.to,iconData,pageLabel:'1 / 2'});
 doc.addPage();
 band(tr('Costs · Profit · Products · Actions','مصارف · نتیجه مالی · کالا · اقدامات','التكاليف · النتائج · الأصناف · الإجراءات'),2);
 kpis([[tr('Purchases','خریداری','المشتريات'),money(s.purchases)],[tr('Fixed','مصارف ثابت','الثابتة'),money(s.fixedDeduction),C.purple],[tr('Variable','مصارف متغیر','المتغيرة'),money(s.variableExpenses),C.orange],[tr('Sales − purchases','فروش − خرید','المبيعات − المشتريات'),money(s.grossProfit),C.green],[tr('Operating result*','نتیجه عملیاتی*','النتيجة التشغيلية*'),money(s.netProfit),s.netProfit<0?C.red:C.green],[tr('Operating margin*','حاشیه عملیاتی*','الهامش التشغيلي*'),pct(s.netMargin),s.netMargin<0?C.red:C.blue]],['purchases','fixedDeduction','variableExpenses','grossProfit','netProfit','netMargin']);
 chart(tr('Purchases trend','روند خریداری','اتجاه المشتريات'),7,70,95.5,46,[{name:current,color:C.blue,values:points(daily,'purchases')},...(previous?[{name:before,color:[151,190,240],values:points(prior,'purchases')}]:[])]);
 chart(tr('Fixed / variable expense trends','روند مصارف ثابت / متغیر','اتجاه الثابتة / المتغيرة'),107.5,70,95.5,46,[{name:tr('Fixed','ثابت','ثابتة'),color:C.purple,values:points(daily,'fixed')},{name:tr('Variable','متغیر','متغيرة'),color:C.orange,values:points(daily,'variable')}]);
 chart(tr('Sales / operating result*','روند فروش / نتیجه عملیاتی*','المبيعات / النتيجة التشغيلية*'),7,120,95.5,42,[{name:tr('Sales','فروش','المبيعات'),color:C.blue,values:points(daily,'sales')},{name:tr('Result*','نتیجه*','النتيجة*'),color:C.green,values:points(daily,'netProfit')}]);
 panel(tr('Cost control · current / prior','کنترل هزینه · فعلی / قبلی','ضبط التكلفة · الحالي / السابق'),107.5,120,95.5,42);
 row(tr('Purchases / sales','خرید / فروش','المشتريات / المبيعات'),pct(a.cost.purchaseRatio)+' / '+pct(a.cost.prevPurchaseRatio),111,134,88);
 row(tr('Expenses / sales','مصارف / فروش','المصروفات / المبيعات'),pct(a.cost.expenseRatio)+' / '+pct(a.cost.prevExpenseRatio),111,141,88);
 row(tr('Total period expenses','مجموع مصارف دوره','إجمالي مصروفات الفترة'),money(s.totalExpenses),111,148,88,C.orange);
 text(s.hasExpenseSource===false?tr('No expense sources in period.','مصارف این دوره ثبت نشده است.','لا مصادر مصروفات في الفترة.'):
  tr('Classification follows category settings, not names.','نوع هزینه تابع تنظیم دسته است، نه نام آن.','التصنيف حسب إعداد الفئة وليس اسمها.'),111,158,88,6.4,C.muted);
 panel(tr('Expense categories','دسته‌های مصارف','فئات المصروفات'),7,166,95.5,43);
 const categories=compact(r?.costGroups||[],4),categoryColors=[C.green,C.blue,C.purple,C.orange];
 if(!categories.length)empty(11,187,87);
 if(categories.length){const total=categories.reduce((sum,c)=>sum+c.value,0);donut(categories.map((c,i)=>({...c,color:categoryColors[i]})),total,24,190,12);text(num(total),15,190,18,7,C.ink,'center');text(currency,15,194,18,5.5,C.muted,'center');}
 categories.forEach((c,i)=>{const yy=180+i*7;doc.setFillColor(...categoryColors[i]);doc.circle(98,yy-1,.7,'F');text(c.name,40,yy,55,7,C.muted);text(money(c.value),40,yy+3.3,55,7,categoryColors[i]);});
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
 detailViewport=false;
 drawERPReportBrand(document,{lang,title:tr('Costs, products & management','مصارف، کالا و مدیریت','التكاليف والأصناف والإدارة'),business:businessName,branch:branchLabel,period:range.from+' / '+range.to,iconData,pageLabel:'2 / 2'});
 if(doc.getNumberOfPages()!==2)throw new Error('ERP management PDF must be exactly two pages');
}
