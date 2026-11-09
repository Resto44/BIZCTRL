import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, CreditCard,
  RefreshCw, Truck, Wallet, Users, ReceiptText, AlertTriangle, ExternalLink,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import {
  OWNER_DRIVER_PERIODS, ownerDriverDateRange, ownerDriverGrowth,
  ownerDriverReconciliation, previousOwnerDriverRange,
} from '@/lib/ownerDriverSalesAnalytics';

const LABELS = {
  en: {
    title:'Driver Sales · ERP Analytics',subtitle:'Finalized driver collections already included in business sales — never additional revenue',
    today:'Today',yesterday:'Yesterday',week:'This week',month:'This month',
    '3m':'3 months','6m':'6 months','9m':'9 months',year:'This year',custom:'Custom',
    driver:'Driver',allDrivers:'All drivers',allBranches:'All branches',from:'From',to:'To',
    bucket:'Group by',day:'Day',weekBucket:'Week',monthBucket:'Month',
    line:'Line',bar:'Bars',revenue:'Driver sales',cash:'Cash',network:'Network / POS',
    entries:'Sales entries',active:'Active drivers',average:'Average per entry',selling:'Drivers with sales',
    growth:'versus equal-length previous period',comparisonUnavailable:'Previous-period comparison unavailable',
    trend:'Sales trend',rank:'Driver ranking',branch:'Branch comparison',records:'Entries',
    noData:'No finalized driver sales in the selected period.',noDrivers:'No drivers in this scope.',
    unavailable:'Unable to load verified driver sales. Totals are not confirmed.',
    retry:'Retry',lastUpdated:'Finalized closing records only',details:'Driver Management',
    noRevenue:'Only cash and network from posted Driver Sales are counted.',
    mismatch:'Payment split does not reconcile. Review the finalized closings.',
    invalidRange:'Choose a valid date range of up to 371 days.',currencyHint:'Currency follows the organization settings.',
    previous:'Previous',current:'Current',chart:'Chart type',filter:'Analytics filters',
  },
  fa: {
    title:'فروشات راننده‌ها · تحلیل ERP',subtitle:'فروشات نهایی راننده‌ها از قبل در فروش عمومی شامل است؛ درآمد اضافی نیست',
    today:'امروز',yesterday:'دیروز',week:'این هفته',month:'این ماه',
    '3m':'۳ ماه','6m':'۶ ماه','9m':'۹ ماه',year:'امسال',custom:'تاریخ دلخواه',
    driver:'راننده',allDrivers:'تمام راننده‌ها',allBranches:'تمام شعبه‌ها',from:'از تاریخ',to:'تا تاریخ',
    bucket:'گروه‌بندی',day:'روزانه',weekBucket:'هفتگی',monthBucket:'ماهانه',
    line:'خطی',bar:'ستونی',revenue:'مجموع فروشات راننده',cash:'فروش نقدی',network:'شبکه / کارت',
    entries:'رکوردهای فروش',active:'راننده‌های فعال',average:'اوسط هر رکورد',selling:'راننده‌های دارای فروش',
    growth:'در مقایسه با بازهٔ قبلی هم‌اندازه',comparisonUnavailable:'مقایسه با بازهٔ قبلی در دسترس نیست',
    trend:'روند فروشات',rank:'رتبه‌بندی راننده‌ها',branch:'مقایسهٔ شعبه‌ها',records:'رکورد',
    noData:'در این بازه فروش نهایی راننده ثبت نشده است.',noDrivers:'در این محدوده راننده‌ای ثبت نشده است.',
    unavailable:'بارگذاری فروشات تأییدشده ممکن نشد؛ مجموعات قطعی نیست.',
    retry:'تلاش دوباره',lastUpdated:'فقط رکوردهای کلوزینگ نهایی',details:'مدیریت راننده‌ها',
    noRevenue:'فقط نقد و شبکهٔ ثبت‌شده در فروشات نهایی راننده حساب شده‌اند.',
    mismatch:'جمع نقد و شبکه با مجموع فروش برابر نیست؛ کلوزینگ‌ها بررسی شوند.',
    invalidRange:'تاریخ درست در بازهٔ حداکثر ۳۷۱ روز انتخاب کنید.',currencyHint:'ارز مطابق تنظیمات سازمان است.',
    previous:'قبلی',current:'جاری',chart:'نوع نمودار',filter:'فیلترهای تحلیل',
  },
  ar: {
    title:'مبيعات السائقين · تحليلات ERP',subtitle:'مبيعات السائقين المعتمدة مشمولة في إجمالي المبيعات وليست إيراداً إضافياً',
    today:'اليوم',yesterday:'أمس',week:'هذا الأسبوع',month:'هذا الشهر',
    '3m':'٣ أشهر','6m':'٦ أشهر','9m':'٩ أشهر',year:'هذه السنة',custom:'فترة مخصصة',
    driver:'السائق',allDrivers:'جميع السائقين',allBranches:'كل الفروع',from:'من',to:'إلى',
    bucket:'التجميع',day:'يومي',weekBucket:'أسبوعي',monthBucket:'شهري',
    line:'خطي',bar:'أعمدة',revenue:'إجمالي مبيعات السائقين',cash:'نقدي',network:'شبكة / نقاط البيع',
    entries:'قيود البيع',active:'السائقون النشطون',average:'متوسط القيد',selling:'السائقون الذين باعوا',
    growth:'مقارنة بفترة سابقة مساوية',comparisonUnavailable:'المقارنة بالفترة السابقة غير متاحة',
    trend:'اتجاه المبيعات',rank:'ترتيب السائقين',branch:'مقارنة الفروع',records:'قيود',
    noData:'لا توجد مبيعات سائقين معتمدة لهذه الفترة.',noDrivers:'لا يوجد سائقون في هذا النطاق.',
    unavailable:'تعذر تحميل مبيعات السائقين المعتمدة؛ الأرقام غير مؤكدة.',
    retry:'إعادة المحاولة',lastUpdated:'قيود الإقفال النهائي فقط',details:'إدارة السائقين',
    noRevenue:'تُحسب المبيعات النقدية والشبكة من إقفالات السائقين المعتمدة فقط.',
    mismatch:'إجمالي النقد والشبكة لا يطابق المبيعات؛ راجع الإقفالات.',
    invalidRange:'اختر فترة صحيحة لا تزيد عن ٣٧١ يوماً.',currencyHint:'العملة حسب إعدادات المؤسسة.',
    previous:'السابق',current:'الحالي',chart:'نوع الرسم',filter:'فلاتر التحليل',
  },
};
const n = value => Number(value) || 0;
const safeRows = value => Array.isArray(value) ? value : [];

