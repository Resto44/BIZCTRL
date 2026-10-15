import {drawLocalizedPdfText} from './pdfLocalization';
import {drawERPReportBrand} from './erpPdfBrand';

// Bounded executive summaries: all values contribute to totals and charts.
// Overflow lists are explicitly aggregated into Other, never silently omitted.
export function aggregateReportTrend(rows=[],limit=16){
 const size=Math.max(1,Math.ceil(rows.length/limit));const result=[];
 for(let i=0;i<rows.length;i+=size){
  const part=rows.slice(i,i+size);
  result.push({from:part[0].date,to:part.at(-1).date,sales:part.reduce((v,r)=>v+(Number(r.sales)||0),0),
   purchases:part.reduce((v,r)=>v+(Number(r.purchases)||0),0),
   expenses:part.reduce((v,r)=>v+(Number(r.variable)||0)+(Number(r.fixed)||0),0)});
 }
 return result;
}
export function summarizeReportRows(rows,limit,otherLabel){
 if(rows.length<=limit)return rows;
 const rest=rows.slice(limit-1);
 return [...rows.slice(0,limit-1),{name:otherLabel,value:rest.reduce((v,r)=>v+r.value,0)}];
}
export function drawTwoPageERPReport(doc,{snapshot:s,growth,report:r,
 range,branchLabel,businessName,currency='SAR',lang='en',iconData}){
 const rtl=lang!=='en',tr=(en,fa,ar)=>lang==='fa'?fa:lang==='ar'?ar:en;
 const ink=[20,38,67],blue=[37,99,235],teal=[0,143,111],orange=[218,116,16],muted=[90,108,132];
 const n=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
 const money=v=>v==null?'—':`${n(v)} ${currency}`;
 const percent=v=>v==null?'—':`${n(v)}%`;
 const text=(v,x,y,w,size=10,color=ink,align)=>drawLocalizedPdfText(doc,v,align==='left'?x:rtl?x+w:x,y,
  {rtl,bold:true,size,color,fit:true,maxWidth:w,align:align|| (rtl?'right':'left')});
 const panel=(x,y,w,h)=>{doc.setFillColor(247,250,255);doc.setDrawColor(219,230,245);doc.setLineWidth(.25);doc.roundedRect(x,y,w,h,3,3,'FD');};
 const section=(name,y)=>{text(name,12,y,186,12);doc.setFillColor(...blue);doc.roundedRect(rtl?201:7,y-4,2,5,1,1,'F');};
 const metric=(name,value,index,color)=>{
  const x=7+(rtl?2-index:index)*67;panel(x,53,62,25);text(name,x+4,61,54,9,muted);text(value,x+4,72,54,15,color);
 };
 const heading=(title,subtitle)=>{
  doc.setFillColor(232,241,255);doc.roundedRect(7,28,196,19,3,3,'F');
  text(title,12,36,186,17);text(subtitle,12,43,186,9,muted);
 };
 const unavailable=tr('Not available','اطلاعات موجود نیست','البيانات غير متاحة');
 const other=tr('Other (combined)','سایر موارد (مجموع)','أخرى (مجمعة)');
 const salesLabel=tr('Finalized sales','فروشات نهایی','المبيعات المعتمدة');
 const purchasesLabel=tr('Approved purchases','خرید تأییدشده','المشتريات المعتمدة');
 const expenseLabel=tr('Period expenses','مصارف دوره','مصروفات الفترة');
 const trend=aggregateReportTrend(s.breakdown||[]);
 function chart(title,series){
  section(title,88);panel(7,92,196,65);
  const x=29,y=107,w=164,h=35;
  const values=trend.flatMap(p=>series.map(ser=>p[ser.key]));
  const lo=Math.min(0,...values),hi=Math.max(1,...values),span=hi-lo;
  const py=v=>y+h-(v-lo)/span*h;
  for(let i=0;i<=3;i++){
   const val=lo+span*i/3,yy=py(val);doc.setDrawColor(219,230,245);doc.setLineWidth(.2);doc.line(x,yy,x+w,yy);
   drawLocalizedPdfText(doc,n(val),26,yy+1,{bold:true,size:7.5,align:'right',fit:true,maxWidth:17,color:muted});
  }
  for(let k=0;k<series.length;k++){
   const ser=series[k];text(ser.label,12+k*94,101,89,9,ser.color);
   doc.setDrawColor(...ser.color);doc.setFillColor(...ser.color);doc.setLineWidth(.7);
   const px=i=>x+(trend.length===1?w/2:i*w/(trend.length-1));
   trend.forEach((p,i)=>{if(i)doc.line(px(i-1),py(trend[i-1][ser.key]),px(i),py(p[ser.key]));doc.circle(px(i),py(p[ser.key]),.65,'F');});
  }
  if(trend.length){
   text(trend[0].from,29,150,65,8,muted,'left');
   drawLocalizedPdfText(doc,trend.at(-1).to,193,150,{bold:true,size:8,align:'right',color:muted});
  }else text(unavailable,35,124,150,11,muted);
  doc.setLineWidth(.25);
 }
 function list(title,rows,y=221){
  section(title,y);panel(7,y+4,196,48);
  const sorted=[...rows].sort((a,b)=>b.value-a.value);
  const limited=summarizeReportRows(sorted,5,other);
  const peak=Math.max(1,...limited.map(v=>Math.abs(v.value)));
  if(!limited.length){text(unavailable,12,y+20,186,10,muted);return;}
  limited.forEach((row,i)=>{
   const yy=y+12+i*8;
   text(row.name,rtl?103:12,yy,94,9.5);
   text(money(row.value),rtl?12:145,yy,52,10,row.value<0?orange:blue);
   doc.setFillColor(220,230,245);doc.roundedRect(rtl?68:112,yy-3,30,2,1,1,'F');
   doc.setFillColor(...blue);const width=30*Math.abs(row.value)/peak;if(width)doc.roundedRect(rtl?98-width:112,yy-3,width,2,Math.min(1,width/2),1,'F');
  });
 }
 function small(name,value,x,y,color=ink){text(name,x+4,y+8,85,9,muted);text(value,x+4,y+18,85,13,color);}
 heading(tr('Sales performance','تحلیل عملکرد فروشات','تحليل أداء المبيعات'),
  tr('Selected branch and period · Finalized closings only','شعبه و دوره انتخاب‌شده · فقط فروشات نهایی','الفرع والفترة المختارة · الإقفالات المعتمدة فقط'));
 metric(salesLabel,money(s.sales),0,blue);
 metric(tr('Daily average','اوسط روزانه','المتوسط اليومي'),money(s.averageDailySales),1,teal);
 metric(tr('Growth vs prior period','رشد نسبت به دوره قبل','النمو عن الفترة السابقة'),percent(growth),2,growth<0?orange:teal);
 chart(tr('Sales trend','روند فروشات','اتجاه المبيعات'),[{key:'sales',label:salesLabel+' / '+currency,color:blue}]);
 section(tr('Payment mix','ترکیب روش‌های پرداخت','توزيع طرق الدفع'),167);panel(7,171,96,39);panel(107,171,96,39);
 const payments=[[tr('Cash','نقد','نقد'),s.cash],[tr('Card / network','شبکه','الشبكة'),s.network],[tr('Credit','نسیه','آجل'),s.credit],[tr('Other sources','سایر منابع','مصادر أخرى'),s.other]];
 payments.forEach(([name,value],i)=>{const x=(i<2?7:107),yy=180+(i%2)*18;text(name,x+4,yy,40,9,muted);text(money(value),x+46,yy,46,11,i<2?blue:teal);});
 list(tr('Branch sales · leading branches + other','فروش شعب · شعب برتر و مجموع سایر شعب','مبيعات الفروع · الأعلى ومجموع الباقي'),(r?.branches||[]).map(b=>({name:b.name,value:Number(b.sales)||0})));
 text(tr('Cash, card and credit are included in sales; they are not additional revenue.','نقد، شبکه و نسیه داخل فروش‌اند و درآمد اضافی نیستند.','النقد والشبكة والآجل ضمن المبيعات وليست إيرادات إضافية.'),8,280,194,8,muted);
 drawERPReportBrand(doc,{lang,title:tr('Sales report','گزارش فروشات','تقرير المبيعات'),business:businessName,branch:branchLabel,period:`${range.from} / ${range.to}`,iconData,pageLabel:'1 / 2'});
 doc.addPage();
 heading(tr('Purchases & expense control','تحلیل خرید و مصارف','تحليل المشتريات والمصروفات'),
  tr('Approved purchases · Allocated period expenses','خرید تأییدشده · مصارف تخصیص‌یافته به دوره','مشتريات معتمدة · مصروفات موزعة على الفترة'));
 metric(purchasesLabel,money(s.purchases),0,blue);metric(expenseLabel,money(s.totalExpenses),1,orange);
 metric(tr('Sales less purchases & expenses','فروش منهای خرید و مصارف','المبيعات ناقص المشتريات والمصروفات'),money(s.netProfit),2,s.netProfit<0?orange:teal);
 chart(tr('Purchases and expenses trend','روند خرید و مصارف','اتجاه المشتريات والمصروفات'),[
  {key:'purchases',label:purchasesLabel+' / '+currency,color:blue},{key:'expenses',label:expenseLabel+' / '+currency,color:orange}]);
 section(tr('Cost structure and ratios','ساختار هزینه و نسبت‌ها','هيكل التكاليف والنسب'),167);
 panel(7,171,96,39);panel(107,171,96,39);
 small(tr('Variable / fixed expenses','مصارف متغیر / ثابت','مصروفات متغيرة / ثابتة'),`${n(s.variableExpenses)} / ${n(s.fixedDeduction)} ${currency}`,7,171,orange);
 text(tr('Recorded fixed costs allocated by day','مصارف ثابت بر اساس روز تخصیص یافته‌اند','التكاليف الثابتة موزعة حسب الأيام'),11,204,88,7.5,muted);
 small(tr('Purchases / sales · Expenses / sales','خرید / فروش · مصارف / فروش','المشتريات / المبيعات · المصروفات / المبيعات'),
  `${percent(s.sales?100*s.purchases/s.sales:null)} / ${percent(s.sales?100*s.totalExpenses/s.sales:null)}`,107,171,blue);
 text(tr('Ratios unavailable when sales are zero','نسبت‌ها در فروش صفر محاسبه نمی‌شوند','النسب غير متاحة عندما تكون المبيعات صفراً'),111,204,88,7.5,muted);
 list(tr('Expense categories · largest + other','دسته‌های مصارف · بزرگ‌ترین‌ها و مجموع سایر موارد','فئات المصروفات · الأكبر ومجموع الباقي'),(r?.costGroups||[]).map(c=>({name:c.name,value:Number(c.value)||0})));
 text(tr('Purchases are not inventory-adjusted COGS. This is a two-page summary, not a transaction ledger.','خرید معادل بهای تعدیل‌شده فروش نیست. این گزارش خلاصه است، نه دفتر معاملات.','المشتريات ليست تكلفة مبيعات معدلة بالمخزون. هذا ملخص وليس دفتر معاملات.'),8,280,194,8,muted);
 drawERPReportBrand(doc,{lang,title:tr('Purchases & expenses','خرید و مصارف','المشتريات والمصروفات'),business:businessName,branch:branchLabel,period:`${range.from} / ${range.to}`,iconData,pageLabel:'2 / 2'});
 if(doc.getNumberOfPages()!==2)throw new Error('Management report must contain exactly two pages');
}
