import {drawLocalizedPdfText} from './pdfLocalization';
import {drawERPReportBrand} from './erpPdfBrand';

// A paginated presentation of the existing authorized report models. No new
// client-side database reads, cross-tenant aggregation or inferred balances.
export function drawDetailedERPReport(doc, {
 snapshot:s, previousSnapshot:previous, growth, report:r, range, branchLabel,
 businessName, currency='SAR', lang='en', iconData,
}) {
 const rtl=lang!=='en';
 const tr=(en,fa,ar)=>lang==='fa'?fa:lang==='ar'?ar:en;
 const title=tr('ERP Management Report','گزارش جامع مدیریتی ERP','تقرير الإدارة الشامل ERP');
 const missing=tr('Not available','معلومات موجود نیست','البيانات غير متاحة');
 const empty=tr('No records in this scope','در این محدوده رکوردی ثبت نشده','لا توجد سجلات في هذا النطاق');
 const num=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
 const money=v=>v==null?'—':`${num(v)} ${currency}`;
 const pct=v=>v==null?'—':`${num(v)}%`;
 const label={
  metric:tr('Metric','شاخص','المؤشر'),value:tr('Value','مقدار','القيمة'),date:tr('Date','تاریخ','التاريخ'),
  sales:tr('Finalized sales','فروشات نهایی','المبيعات المعتمدة'),purchases:tr('Approved purchases','خریدهای تأییدشده','المشتريات المعتمدة'),
  expenses:tr('Expenses','مصارف','المصروفات'),net:tr('Net result','نتیجه خالص','صافي النتيجة'),
  name:tr('Name / reference','نام / مرجع','الاسم / المرجع'),qty:tr('Quantity','مقدار','الكمية'),
  cost:tr('Cost','هزینه','التكلفة'),branch:tr('Branch','شعبه','الفرع'),status:tr('Status','وضعیت','الحالة'),
  amount:tr('Amount','مبلغ','المبلغ'),unit:tr('Unit','واحد','الوحدة'),
 };
 const unit=v=>({unit:tr('unit','واحد','وحدة'),kg:tr('kg','کیلوگرام','كغ'),carton:tr('carton','کارتن','كرتون'),piece:tr('piece','عدد','قطعة')}[v]||v||'—');
 const status=v=>({approved:tr('Approved','تأییدشده','معتمد'),auto_approved:tr('Approved','تأییدشده','معتمد'),
  paid:tr('Paid','پرداخت‌شده','مدفوع'),partial:tr('Partial','قسمی','جزئي'),pending:tr('Pending','در انتظار','قيد الانتظار'),
  draft:tr('Draft','پیش‌نویس','مسودة'),open:tr('Open','باز','مفتوح'),overdue:tr('Overdue','سررسید گذشته','متأخر'),
  receivable:tr('Receivable','طلب','مستحق لنا'),payable:tr('Payable','بدهی','مستحق علينا'),
 }[v]|| (v ? tr('Other recorded status','سایر وضعیت‌های ثبت‌شده','حالة أخرى مسجلة') : '—'));
 const text=(v,x,y,w,opts={})=>drawLocalizedPdfText(doc,v,rtl?x+w:x,y,{rtl,bold:true,size:10.5,color:[25,43,70],...opts});
 let y=40;const pages=[];
 function page(section){
  if(pages.length)doc.addPage();
  pages.push(section); y=43;
  doc.setFillColor(233,241,255);doc.roundedRect(10,28,190,12,2,2,'F');
  text(section,14,36,182,{size:15});
 }
 function wrap(value,width,size=10.5){
  doc.setFont('Vazirmatn','bold');doc.setFontSize(size);
  const measure=t=>doc.getTextWidth(doc.processArabic(t));
  const lines=[];
  for(const para of String(value??'—').split('\n')){
   let line='';
   for(const word of para.split(/\s+/)){
    if(measure([line,word].filter(Boolean).join(' '))<=width){line=[line,word].filter(Boolean).join(' ');continue;}
    if(line)lines.push(line);line='';
    for(const char of word){if(line&&measure(line+char)>width){lines.push(line);line='';}line+=char;}
   }
   lines.push(line||' ');
  }
  return lines;
 }
 function note(value){
  for(const line of wrap(value,182,10)){
   if(y>274)page(pages.at(-1));
   text(line,14,y+5,182,{size:10});y+=6;
  }
  y+=4;
 }
 function table(section,headers,widths,rows,noteText){
  page(section);
  if(noteText)note(noteText);
  const drawRow=(cells,header=false)=>{
   const height=Math.max(...cells.map(c=>c.length))*5.5+5;
   doc.setFillColor(...(header?[219,233,254]:[245,248,252]));doc.rect(10,y,190,height,'F');
   let offset=0;
   cells.forEach((lines,i)=>{
    const x=rtl?200-offset-widths[i]:10+offset;
    lines.forEach((line,j)=>text(line,x+2,y+5.5+j*5.5,widths[i]-4,{size:10.5}));offset+=widths[i];
   });y+=height+1;
  };
  const head=()=>drawRow(headers.map((h,i)=>wrap(h,widths[i]-4)),true);
  head();
  if(!rows?.length){note(rows==null?missing:empty);return;}
  for(const row of rows){
   let cells=row.map((v,i)=>wrap(v,widths[i]-4));
   while(cells.some(c=>c.length)){
    let capacity=Math.floor((275-y-5)/5.5);
    const length=Math.max(...cells.map(c=>c.length));
    if(capacity<1||(length<=32&&length>capacity)){page(section);head();capacity=Math.floor((275-y-5)/5.5);}
    const count=Math.min(capacity,length);
    drawRow(cells.map(c=>c.slice(0,count)));
    cells=cells.map(c=>c.slice(count));
   }
  }
 }
 const currentNote=tr('Current snapshot as of','وضعیت فعلی در تاریخ','الوضع الحالي بتاريخ')+'\n'+(r?.asOfDate||range.to);
 table(tr('Executive summary','خلاصه مدیریتی','الملخص التنفيذي'),[label.metric,label.value],[112,78],[
  [label.sales,money(s.sales)],[label.purchases,money(s.purchases)],[label.expenses,money(s.totalExpenses)],
  [tr('Gross result','نتیجه ناخالص','النتيجة الإجمالية'),money(s.grossProfit)],[label.net,money(s.netProfit)],
  [tr('Net margin','حاشیه خالص','هامش صافي النتيجة'),pct(s.netMargin)],
  [tr('Daily average sales','اوسط فروش روزانه','متوسط المبيعات اليومي'),money(s.averageDailySales)],
  [tr('Finalized closings','بستن‌های نهایی','الإقفالات المعتمدة'),num(s.finalizedClosings)],
  [tr('Previous period sales','فروش دوره قبلی','مبيعات الفترة السابقة'),money(previous?.sales)],
  [tr('Sales growth','رشد فروش','نمو المبيعات'),pct(growth)],
 ],tr('Scope: selected business, authorized branches and reporting period. Inventory and debts are current snapshots. Purchases are not inventory-adjusted cost of goods sold.',
 'محدوده: کسب‌وکار، شعب مجاز و دوره انتخاب‌شده. موجودی و بدهی‌ها وضعیت فعلی هستند. خریدها معادل بهای کالای فروش‌رفته پس از تعدیل موجودی نیستند.',
 'النطاق: المنشأة والفروع المصرح بها والفترة المختارة. المخزون والديون أرصدة حالية. المشتريات ليست تكلفة مبيعات معدلة بالمخزون.'));
 page(tr('Sales and profit chart','نمودار فروش و نتیجه مالی','رسم المبيعات والنتيجة المالية'));
 const points=s.breakdown||[];
 if(points.length){
  const values=points.flatMap(b=>[Number(b.sales)||0,Number(b.netProfit)||0]);
  const lo=Math.min(0,...values),hi=Math.max(1,...values),span=hi-lo;
  const plot={x:28,y:65,w:165,h:115};
  const px=i=>plot.x+(points.length===1?plot.w/2:i*plot.w/(points.length-1));
  const py=v=>plot.y+plot.h-(v-lo)/span*plot.h;
  for(let i=0;i<=4;i++){
   const v=lo+span*i/4,yy=py(v);doc.setDrawColor(220,229,240);doc.line(plot.x,yy,plot.x+plot.w,yy);
   drawLocalizedPdfText(doc,num(v),25,yy+1,{align:'right',bold:true,size:8,fit:true,maxWidth:22,color:[60,78,105]});
  }
  for(const [key,color] of [['sales',[37,99,235]],['netProfit',[0,137,103]]]){
   doc.setDrawColor(...color);doc.setFillColor(...color);doc.setLineWidth(.7);
   for(let i=0;i<points.length;i++){
    const yy=py(Number(points[i][key])||0);
    if(i)doc.line(px(i-1),py(Number(points[i-1][key])||0),px(i),yy);
    if(points.length<35)doc.circle(px(i),yy,.7,'F');
   }
  }
  drawLocalizedPdfText(doc,points[0].date,plot.x,188,{bold:true,size:10,color:[25,43,70]});
  drawLocalizedPdfText(doc,points.at(-1).date,193,188,{bold:true,size:10,align:'right',color:[25,43,70]});
  y=201;note(label.sales+' / '+currency);doc.setFillColor(37,99,235);doc.rect(rtl?198:11,198,2,7,'F');
  note(label.net+' / '+currency);doc.setFillColor(0,137,103);doc.rect(rtl?198:11,208,2,7,'F');doc.setLineWidth(.2);
 }else note(empty);
 table(tr('Sales and profit trend','روند فروش و نتیجه مالی','اتجاه المبيعات والنتيجة المالية'),[label.date,label.sales,label.purchases,label.expenses,label.net],[36,39,39,37,39],
 (s.breakdown||[]).map(b=>[b.date,money(b.sales),money(b.purchases),money(b.variable==null&&b.fixed==null?null:(b.variable||0)+(b.fixed||0)),money(b.netProfit)]));
 table(tr('Payment analysis','تحلیل روش‌های پرداخت','تحليل طرق الدفع'),[label.metric,label.amount],[112,78],[
  [tr('Cash sales','فروش نقدی','مبيعات نقدية'),money(s.cash)],
  [tr('Card / network sales','فروش شبکه','مبيعات الشبكة'),money(s.network)],
  [tr('Credit sales','فروش نسیه','مبيعات آجلة'),money(s.credit)],
  [tr('Other revenue sources','سایر منابع فروش','مصادر المبيعات الأخرى'),money(s.other)],
 ],tr('Payment sources are included in sales, not additional revenue. Cash sales are not the cash-register balance; network sales are not bank settlements.',
 'روش‌های پرداخت داخل فروش محاسبه شده‌اند و درآمد اضافی نیستند. فروش نقدی مانده صندوق نیست؛ فروش شبکه تسویه بانکی نیست.',
 'طرق الدفع ضمن المبيعات وليست إيرادات إضافية. المبيعات النقدية ليست رصيد الصندوق ومبيعات الشبكة ليست تسويات بنكية.'));
 table(tr('Branch performance','عملکرد شعب','أداء الفروع'),[label.branch,label.sales,label.purchases,label.expenses,label.net],[46,36,36,36,36],
 r?.branches?.map(b=>[b.name,money(b.sales),money(b.purchases),money(b.expenses),money(b.netProfit)]));
 if(r?.branchProfitUnallocated)note(tr('Unallocated branch result','نتیجه تخصیص‌نیافته به شعب','نتيجة غير موزعة على الفروع')+': '+money(r.branchProfitUnallocated));
 table(tr('Cost control and profitability','کنترل هزینه و سودآوری','مراقبة التكاليف والربحية'),[label.metric,label.value],[112,78],[
  [tr('Variable expenses','مصارف متغیر','مصروفات متغيرة'),money(s.variableExpenses)],
  [tr('Allocated fixed expenses','مصارف ثابت تخصیص‌یافته','مصروفات ثابتة موزعة'),money(s.fixedDeduction)],
  [tr('Purchases / sales','خرید / فروش','المشتريات / المبيعات'),pct(s.sales?100*s.purchases/s.sales:null)],
  [tr('Expenses / sales','مصارف / فروش','المصروفات / المبيعات'),pct(s.sales?100*s.totalExpenses/s.sales:null)],
  ...(r?.costGroups||[]).map(c=>[c.name,money(c.value)]),
 ]);
 table(tr('Inventory by item','موجودی به تفکیک قلم','المخزون حسب الصنف'),[label.name,label.qty,label.unit,tr('Reorder level','حد سفارش','حد إعادة الطلب')],[90,32,36,32],
 r?.stocks?.map(b=>[[b.name,b.branchName].filter(Boolean).join('\n'),num(b.quantity),unit(b.unit),num(b.threshold)]),currentNote);
 table(tr('Product consumption and waste','مصرف محصولات و ضایعات','استهلاك المنتجات والهدر'),[label.name,label.qty,label.unit,label.cost],[85,30,35,40],
 r?.consumption?.map(b=>[b.name,num(b.quantity),unit(b.unit),b.costAvailable?money(b.estimatedCost):missing]));
 note(tr('Recorded waste cost','هزینه ضایعات ثبت‌شده','تكلفة الهدر المسجلة')+': '+(r?.hasWasteData&&r?.wasteCostComplete?money(r.wasteCost):missing));
 table(tr('Purchase invoice register','فهرست فاکتورهای خرید','سجل فواتير المشتريات'),[label.date,label.name,label.status,label.amount],[32,78,40,40],
 r?.details?.purchases?.map(b=>[b.date,[b.supplier_name,b.invoice_number||b.id].filter(Boolean).join('\n'),status(b.approval_status||b.status),money(b.total_amount??(b.qty!=null?b.qty*(b.used_price??b.current_price??0):null))]),
 tr('Includes recorded invoices and their status. Only approved purchases enter the summary. This is not a supplier payment ledger.',
 'فاکتورهای ثبت‌شده همراه وضعیت نمایش داده می‌شوند. فقط خریدهای تأییدشده در خلاصه محاسبه می‌شوند. این فهرست دفتر پرداخت سپلایر نیست.',
 'يعرض الفواتير المسجلة وحالتها. تدخل المشتريات المعتمدة فقط في الملخص. هذا ليس دفتر مدفوعات الموردين.'));
 table(tr('Expense register','فهرست مصارف','سجل المصروفات'),[label.date,label.name,label.amount],[35,110,45],
 r?.details?.expenses?.map(b=>[b.date,b.description||b.category_name||b.notes||b.id,money(b.amount)]),
 tr('Recorded amounts; fixed expenses in the summary are allocated across days in the selected period.',
 'مبالغ ثبت‌شده؛ مصارف ثابت در خلاصه به روزهای دوره انتخاب‌شده تخصیص یافته‌اند.',
 'مبالغ مسجلة؛ توزع المصروفات الثابتة في الملخص على أيام الفترة المختارة.'));
 table(tr('Debt records','رکوردهای بدهی و مطالبات','سجلات الديون والمستحقات'),[label.name,label.status,label.amount,tr('Paid','پرداخت‌شده','المدفوع'),tr('Remaining','باقی‌مانده','المتبقي')],[65,35,30,30,30],
 r?.details?.debts?.map(b=>[b.party_name||b.customer_name||b.supplier_name||b.id,status(b.type)+'\n'+status(b.status),money(b.total_amount),money(b.paid_amount),money(b.remaining_amount??(b.total_amount!=null?b.total_amount-(b.paid_amount||0):null))]),currentNote);
 table(tr('Management attention','موارد نیازمند بررسی مدیریت','متابعة الإدارة'),[label.metric,label.value],[112,78],[
  [tr('Low stock items','اقلام کم‌موجودی','أصناف منخفضة المخزون'),r?num(r.lowStock?.length):missing],
  [tr('Out of stock','اقلام تمام‌شده','أصناف نافدة'),r?num(r.noStock):missing],
  [tr('Open receivables','مطالبات باز','المستحقات المفتوحة لنا'),money(r?.debts?.receivables)],
  [tr('Open payables in debt records','بدهی‌های باز در دفتر بدهی','المستحقات المفتوحة علينا في سجل الديون'),money(r?.debts?.payables)],
  [tr('Debt records with unknown balance','رکوردهای با مانده نامعلوم','سجلات برصيد غير معروف'),num(r?.debts?.unknown)],
 ]);
 note(tr('Coverage: sales, payment mix, profit, branches, costs, inventory, consumption, purchases, expenses and debt records loaded for this report. Payroll, attendance, bank reconciliation, supplier payment allocations and platform subscriptions are not included in this dataset.',
 'پوشش: فروش، روش پرداخت، نتیجه مالی، شعب، هزینه، موجودی، مصرف، خرید، مصارف و رکوردهای بدهی بارگذاری‌شده. معاش، حاضری، تطبیق بانکی، تخصیص پرداخت سپلایر و اشتراک پلتفرم در این مجموعه اطلاعات موجود نیستند.',
 'التغطية: المبيعات وطرق الدفع والنتيجة المالية والفروع والتكاليف والمخزون والاستهلاك والمشتريات والمصروفات وسجلات الديون المحملة. الرواتب والحضور والمطابقة البنكية وتخصيص دفعات الموردين واشتراكات المنصة غير متاحة ضمن هذه البيانات.'));
 const count=doc.getNumberOfPages();
 for(let i=1;i<=count;i++){
  doc.setPage(i);drawERPReportBrand(doc,{lang,title,business:businessName,branch:branchLabel,
   period:`${range.from} / ${range.to}`,iconData,pageLabel:`${i} / ${count}`});
 }
 return {pages:count,sections:pages};
}
