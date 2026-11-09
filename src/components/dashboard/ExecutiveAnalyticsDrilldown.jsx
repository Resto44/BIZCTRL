import React, { useMemo, useState } from 'react';
import { BarChart3, CalendarRange, Download, Gauge, Info, ReceiptText, TrendingUp, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { buildExecutiveMultiMetricTrend, executiveOperationalInsights, purchaseAmount } from '@/lib/executiveTrendAnalytics';
import { calculateSalesRevenue } from '@/lib/helpers';

const L = {
  en:{
    title:'ERP Financial Intelligence',subtitle:'Verified sales closings, approved purchases and real comparison periods',
    metric:'Metric',sales:'Sales',purchases:'Purchases',difference:'Sales − purchases',differenceNote:'Before expenses and fixed-cost allocation · not net profit',
    group:'Group by',day:'Daily',week:'Weekly',month:'Monthly',graph:'Chart',line:'Line',bar:'Columns',
    compare:'Previous period',now:'Current',previous:'Previous comparable period',noRows:'No matching posted transactions for this metric.',
    avg:'Average sales / elapsed day',ratio:'Purchases / sales',peak:'Highest recorded sales day',
    closings:'Finalized closings',invoices:'Approved invoices',margin:'Estimated operating margin',
    unavailable:'Not available',export:'Export CSV',note:'Trend calculations use only recorded dates; blank gaps are not counted as verified zero sales. Sales − purchases is not profit after expenses.',
    dataQuality:'Transaction selection does not reconcile to the summary. Review scoped financial records before using the trend.',
    period:'Selected period',selected:'Selected metric',
  },
  fa:{
    title:'هوشمندی مالی ERP',subtitle:'کلوزینگ‌های نهایی فروش، خریدهای تأییدشده و مقایسهٔ دوره‌ها',
    metric:'شاخص',sales:'فروشات',purchases:'خریدها',difference:'فروش منهای خرید',differenceNote:'قبل از مصارف و سهم ثابت · نه فایدهٔ خالص',
    group:'گروه‌بندی',day:'روزانه',week:'هفتگی',month:'ماهانه',graph:'نمودار',line:'خطی',bar:'ستونی',
    compare:'مقایسه با دورهٔ قبل',now:'دورهٔ جاری',previous:'دورهٔ قبلی قابل مقایسه',noRows:'در این شاخص رکورد نهایی ثبت نشده است.',
    avg:'اوسط فروش هر روز سپری‌شده',ratio:'نسبت خرید به فروش',peak:'بیشترین فروش ثبت‌شده در یک روز',
    closings:'کلوزینگ‌های نهایی',invoices:'فاکتورهای خرید تأییدشده',margin:'حاشیهٔ تخمینی عملیات',
    unavailable:'موجود نیست',export:'دریافت CSV',note:'روند فقط از تاریخ‌های دارای رکورد ساخته می‌شود؛ جای خالی به معنی فروش صفر تأییدشده نیست. فروش منهای خرید فایدهٔ خالص نیست.',
    dataQuality:'رکوردهای روند با خلاصهٔ مالی برابر نیست. قبل از استفاده، اسناد مالی شعبه را بررسی کنید.',
    period:'بازه انتخاب‌شده',selected:'شاخص انتخاب‌شده',
  },
  ar:{
    title:'الذكاء المالي ERP',subtitle:'إقفالات المبيعات النهائية والمشتريات المعتمدة ومقارنة الفترات',
    metric:'المؤشر',sales:'المبيعات',purchases:'المشتريات',difference:'المبيعات − المشتريات',differenceNote:'قبل المصروفات وتخصيص التكاليف الثابتة · ليس صافي الربح',
    group:'التجميع',day:'يومي',week:'أسبوعي',month:'شهري',graph:'الرسم',line:'خطي',bar:'أعمدة',
    compare:'مقارنة بالفترة السابقة',now:'الفترة الحالية',previous:'الفترة السابقة المقابلة',noRows:'لا توجد معاملات معتمدة لهذا المؤشر.',
    avg:'متوسط المبيعات لليوم المنقضي',ratio:'المشتريات / المبيعات',peak:'أعلى يوم مبيعات مسجل',
    closings:'إقفالات نهائية',invoices:'فواتير شراء معتمدة',margin:'هامش التشغيل التقديري',
    unavailable:'غير متاح',export:'تصدير CSV',note:'الرسوم مبنية على الأيام ذات قيود مسجلة؛ الفجوة ليست مبيعات صفرية مؤكدة. المبيعات ناقص المشتريات ليست صافي الربح.',
    dataQuality:'بيانات الاتجاه لا تطابق الملخص المالي. تحقق من القيود قبل الاعتماد على الرسم.',
    period:'الفترة المختارة',selected:'المؤشر المحدد',
  },
};
const finite = v => v!=null && v!=='' && Number.isFinite(Number(v)) ? Number(v):null;
const formatNumber = (v,lang,decimals=1) => finite(v)==null?'—':
  new Intl.NumberFormat(lang==='fa'?'fa-IR':lang==='ar'?'ar-SA':'en-US',
    {maximumFractionDigits:decimals}).format(v);
function Mini({icon:Icon,label,value,subtitle}) {
  return <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/95 p-3 dark:border-slate-700 dark:bg-slate-900/90">
    <span className="flex items-start gap-1.5 text-[11px] font-semibold leading-4 text-muted-foreground"><Icon className="h-4 w-4 shrink-0 text-indigo-500"/>{label}</span>
    <strong className="mt-2 block break-words text-lg font-black tabular-nums text-slate-950 dark:text-white">{value}</strong>
    {subtitle&&<span className="mt-1 block text-[10px] text-muted-foreground">{subtitle}</span>}
  </div>;
}
export default function ExecutiveAnalyticsDrilldown({model}){
  const {periodSales=[],periodPurchases=[],previousPeriodSales=[],previousPeriodPurchases=[],
    revenueSources=[],reportPeriod,periodMetrics={},formatMoney=(v)=>String(v),
    lang='en',hasQueryError=false,periodLabel=''}=model;
  const t=L[lang]||L.en;
  const [metric,setMetric]=useState('sales');
  const [group,setGroup]=useState(reportPeriod?.daysInPeriod>95?'month':reportPeriod?.daysInPeriod>31?'week':'day');
  const [kind,setKind]=useState('line');
  const [compare,setCompare]=useState(true);
  const effectiveGroup=reportPeriod?.daysInPeriod>120 && group==='day'?'day':group;
  const trend=useMemo(()=>buildExecutiveMultiMetricTrend({
    sales:periodSales,purchases:periodPurchases,previousSales:previousPeriodSales,
    previousPurchases:previousPeriodPurchases,revenueSources,period:reportPeriod,granularity:effectiveGroup,
  }),[periodSales,periodPurchases,previousPeriodSales,previousPeriodPurchases,revenueSources,reportPeriod,effectiveGroup]);
  const insights=useMemo(()=>executiveOperationalInsights({
    periodMetrics,sales:periodSales,purchases:periodPurchases,revenueSources,period:reportPeriod,
  }),[periodMetrics,periodSales,periodPurchases,revenueSources,reportPeriod]);
  const key=metric==='sales'?'sales':metric==='purchases'?'purchases':'purchaseGap';
  const previousKey=metric==='sales'?'prevSales':metric==='purchases'?'prevPurchases':'prevPurchaseGap';
  const title=metric==='sales'?t.sales:metric==='purchases'?t.purchases:t.difference;
  const actual=trend.some(r=>r[key]!==null);
  const countedSales=periodSales.filter(r=>r.closing_state==='finalized').reduce((sum,r)=>sum+calculateSalesRevenue(r,revenueSources).total,0);
  const countedPurchases=periodPurchases.reduce((sum,r)=>sum+purchaseAmount(r),0);
  const consistent=Math.abs(countedSales-Number(periodMetrics.totalSales||0))<0.01
     && Math.abs(countedPurchases-Number(periodMetrics.totalPurchaseCost||0))<0.01;
  const currency=(v)=>formatMoney(v);
  const formatTooltip=(v)=>[currency(v),title];
  const exportCSV=()=>{
    const cols=['date','sales','purchases','sales_less_purchases_before_expenses','previous_sales','previous_purchases','previous_difference'];
    const values=trend.map(row=>[row.date,row.sales,row.purchases,row.purchaseGap,row.prevSales,row.prevPurchases,row.prevPurchaseGap]
      .map((x,i)=>i===0?x:x==null?'':String(x)).join(','));
    const csv=[cols.join(','),...values].join('\r\n');
    const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');
    link.href=url;
    link.download='BizCTRL-executive-trends-'+(reportPeriod?.currentEnd||'report')+'.csv';
    document.body.appendChild(link);link.click();link.remove();
    URL.revokeObjectURL(url);
  };
  return <section data-testid="executive-erp-drilldown" className="space-y-3 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/75 via-white to-sky-50/40 p-3 dark:border-indigo-900/60 dark:from-indigo-950/30 dark:via-slate-950 dark:to-slate-950 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-start gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white"><Gauge className="h-4 w-4"/></span>
        <div className="min-w-0"><h3 className="text-sm font-black text-foreground sm:text-base">{t.title}</h3><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t.subtitle}</p></div>
      </div>
      <button type="button" onClick={exportCSV} disabled={hasQueryError||!trend.length} className="flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-[11px] font-bold text-foreground disabled:opacity-50"><Download className="h-4 w-4"/>{t.export}</button>
    </div>
    <p className="text-[11px] font-semibold text-muted-foreground"><CalendarRange className="me-1 inline h-3.5 w-3.5"/>{periodLabel} · {reportPeriod?.currentStart} — {reportPeriod?.currentEnd}</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Mini icon={TrendingUp} label={t.avg} value={hasQueryError?t.unavailable:currency(insights.averagePerCalendarDay)}/>
      <Mini icon={Wallet} label={t.ratio} value={hasQueryError||insights.purchaseToSales==null?t.unavailable:formatNumber(insights.purchaseToSales,lang)+'%'}/>
      <Mini icon={BarChart3} label={t.peak} value={hasQueryError||insights.peakSales==null?t.unavailable:currency(insights.peakSales)} subtitle={insights.peakDate}/>
      <Mini icon={ReceiptText} label={t.closings} value={hasQueryError?t.unavailable:formatNumber(insights.closingCount,lang,0)}/>
      <Mini icon={ReceiptText} label={t.invoices} value={hasQueryError?t.unavailable:formatNumber(insights.approvedInvoices,lang,0)}/>
      <Mini icon={Gauge} label={t.margin} value={hasQueryError||insights.netMargin==null?t.unavailable:formatNumber(insights.netMargin,lang)+'%'}/>
    </div>
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-background/80 p-2 sm:grid-cols-4">
      <label className="text-[10px] font-bold text-muted-foreground">{t.metric}
        <select data-testid="executive-trend-metric" aria-label={t.metric} value={metric} onChange={e=>setMetric(e.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-xs font-bold text-foreground">
          <option value="sales">{t.sales}</option><option value="purchases">{t.purchases}</option><option value="purchaseGap">{t.difference}</option>
        </select>
      </label>
      <label className="text-[10px] font-bold text-muted-foreground">{t.group}
        <select data-testid="executive-trend-group" aria-label={t.group} value={group} onChange={e=>setGroup(e.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-xs font-bold text-foreground">
          <option value="day">{t.day}</option><option value="week">{t.week}</option><option value="month">{t.month}</option>
        </select>
      </label>
      <label className="text-[10px] font-bold text-muted-foreground">{t.graph}
        <select aria-label={t.graph} value={kind} onChange={e=>setKind(e.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-xs font-bold text-foreground">
          <option value="line">{t.line}</option><option value="bar">{t.bar}</option>
        </select>
      </label>
      <label className="flex items-center gap-2 rounded-lg px-2 pt-4 text-[11px] font-bold text-foreground">
        <input data-testid="executive-trend-compare" type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)} className="h-4 w-4 accent-indigo-600"/>{t.compare}
      </label>
    </div>
    {!hasQueryError&&!consistent&&<p data-testid="executive-trend-reconciliation" role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-800">{t.dataQuality}</p>}
    <div className="rounded-2xl border border-border/70 bg-card p-2.5 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-black text-foreground">{title}</h4>
        <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">{t.selected}</span>
      </div>
      {metric==='purchaseGap'&&<p className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">{t.differenceNote}</p>}
      {hasQueryError||!actual?<p className="grid h-48 place-items-center text-center text-xs text-muted-foreground">{hasQueryError?t.unavailable:t.noRows}</p>:
      <div dir="ltr" className="mt-3 max-w-full overflow-x-auto pb-2" data-testid="executive-multi-trend">
        <div className="h-60" style={{minWidth:trend.length>90?760:trend.length>35?520:0}}>
          <ResponsiveContainer width="100%" height="100%">
            {kind==='bar'?<BarChart data={trend} margin={{top:10,right:8,left:0,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:10}} minTickGap={20}/>
              <YAxis width={48} tick={{fontSize:10}} tickFormatter={v=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(v)}/>
              <Tooltip formatter={v=>currency(v)} contentStyle={{fontSize:11,borderRadius:12,color:'#0f172a'}}/>
              <Legend wrapperStyle={{fontSize:11}}/>
              <ReferenceLine y={0} stroke="#64748b"/>
              <Bar dataKey={key} name={t.now} fill="#4f46e5" maxBarSize={30} radius={[4,4,0,0]}/>
              {compare&&<Bar dataKey={previousKey} name={t.previous} fill="#94a3b8" maxBarSize={26} radius={[4,4,0,0]}/>}
            </BarChart>:<LineChart data={trend} margin={{top:10,right:8,left:0,bottom:4}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:10}} minTickGap={20}/>
              <YAxis width={48} tick={{fontSize:10}} tickFormatter={v=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(v)}/>
              <Tooltip formatter={v=>currency(v)} contentStyle={{fontSize:11,borderRadius:12,color:'#0f172a'}}/>
              <Legend wrapperStyle={{fontSize:11}}/><ReferenceLine y={0} stroke="#64748b"/>
              <Line type="monotone" dataKey={key} name={t.now} stroke="#4f46e5" strokeWidth={3} dot={trend.length<13} connectNulls={false}/>
              {compare&&<Line type="monotone" dataKey={previousKey} name={t.previous} stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls={false}/>}
            </LineChart>}
          </ResponsiveContainer>
        </div>
      </div>}
    </div>
    <p className="flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600"/>{t.note}</p>
  </section>;
}
