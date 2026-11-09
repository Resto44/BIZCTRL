import {drawLocalizedPdfText} from './pdfLocalization';

const C={
  ink:[15,32,60],muted:[92,110,136],line:[220,231,246],
  blue:[34,98,232],cyan:[10,169,188],green:[0,150,127],
  orange:[206,121,27],purple:[109,81,202],bg:[247,250,255],
};
const copy={
 en:{title:'Driver Sales · Trends & Analytics',current:'Driver sales',prior:'Prior period',
  cash:'Cash',network:'POS / network',trend:'Driver sales trend',ranking:'Top drivers',
  noData:'No finalized driver collections',noPrior:'No prior driver sales',
  note:'Attribution within finalized sales; NOT extra revenue.',
  entries:'Entries',drivers:'Selling drivers',mismatch:'Review driver split / closing mismatch',
  other:'Other drivers',change:'Growth'},
 fa:{title:'فروشات راننده‌ها · ترند و تحلیل',current:'فروش راننده',prior:'دوره قبل',
  cash:'نقدی',network:'شبکه / کارت',trend:'روند فروش راننده',ranking:'راننده‌های برتر',
  noData:'فروش نهایی راننده ثبت نشده',noPrior:'فروش قبلی راننده ثبت نشده',
  note:'شامل فروشات نهایی؛ درآمد اضافه نیست.',
  entries:'رکورد',drivers:'راننده‌های فروشنده',mismatch:'اختلاف فروش راننده و کلوزینگ را بررسی کنید',
  other:'سایر راننده‌ها',change:'رشد'},
 ar:{title:'مبيعات السائقين · الاتجاهات والتحليلات',current:'مبيعات السائقين',prior:'الفترة السابقة',
  cash:'نقدي',network:'شبكة / بطاقة',trend:'اتجاه مبيعات السائقين',ranking:'أفضل السائقين',
  noData:'لا توجد مبيعات سائقين معتمدة',noPrior:'لا توجد مبيعات سابقة',
  note:'ضمن الإقفالات النهائية، وليست إيراداً إضافياً.',
  entries:'قيود',drivers:'السائقون البائعون',mismatch:'راجع اختلاف سجل السائق والإقفال',
  other:'باقي السائقين',change:'النمو'},
};
const val=value=>value==null||!Number.isFinite(Number(value))?'—':
  Number(value).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:2});
const pct=value=>value==null?'—':(value>0?'+':'')+val(value)+'%';

/** Compact section inside existing page 3. NEVER adds a page.
 * Coordinates are A4 millimetres (207..276), above brand footer at 284.
 */
export function drawPdfDriverSalesSection(doc,{insights,lang='en',currency='SAR'}={}){
 const t=copy[lang]||copy.en;
 const rtl=lang==='fa'||lang==='ar';
 const T=(value,x,y,w=40,size=8,color=C.ink,bold=false,align=rtl?'right':'left')=>
   drawLocalizedPdfText(doc,String(value??'—'),align==='right'?x+w:align==='center'?x+w/2:x,y,{
    rtl,size,color,bold,align,fit:true,maxWidth:w,
   });
 const panel=(x,y,w,h)=>{
  doc.setFillColor(255,255,255);doc.setDrawColor(...C.line);doc.setLineWidth(.2);
  doc.roundedRect(x,y,w,h,2.4,2.4,'FD');
 };
 panel(7,207,196,70);
 doc.setFillColor(...C.bg);doc.roundedRect(9,209,192,8,1.8,1.8,'F');
 T(t.title,12,215,145,10,C.ink,true);
 T(t.change+': '+pct(insights.change),165,215,33,7.4,insights.change<0?C.orange:C.green,true,'right');

 const kpis=[
  [t.current,insights.current?.sales,C.blue],
  [t.prior,insights.previous?.entries?insights.previous?.sales:null,C.purple],
  [t.cash,insights.current?.cash,C.green],
  [t.network,insights.current?.network,C.cyan],
 ];
 kpis.forEach(([label,value,color],i)=>{
  const x=10+i*48.3;
  doc.setFillColor(248,250,254);doc.setDrawColor(...C.line);
  doc.roundedRect(x,219,46.4,17.5,1.7,1.7,'FD');
  T(label,x+2,224,42,7.1,C.muted,true);
  T(value==null?'—':val(value),x+2,232,42,12.5,color,true);
  if(value!=null)T(currency,x+2,235,42,6.6,C.muted);
 });

 // A true current-vs-prior timeline; sorted calendar buckets, never added to sales.
 T(t.trend,11,243,103,8.7,C.ink,true);
 T(t.ranking,119,243,79,8.7,C.ink,true);
 const current=(insights.trend||[]).map(r=>Number(r.value)||0);
 const previous=(insights.previousTrend||[]).map(r=>Number(r.value)||0);
 const graph={x:15,y:246,w:93,h:21};
 const max=Math.max(1,...current,...previous),min=0;
 const py=v=>graph.y+graph.h-(v-min)/(max-min)*graph.h;
 [0,.5,1].forEach(x=>{
  const y=graph.y+graph.h*(1-x);
  doc.setDrawColor(...C.line);doc.line(graph.x,y,graph.x+graph.w,y);
 });
 const plot=(values,color)=>{
  if(!values.length)return;
  doc.setDrawColor(...color);doc.setLineWidth(.55);
  values.forEach((v,i)=>{
   const x=graph.x+graph.w*(values.length===1?.5:i/Math.max(1,values.length-1));
   if(i){
    const px=graph.x+graph.w*(i-1)/Math.max(1,values.length-1);
    doc.line(px,py(values[i-1]),x,py(v));
   }
   doc.setFillColor(...color);doc.circle(x,py(v),.48,'F');
  });
 };
 if(insights.previous?.entries)plot(previous,[147,171,213]);
 plot(current,C.blue);
 T(insights.previous?.entries?t.prior:t.noPrior,14,273,48,6.4,C.muted);
 T(t.current,70,273,43,6.5,C.blue,true);

 const top=insights.topDrivers||[];
 if(!top.length)T(t.noData,119,252,78,7.3,C.muted);
 top.slice(0,3).forEach((driver,i)=>{
  const y=251+i*7;
  T(String(i+1)+'. '+driver.name,119,y,49,7.2,C.ink,i===0);
  T(val(driver.sales),167,y,30,7.4,C.blue,true,'right');
 });
 const rest=top.slice(3).reduce((n,d)=>n+Number(d.sales||0),0);
 if(rest>0)T(t.other+': '+val(rest),119,272,78,7,C.muted);
 else T(t.entries+': '+String(insights.current?.entries||0)+' · '+
  t.drivers+': '+String(insights.driversWithSales||0),119,273,79,7,C.muted);
 if(insights.sourceMismatch||insights.exceedsTotal){
  T(t.mismatch,10,276,187,6.7,C.orange,true);
 } else {
  T(t.note,10,276,187,6.9,C.muted);
 }
}