function Money({ amount, currency, lang }) {
  const locale = lang === 'ar' ? 'ar-SA' : lang === 'fa' ? 'fa-IR' : 'en-US';
  return <span dir="ltr" className="inline-block tabular-nums">{new Intl.NumberFormat(locale,{maximumFractionDigits:2,minimumFractionDigits:2}).format(n(amount))} {currency || 'SAR'}</span>;
}

function Kpi({ icon:Icon, label, value, tone='blue' }) {
  const hues={blue:'bg-blue-50 text-blue-700 dark:bg-blue-950/35 dark:text-blue-300',
    green:'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300',
    violet:'bg-violet-50 text-violet-700 dark:bg-violet-950/35 dark:text-violet-300'};
  return <div className="min-w-0 rounded-2xl border border-border/70 bg-card p-3">
    <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground"><span className={'rounded-lg p-1.5 '+(hues[tone]||hues.blue)}><Icon className="h-4 w-4"/></span><span>{label}</span></div>
    <p className="mt-2 break-words text-base font-black text-foreground sm:text-lg">{value}</p>
  </div>;
}

function ResultsTable({ rows, title, currency, lang, t, type }) {
  const isBranch=type==='branch';
  return <div className="min-w-0 rounded-2xl border border-border bg-card p-3 sm:p-4">
    <h3 className="text-sm font-black text-foreground">{title}</h3>
    {!rows.length?<p className="mt-3 text-xs text-muted-foreground">{isBranch?t.noData:t.noDrivers}</p>:
      <div className="mt-3 space-y-2">
        {rows.slice(0,8).map((row,i)=><div key={row.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/35 px-2.5 py-2">
          <span className="w-5 shrink-0 text-xs font-black text-muted-foreground">{i+1}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-foreground">{isBranch?row.name:row.name}</div>
            {!isBranch&&<p className="truncate text-[10px] text-muted-foreground">{row.branch_name}</p>}
            <p className="text-[10px] text-muted-foreground">{n(row.entries)} {t.records} · {t.cash} {n(row.cash).toFixed(2)} · {t.network} {n(row.network).toFixed(2)}</p>
          </div>
          <span className="shrink-0 text-xs font-black text-foreground"><Money amount={row.revenue} currency={currency} lang={lang}/></span>
        </div>)}
      </div>}
  </div>;
}

export default function OwnerDriverSalesCard({ restaurantId, branchId, branchLabel, lang='en', currency='SAR' }) {
  const t=LABELS[lang]||LABELS.en;
  const navigate=useNavigate();
  const queryClient=useQueryClient();
  const [period,setPeriod]=useState('month');
  const [bucket,setBucket]=useState('day');
  const [driverId,setDriverId]=useState('');
  const [chartKind,setChartKind]=useState('line');
  const [customFrom,setCustomFrom]=useState('');
  const [customTo,setCustomTo]=useState('');
  const [driverOptions,setDriverOptions]=useState([]);
  const range=useMemo(()=>ownerDriverDateRange(period,new Date(),customFrom,customTo),[period,customFrom,customTo]);
  const previous=useMemo(()=>previousOwnerDriverRange(range),[range]);
  const branch=branchId && branchId!=='all'?branchId:null;

  const request = async (windowRange) => {
    const {data,error}=await supabase.rpc('erp_owner_driver_sales_analytics',{
      p_restaurant_id:restaurantId,p_branch_id:branch,p_driver_id:driverId||null,
      p_from:windowRange.from,p_to:windowRange.to,p_bucket:bucket,
    });
    if(error)throw error;
    if(!data || !data.totals || !Array.isArray(data.trend) || !Array.isArray(data.drivers))
      throw new Error('Invalid Driver Sales Analytics response');
    return data;
  };
  const enabled=Boolean(restaurantId && range && previous);
  const current=useQuery({
    queryKey:['owner-driver-sales',restaurantId,branch,driverId,range?.from,range?.to,bucket],
    queryFn:()=>request(range),enabled,staleTime:30000,refetchInterval:90000,retry:1,
  });
  const prior=useQuery({
    queryKey:['owner-driver-sales',restaurantId,branch,driverId,previous?.from,previous?.to,bucket],
    queryFn:()=>request(previous),enabled,staleTime:60000,retry:1,
  });

  useEffect(()=>{
    if(!driverId && current.data?.drivers) setDriverOptions(current.data.drivers);
  },[driverId,current.data?.drivers]);

  useEffect(()=>{
    if(!restaurantId)return;
    const invalidate=()=>queryClient.invalidateQueries({queryKey:['owner-driver-sales',restaurantId]});
    const channel=supabase.channel('owner-driver-analytics-'+restaurantId+'-'+(branch||'all'))
      .on('postgres_changes',{event:'*',schema:'public',table:'driver_sales_entries',filter:'restaurant_id=eq.'+restaurantId},invalidate)
      .on('postgres_changes',{event:'*',schema:'public',table:'drivers',filter:'restaurant_id=eq.'+restaurantId},invalidate)
      .on('postgres_changes',{event:'*',schema:'public',table:'daily_sales',filter:'restaurant_id=eq.'+restaurantId},invalidate)
      .subscribe();
    return ()=>{supabase.removeChannel(channel);};
  },[restaurantId,branch,queryClient]);

  const totals=current.data?.totals;
  const before=prior.data?.totals;
  const growth=ownerDriverGrowth(totals?.revenue,before?.revenue);
  const trend=safeRows(current.data?.trend).map(row=>({
    ...row,revenue:n(row.revenue),cash:n(row.cash),network:n(row.network),
    label:String(row.date||'').slice(5),
  }));
  const amount=(value)=><Money amount={value} currency={currency} lang={lang}/>;
  const loading=enabled && current.isPending;
  const failed=current.isError || (enabled && !loading && !current.data);
  const invalid=!range;
  const handleRefresh=()=>queryClient.invalidateQueries({queryKey:['owner-driver-sales',restaurantId]});
  const yearMax=new Date().toISOString().slice(0,10);

  return <section data-testid="owner-driver-sales-analytics" aria-label={t.title} className="min-w-0 space-y-3 overflow-hidden rounded-[1.45rem] border border-blue-200/80 bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/20 p-3 shadow-sm dark:border-blue-900/70 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/30 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="rounded-xl bg-blue-600 p-2.5 text-white"><Truck className="h-5 w-5"/></span>
        <div className="min-w-0"><h2 className="text-base font-black text-foreground sm:text-lg">{t.title}</h2>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{t.subtitle}</p></div>
      </div>
      <div className="flex gap-2">
        <button type="button" aria-label={t.retry} onClick={handleRefresh} className="rounded-xl border border-border bg-card p-2.5 hover:bg-muted"><RefreshCw className={'h-4 w-4 '+(current.isFetching?'animate-spin':'')}/></button>
        <button type="button" onClick={()=>navigate('/driver-management')} className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted">{t.details}<ExternalLink className="h-3.5 w-3.5"/></button>
      </div>
    </div>

    <div data-testid="owner-driver-sales-filters" className="flex min-w-0 flex-wrap items-end gap-2 rounded-2xl border border-border/60 bg-card/80 p-2.5">
      <label className="min-w-0 flex-1 basis-[130px] text-[11px] font-semibold text-muted-foreground"><span>{t.filter}</span>
        <select aria-label={t.filter} value={period} onChange={e=>{const next=e.target.value;setPeriod(next);setBucket(['6m','9m','year'].includes(next)?'month':next==='3m'?'week':'day');}} className="mt-1 block h-10 w-full rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-foreground">
          {OWNER_DRIVER_PERIODS.map(key=><option key={key} value={key}>{t[key]}</option>)}
        </select>
      </label>
      <label className="min-w-0 flex-1 basis-[130px] text-[11px] font-semibold text-muted-foreground"><span>{t.driver}</span>
        <select aria-label={t.driver} value={driverId} onChange={e=>setDriverId(e.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-foreground">
          <option value="">{t.allDrivers}</option>
          {driverOptions.map(row=><option key={row.id} value={row.id}>{row.name} · {row.branch_name}</option>)}
        </select>
      </label>
      <label className="min-w-0 flex-1 basis-[110px] text-[11px] font-semibold text-muted-foreground"><span>{t.bucket}</span>
        <select aria-label={t.bucket} value={bucket} onChange={e=>setBucket(e.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-foreground">
          <option value="day">{t.day}</option><option value="week">{t.weekBucket}</option><option value="month">{t.monthBucket}</option>
        </select>
      </label>
      <label className="min-w-0 flex-1 basis-[90px] text-[11px] font-semibold text-muted-foreground"><span>{t.chart}</span>
        <select aria-label={t.chart} value={chartKind} onChange={e=>setChartKind(e.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-foreground">
          <option value="line">{t.line}</option><option value="bar">{t.bar}</option>
        </select>
      </label>
      {period==='custom'&&<div className="flex w-full flex-wrap gap-2">
        <label className="min-w-0 flex-1 text-[11px] font-semibold text-muted-foreground">{t.from}<input aria-label={t.from} type="date" max={customTo||yearMax} value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-2 text-xs text-foreground"/></label>
        <label className="min-w-0 flex-1 text-[11px] font-semibold text-muted-foreground">{t.to}<input aria-label={t.to} type="date" min={customFrom||undefined} max={yearMax} value={customTo} onChange={e=>setCustomTo(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-2 text-xs text-foreground"/></label>
      </div>}
    </div>

    <p className="text-[11px] text-muted-foreground"><CalendarDays className="me-1 inline h-3.5 w-3.5"/>{range?range.from+' — '+range.to:t.invalidRange} · {branchLabel||t.allBranches} · {t.lastUpdated}</p>
    {invalid&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{t.invalidRange}</p>}
    {loading&&<div role="status" className="animate-pulse rounded-xl border border-border p-6 text-sm text-muted-foreground">{t.title}…</div>}
    {failed&&<div role="alert" className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-bold text-red-800"><AlertTriangle className="h-4 w-4"/>{t.unavailable}<button type="button" onClick={handleRefresh} className="ms-auto underline">{t.retry}</button></div>}
    {!invalid&&!loading&&!failed&&totals&&<>
      <div data-testid="owner-driver-sales-kpis" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
        <Kpi label={t.revenue} icon={BarChart3} value={amount(totals.revenue)}/>
        <Kpi label={t.cash} icon={Wallet} tone="green" value={amount(totals.cash)}/>
        <Kpi label={t.network} icon={CreditCard} tone="violet" value={amount(totals.network)}/>
        <Kpi label={t.entries} icon={ReceiptText} value={n(totals.entries).toLocaleString()}/>
        <Kpi label={t.active} icon={Truck} value={safeRows(current.data.drivers).filter(x=>x.active).length}/>
        <Kpi label={t.selling} icon={Users} value={n(totals.selling_drivers).toLocaleString()}/>
        <Kpi label={t.average} icon={Activity} value={amount(n(totals.entries)?n(totals.revenue)/n(totals.entries):0)}/>
        <Kpi label={t.previous} icon={BarChart3} value={prior.isError?'—':prior.isPending?'…':amount(before?.revenue)}/>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {prior.isError?<span className="font-semibold text-amber-700">{t.comparisonUnavailable}</span>:
          !prior.isPending&&growth!==null&&<span data-testid="owner-driver-growth" className={'inline-flex items-center gap-1 font-bold '+(growth>=0?'text-emerald-700':'text-rose-700')}>
            {growth>=0?<ArrowUpRight className="h-4 w-4"/>:<ArrowDownRight className="h-4 w-4"/>}{growth.toFixed(1)}% {t.growth}
          </span>}
        <span className="ms-auto text-muted-foreground">{t.currencyHint}</span>
      </div>
      {!ownerDriverReconciliation(current.data)&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{t.mismatch}</p>}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <h3 className="text-sm font-black text-foreground">{t.trend}</h3>
        {(!trend.length||n(totals.entries)===0)?<p className="py-8 text-center text-xs text-muted-foreground">{t.noData}</p>:
        <div className="mt-3 h-60 w-full min-w-0 sm:h-72" data-testid="owner-driver-sales-trend">
          <ResponsiveContainer width="100%" height="100%">
            {chartKind==='bar'?<BarChart data={trend} margin={{top:8,right:4,left:-18,bottom:2}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3}/>
              <XAxis dataKey="label" tick={{fontSize:10}} minTickGap={15}/>
              <YAxis tick={{fontSize:10}} width={45}/>
              <Tooltip formatter={(v)=>n(v).toFixed(2)} />
              <Legend wrapperStyle={{fontSize:11}}/>
              <Bar name={t.cash} dataKey="cash" stackId="sales" fill="#10b981" maxBarSize={32}/>
              <Bar name={t.network} dataKey="network" stackId="sales" fill="#3b82f6" maxBarSize={32}/>
            </BarChart>:<LineChart data={trend} margin={{top:8,right:4,left:-18,bottom:2}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3}/>
              <XAxis dataKey="label" tick={{fontSize:10}} minTickGap={15}/>
              <YAxis tick={{fontSize:10}} width={45}/>
              <Tooltip formatter={(v)=>n(v).toFixed(2)}/>
              <Legend wrapperStyle={{fontSize:11}}/>
              <Line name={t.revenue} dataKey="revenue" stroke="#6366f1" strokeWidth={2.5} dot={trend.length<13} connectNulls={false}/>
              <Line name={t.cash} dataKey="cash" stroke="#10b981" strokeWidth={2} dot={false}/>
              <Line name={t.network} dataKey="network" stroke="#3b82f6" strokeWidth={2} dot={false}/>
            </LineChart>}
          </ResponsiveContainer>
        </div>}
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <ResultsTable rows={safeRows(current.data.drivers)} title={t.rank} currency={currency} lang={lang} t={t} type="driver"/>
        <ResultsTable rows={safeRows(current.data.branches)} title={t.branch} currency={currency} lang={lang} t={t} type="branch"/>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">{t.noRevenue}</p>
    </>}
  </section>;
}
