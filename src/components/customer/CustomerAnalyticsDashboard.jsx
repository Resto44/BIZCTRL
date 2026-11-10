import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarDays, CreditCard, FileText, ShoppingBag, TrendingUp } from 'lucide-react';
import {
 Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
 ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { customerPortalRpc } from '@/lib/customerPortal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const COLORS = ['#0f766e','#2563eb','#7c3aed','#d97706','#db2777','#64748b'];
const PERIODS = ['day','week','month','3m','6m','year','custom'];
const WORDS = {
 en: {
  heading:'Account analytics', subheading:'Your activity, trends and payments',period:'Period',day:'Today',week:'7 days',month:'This month',
  '3m':'3 months','6m':'6 months',year:'12 months',custom:'Custom',from:'From',to:'To',apply:'Apply dates',
  invoices:'Credit invoices issued',receipts:'Credit payments received',orders:'Orders placed',
  trend:'Financial activity trend',compare:'Invoices and payments',methods:'Payment methods',
  count:'Records',noData:'No recorded transactions in this period.',fail:'Analytics could not be loaded. The account statement remains available below.',
  refresh:'Retry analytics',scope:'Dates shown in Saudi Arabia time',coverage:'Credit invoices and their receipts are not added to order totals: one order may also become a credit invoice.',
  history:'Trends use recorded transaction dates, not reconstructed historic balances.',latest:'As of',granularity:'Grouping',
  dayGrain:'daily',monthGrain:'monthly',paymentMethods:'Payments by method',activity:'Transaction breakdown',
  notAvailable:'No payment methods in this period.',invoicesLegend:'Credit invoices',paymentsLegend:'Received payments',ordersLegend:'Orders',
  rangeInvalid:'Choose a valid range within the last 366 days.',noResults:'No trend available for this selection.'
 },
 ar: {
  heading:'تحليلات حساب العميل',subheading:'نشاطك واتجاهاتك ومدفوعاتك',period:'الفترة',day:'اليوم',week:'٧ أيام',month:'هذا الشهر',
  '3m':'٣ أشهر','6m':'٦ أشهر',year:'١٢ شهراً',custom:'مخصص',from:'من',to:'إلى',apply:'تطبيق التواريخ',
  invoices:'فواتير الآجل الصادرة',receipts:'مدفوعات الآجل المستلمة',orders:'الطلبات المسجلة',
  trend:'اتجاه النشاط المالي',compare:'الفواتير والمدفوعات',methods:'طرق الدفع',
  count:'سجلات',noData:'لا توجد معاملات مسجلة خلال هذه الفترة.',fail:'تعذر تحميل التحليلات. كشف الحساب متاح أدناه.',
  refresh:'إعادة محاولة التحليلات',scope:'التواريخ بتوقيت السعودية',coverage:'لا نجمع فواتير الآجل مع قيمة الطلبات، فقد يتحول الطلب نفسه إلى فاتورة آجل.',
  history:'الاتجاهات مبنية على تواريخ المعاملات المسجلة وليس أرصدة تاريخية معاد احتسابها.',latest:'حتى',granularity:'التجميع',
  dayGrain:'يومي',monthGrain:'شهري',paymentMethods:'المدفوعات حسب الطريقة',activity:'توزيع المعاملات',
  notAvailable:'لا توجد طرق دفع مسجلة لهذه الفترة.',invoicesLegend:'فواتير الآجل',paymentsLegend:'المدفوعات',ordersLegend:'الطلبات',
  rangeInvalid:'اختر فترة صحيحة لا تتجاوز ٣٦٦ يوماً.',noResults:'لا توجد اتجاهات لهذه الفترة.'
 },
 fa: {
  heading:'آنالیز حساب مشتری',subheading:'فعالیت، روند خرید و پرداخت‌های شما',period:'دوره',day:'امروز',week:'۷ روز',month:'ماه جاری',
  '3m':'۳ ماه','6m':'۶ ماه',year:'۱۲ ماه',custom:'دلخواه',from:'از',to:'تا',apply:'اعمال تاریخ',
  invoices:'فاکتورهای نسیه صادرشده',receipts:'پرداخت‌های نسیه دریافت‌شده',orders:'سفارش‌های ثبت‌شده',
  trend:'روند فعالیت مالی',compare:'مقایسهٔ فاکتور و پرداخت',methods:'روش‌های پرداخت',
  count:'ریکورد',noData:'در این دوره هیچ معامله‌ای ثبت نشده است.',fail:'آنالیز بارگذاری نشد. صورت‌حساب در پایین صفحه در دسترس است.',
  refresh:'تلاش دوباره',scope:'تاریخ‌ها به وقت عربستان است',coverage:'فاکتور نسیه و سفارش جدا هستند؛ یک سفارش ممکن است دوباره در فاکتور ثبت شود، بناً ارقام را جمع نمی‌کنیم.',
  history:'نمودارها از تاریخ معاملات واقعی ساخته شده‌اند؛ موجودی تاریخی بازسازی نشده است.',latest:'تا تاریخ',granularity:'گروه‌بندی',
  dayGrain:'روزانه',monthGrain:'ماهانه',paymentMethods:'پرداخت‌ها به تفکیک روش',activity:'تفکیک معاملات',
  notAvailable:'در این دوره پرداختی ثبت نشده است.',invoicesLegend:'فاکتور نسیه',paymentsLegend:'پرداخت دریافت‌شده',ordersLegend:'سفارش',
  rangeInvalid:'دورهٔ معتبر تا حداکثر ۳۶۶ روز انتخاب کنید.',noResults:'روندی برای این دوره وجود ندارد.'
 }
};

const getTodayRiyadh = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0,10);
const localeFor = lang => lang==='ar'?'ar-SA':lang==='fa'?'fa-AF':'en-US';
const compact = (value,lang) => Number(value || 0).toLocaleString(localeFor(lang), {maximumFractionDigits:0,notation:'compact'});
const amount = (value,lang) => Number(value||0).toLocaleString(localeFor(lang),{minimumFractionDigits:2,maximumFractionDigits:2});
const shortDate = date => String(date||'').slice(5,10).replace('-','/');

const StatCard = ({ title, value, count, currency, Icon, lang, color }) =>
 <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0 sm:p-5">
  <div className="flex items-center justify-between gap-2">
   <span className="text-xs font-semibold leading-5 text-slate-500 sm:text-sm">{title}</span>
   <span className="rounded-xl bg-slate-100 p-2"><Icon size={18} color={color} aria-hidden="true"/></span>
  </div>
  <p className="mt-3 break-words text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl" dir="ltr">
   {amount(value,lang)} <span className="text-xs font-semibold text-slate-500">{currency}</span>
  </p>
  <p className="mt-1 text-xs text-slate-500">{count} {WORDS[lang]?.count||WORDS.en.count}</p>
 </article>;

export default function CustomerAnalyticsDashboard({ account, lang='en' }) {
 const t = WORDS[lang] || WORDS.en;
 const [period, setPeriod] = useState('month');
 const [custom, setCustom] = useState({from:'',to:''});
 const [applied, setApplied] = useState({from:'',to:''});
 const [dateError,setDateError] = useState('');
 const effectivePeriod = PERIODS.includes(period) ? period : 'month';
 const query = useQuery({
  queryKey:['customer-portal','analytics',account?.id,effectivePeriod,applied.from,applied.to],
  enabled:!!account?.id && (effectivePeriod!=='custom' || (!!applied.from && !!applied.to)),
  queryFn:()=>customerPortalRpc('erp_customer_portal_analytics',{
   p_customer_id:account.id,p_period:effectivePeriod,
   p_from:effectivePeriod==='custom'?applied.from:null,
   p_to:effectivePeriod==='custom'?applied.to:null
  }),
  refetchInterval:60000,staleTime:20000,retry:1
 });
 const result=query.data;
 const currency=result?.currency||account?.currency||'';
 const series=useMemo(()=>Array.isArray(result?.series)?result.series.map(v=>({
  date:v.date, label:result.grain==='month'?String(v.date).slice(0,7):shortDate(v.date),
  invoices:Number(v.invoices||0),payments:Number(v.payments||0),orders:Number(v.orders||0)
 })):[],[result]);
 const methods=useMemo(()=>Array.isArray(result?.methods)?result.methods.map(v=>({
  name:String(v.method||'unknown'),value:Number(v.amount||0),count:Number(v.count||0)
 })):[],[result]);
 const totals=result?.totals;
 const records=Number(totals?.invoice_count||0)+Number(totals?.payment_count||0)+Number(totals?.order_count||0);
 const maxDate=getTodayRiyadh();

 const updatePeriod = next => {
  setPeriod(next); setDateError('');
  if(next!=='custom')setApplied({from:'',to:''});
 };
 const applyCustom = event => {
  event.preventDefault();
  if(!custom.from||!custom.to||custom.from>custom.to||custom.to>maxDate||
     (Date.parse(custom.to)-Date.parse(custom.from))/(86400000)>366){
    setDateError(t.rangeInvalid);return;
  }
  setDateError('');
  setApplied(custom);
 };
 return <section data-i18n-skip="true" aria-label={t.heading} className="space-y-4 rounded-3xl border border-slate-200 bg-slate-100/80 p-3 sm:p-5">
  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
   <div>
    <div className="flex items-center gap-2"><Activity className="text-teal-700" size={20} aria-hidden="true"/><h2 className="text-xl font-black text-slate-950">{t.heading}</h2></div>
    <p className="mt-1 text-sm text-slate-500">{t.subheading}</p>
   </div>
   <p className="inline-flex items-center gap-1 self-start rounded-full bg-white px-3 py-1 text-xs text-slate-600"><CalendarDays size={14} aria-hidden="true"/>{t.scope}</p>
  </div>
  <div className="flex gap-2 overflow-x-auto pb-2 print:hidden" role="group" aria-label={t.period}>
   {PERIODS.map(key=><Button key={key} type="button" size="sm" variant={effectivePeriod===key?'default':'outline'}
    aria-pressed={effectivePeriod===key} onClick={()=>updatePeriod(key)} className="shrink-0 whitespace-nowrap rounded-xl">
    {t[key]}</Button>)}
  </div>
  {effectivePeriod==='custom'&&<form onSubmit={applyCustom} className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end print:hidden">
    <label className="block min-w-0 text-sm font-semibold">{t.from}
     <Input aria-label={t.from} type="date" className="mt-1 w-full min-w-0 max-w-full" max={custom.to||maxDate} value={custom.from} onChange={e=>setCustom(s=>({...s,from:e.target.value}))} required/>
    </label>
    <label className="block min-w-0 text-sm font-semibold">{t.to}
     <Input aria-label={t.to} type="date" className="mt-1 w-full min-w-0 max-w-full" min={custom.from||undefined} max={maxDate} value={custom.to} onChange={e=>setCustom(s=>({...s,to:e.target.value}))} required/>
    </label>
    <Button type="submit" className="w-full sm:w-auto">{t.apply}</Button>
    {dateError&&<p role="alert" className="text-sm text-red-700 sm:col-span-3">{dateError}</p>}
   </form>}
  {effectivePeriod==='custom' && (!applied.from||!applied.to) ? <p className="rounded-xl bg-white p-4 text-sm text-slate-600">{t.rangeInvalid}</p>:
   query.isPending ? <p role="status" className="rounded-xl bg-white p-5 text-sm text-slate-600">{t.subheading}…</p>:
   query.isError ? <div role="alert" className="rounded-xl border border-red-200 bg-white p-4">
    <p className="text-sm text-red-800">{t.fail}</p>
    <Button className="mt-2" variant="outline" onClick={()=>query.refetch()}>{t.refresh}</Button>
   </div>:
   result&&<div className="space-y-4">
     <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
      <span>{result.start} — {result.end}</span>
      <span>{t.granularity}: {result.grain==='month'?t.monthGrain:t.dayGrain}</span>
     </div>
     <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard title={t.invoices} value={totals?.invoices} count={totals?.invoice_count||0} currency={currency} Icon={FileText} lang={lang} color="#0f766e"/>
      <StatCard title={t.receipts} value={totals?.payments} count={totals?.payment_count||0} currency={currency} Icon={CreditCard} lang={lang} color="#2563eb"/>
      <StatCard title={t.orders} value={totals?.orders} count={totals?.order_count||0} currency={currency} Icon={ShoppingBag} lang={lang} color="#7c3aed"/>
     </div>
     {records===0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t.noData}</div> :
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
       <article className="min-w-0 rounded-2xl border bg-white p-3 sm:p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><TrendingUp size={17} aria-hidden="true"/>{t.trend}</h3>
        <div className="h-60 w-full min-w-0 sm:h-72" role="img" aria-label={t.trend}>
         <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{top:8,right:12,left:-18,bottom:2}}>
           <defs><linearGradient id="customerInvoiceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f766e" stopOpacity={.22}/><stop offset="100%" stopColor="#0f766e" stopOpacity={0}/></linearGradient></defs>
           <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="#e2e8f0"/>
           <XAxis dataKey="label" tick={{fontSize:10}} minTickGap={15} axisLine={false} tickLine={false}/>
           <YAxis tickFormatter={v=>compact(v,lang)} tick={{fontSize:10}} width={45} axisLine={false} tickLine={false}/>
           <Tooltip formatter={(v,name)=>[amount(v,lang)+' '+currency,name==='invoices'?t.invoicesLegend:name==='payments'?t.paymentsLegend:t.ordersLegend]}/>
           <Legend formatter={v=>v==='invoices'?t.invoicesLegend:v==='payments'?t.paymentsLegend:t.ordersLegend} wrapperStyle={{fontSize:11}}/>
           <Area type="monotone" dataKey="invoices" name="invoices" fill="url(#customerInvoiceArea)" stroke="#0f766e" strokeWidth={2.5} connectNulls={false} isAnimationActive={false}/>
           <Area type="monotone" dataKey="payments" name="payments" fillOpacity={0} stroke="#2563eb" strokeWidth={2.5} isAnimationActive={false}/>
           <Area type="monotone" dataKey="orders" name="orders" fillOpacity={0} stroke="#7c3aed" strokeWidth={2} isAnimationActive={false}/>
          </AreaChart>
         </ResponsiveContainer>
        </div>
       </article>
       <article className="min-w-0 rounded-2xl border bg-white p-3 sm:p-5">
        <h3 className="mb-3 text-sm font-bold">{t.compare}</h3>
        <div className="h-60 w-full min-w-0 sm:h-72" role="img" aria-label={t.compare}>
         <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{top:8,right:12,left:-18,bottom:2}}>
           <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="#e2e8f0"/>
           <XAxis dataKey="label" tick={{fontSize:10}} minTickGap={15} axisLine={false} tickLine={false}/>
           <YAxis tickFormatter={v=>compact(v,lang)} tick={{fontSize:10}} width={45} axisLine={false} tickLine={false}/>
           <Tooltip formatter={(v,name)=>[amount(v,lang)+' '+currency,name==='invoices'?t.invoicesLegend:t.paymentsLegend]}/>
           <Legend formatter={v=>v==='invoices'?t.invoicesLegend:t.paymentsLegend} wrapperStyle={{fontSize:11}}/>
           <Bar dataKey="invoices" name="invoices" radius={[4,4,0,0]} fill="#0f766e" maxBarSize={24} isAnimationActive={false}/>
           <Bar dataKey="payments" name="payments" radius={[4,4,0,0]} fill="#2563eb" maxBarSize={24} isAnimationActive={false}/>
          </BarChart>
         </ResponsiveContainer>
        </div>
       </article>
      </div>}
     <article className="rounded-2xl border bg-white p-4 sm:p-5">
      <h3 className="text-sm font-bold">{t.paymentMethods}</h3>
      {methods.length===0 ? <p className="mt-3 text-sm text-slate-500">{t.notAvailable}</p>:
       <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,190px)_1fr] sm:items-center">
        <div className="h-36 w-full" role="img" aria-label={t.paymentMethods}>
         <ResponsiveContainer width="100%" height="100%">
          <PieChart><Pie data={methods} cx="50%" cy="50%" innerRadius={38} outerRadius={62} dataKey="value" nameKey="name" isAnimationActive={false}>
           {methods.map((m,i)=><Cell key={m.name} fill={COLORS[i%COLORS.length]}/>)}
          </Pie><Tooltip formatter={v=>amount(v,lang)+' '+currency}/></PieChart>
         </ResponsiveContainer>
        </div>
        <div className="space-y-3">
         {methods.map((m,i)=>{
          const total=methods.reduce((s,x)=>s+x.value,0);
          const pct=total>0?Math.max(0,Math.min(100,m.value/total*100)):0;
          return <div key={m.name} className="space-y-1 text-xs">
           <div className="flex items-center justify-between gap-2"><span className="break-all font-semibold text-slate-700">{m.name} · {m.count} {t.count}</span><span className="shrink-0 font-semibold tabular-nums">{amount(m.value,lang)} {currency}</span></div>
           <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{width:pct+'%',backgroundColor:COLORS[i%COLORS.length]}}/></div>
          </div>;
         })}
        </div>
       </div>}
     </article>
     <p className="text-xs leading-relaxed text-slate-500">{t.coverage} {t.history}</p>
   </div>}
 </section>;
}
