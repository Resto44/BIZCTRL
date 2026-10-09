import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, BarChart3, CreditCard, Layers3, TrendingUp } from 'lucide-react';
import { buildERPFinancialPaymentAnalytics } from '@/lib/erpPaymentAnalytics';

const TEXT = {
  en: {
    heading:'Payment channels',overall:'Verified period sales',channels:'Payment distribution',trend:'Payment trend',
    details:'Sales-source details',detailHint:'Operational source breakdown — already included in the payment totals. Do not add these figures to sales again.',
    select:'Tap a source to view its trend',date:'Period',change:'vs previous period',previous:'Previous',now:'Selected period',
    all:'All payments',cash:'Cash sales',network:'Network',credit:'Credit sales',other:'Other',
    noData:'No confirmed payments for this period',noPrevious:'No previous-period baseline',
    reconciled:'Confirmed payments reconcile with sales',mismatch:'Payment totals do not reconcile with verified sales — review sales-source configuration.',
    warning:'Cash sales are not the physical cash left in the drawer.',noSources:'No source details recorded for this period',
  },
  ar: {
    heading:'قنوات الدفع',overall:'مبيعات الفترة المعتمدة',channels:'توزيع المدفوعات',trend:'اتجاه المدفوعات',
    details:'تفاصيل مصادر المبيعات',detailHint:'تفاصيل تشغيلية مشمولة بالفعل في الإجمالي؛ لا تُضاف للمبيعات مرة أخرى.',
    select:'اختر المصدر لعرض اتجاهه',date:'الفترة',change:'مقارنة بالفترة السابقة',previous:'السابق',now:'الفترة المختارة',
    all:'جميع المدفوعات',cash:'مبيعات نقدية',network:'الشبكة',credit:'مبيعات آجلة',other:'أخرى',
    noData:'لا توجد مدفوعات معتمدة في الفترة',noPrevious:'لا توجد بيانات للمقارنة',
    reconciled:'مجموع طرق الدفع يطابق المبيعات المعتمدة',mismatch:'إجمالي طرق الدفع لا يطابق المبيعات — راجع إعدادات المصادر.',
    warning:'المبيعات النقدية ليست النقد المتبقي فعلياً في الصندوق.',noSources:'لا توجد تفاصيل مصادر لهذه الفترة',
  },
  fa: {
    heading:'روش‌های پرداخت',overall:'فروشات نهایی دوره',channels:'ترکیب پرداخت‌ها',trend:'روند پرداخت‌ها',
    details:'جزئیات منابع فروشات',detailHint:'تفکیک عملیاتی است و قبلاً در فروش حساب شده؛ دوباره به مجموع اضافه نمی‌شود.',
    select:'برای دیدن روند، یک منبع را انتخاب کنید',date:'دوره',change:'نسبت به دوره پیشین',previous:'دوره پیشین',now:'دوره انتخاب‌شده',
    all:'تمام پرداخت‌ها',cash:'فروشات نقد',network:'شبکه',credit:'فروشات نسیه',other:'دیگر',
    noData:'پرداخت نهایی برای این دوره وجود ندارد',noPrevious:'دوره قبلی داده ندارد',
    reconciled:'جمع پرداخت‌ها با فروش نهایی برابر است',mismatch:'جمع روش‌های پرداخت با فروش نهایی برابر نیست؛ منابع را بررسی کنید.',
    warning:'فروش نقد، پول باقی‌مانده در صندوق نیست.',noSources:'جزئیات منابع این دوره ثبت نشده',
  },
};
const fmt=(number,currency)=>`${new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(number||0)} ${currency}`;
const changed = (delta, labels) => delta===null ? labels.noPrevious
  : `${delta>0?'+':''}${delta.toFixed(1)}% ${labels.change}`;

function Trend({percentage,copy}) {
  if (percentage === null) return <span className="text-xs text-muted-foreground">{copy.noPrevious}</span>;
  const up=percentage>=0;
  return <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up?'text-emerald-600 dark:text-emerald-400':'text-rose-600 dark:text-rose-400'}`}>
    {up?<ArrowUpRight className="h-3.5 w-3.5"/>:<ArrowDownRight className="h-3.5 w-3.5"/>}
    {Math.abs(percentage).toFixed(1)}% {copy.change}
  </span>;
}

/** Mobile-first ERP analytics; source details do not contribute to canonical donut/bar. */
export default function PaymentAnalyticsERP({
  sales=[], revenueSources=[], snapshot, range, currency='SAR', lang='en',
}) {
  const copy=TEXT[lang]||TEXT.en;
  const [selected,setSelected]=useState('all');
  const report=useMemo(()=>buildERPFinancialPaymentAnalytics({
    sales,revenueSources,snapshot,range,lang,selectedSource:selected,
  }),[sales,revenueSources,snapshot,range,lang,selected]);
  const activeSource=report.sourceSelected;
  const activeChannel=report.channels.find(c=>c.key===selected);
  const selectedKey=activeSource?'source':(activeChannel?selected:'sales');
  const selectedName=activeSource?.name||(activeChannel?copy[activeChannel.key]:copy.all);
  const total=report.total;
  const buckets=report.channels.filter(c=>c.value>0);

  return <div data-testid="erp-payment-analytics" className="min-w-0 space-y-4">
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-blue-700 p-4 text-white sm:p-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-blue-100">
        <CreditCard className="size-4"/>{copy.overall}
      </div>
      <p data-testid="payment-canonical-total" className="mt-2 text-3xl font-black tabular-nums" dir="ltr">{fmt(total,currency)}</p>
      <p className="mt-1 text-[11px] text-blue-200">{range.from} — {range.to}</p>
      <div data-testid="payment-mix-bar" role="img" aria-label={copy.channels}
        className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-white/20" dir="ltr">
        {buckets.map(c=><div key={c.key} style={{width:`${total>0?Math.max(0,c.pct):0}%`,backgroundColor:c.color}} title={`${copy[c.key]} ${c.pct.toFixed(1)}%`}/>)}
      </div>
      <p className="mt-2 text-[11px] text-blue-100">
        {total>0?(report.reconciled?copy.reconciled:copy.mismatch):copy.noData}
      </p>
    </div>

    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {report.channels.map(c=>(
        <button type="button" key={c.key} onClick={()=>setSelected(c.key)}
          data-testid={`payment-bucket-${c.key}`}
          aria-pressed={selected===c.key} className={`min-w-0 rounded-2xl border bg-card p-3 text-start shadow-sm transition focus-visible:outline-2 focus-visible:outline-blue-500 ${selected===c.key?'border-blue-500 ring-1 ring-blue-500':'border-border hover:border-blue-300'}`}>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span className="size-2.5 shrink-0 rounded-full" style={{backgroundColor:c.color}} />{copy[c.key]}
          </div>
          <p className="mt-2 break-words text-lg font-black tabular-nums text-foreground" dir="ltr">{fmt(c.value,currency)}</p>
          <p className="mt-1 text-xs font-bold tabular-nums text-muted-foreground" dir="ltr">{c.pct.toFixed(1)}%</p>
          <div className="mt-1"><Trend percentage={c.change} copy={copy}/></div>
        </button>
      ))}
    </div>

    <div className="min-w-0 overflow-hidden rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <TrendingUp className="size-4 text-blue-600"/>{copy.trend}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{selectedName}</p>
        </div>
        <button type="button" onClick={()=>setSelected('all')} aria-pressed={selected==='all'}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${selected==='all'?'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200':'text-muted-foreground'}`}>
          {copy.all}
        </button>
      </div>
      {report.trend.length>0 ? (
        <div data-testid="payment-trend-chart" className="h-48 w-full min-w-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={report.trend} margin={{top:8,right:8,left:-26,bottom:0}}>
              <defs><linearGradient id="erpPaymentArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28}/>
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.015}/>
              </linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false}/>
              <XAxis dataKey="date" tick={{fontSize:10}} axisLine={false} tickLine={false}
                tickFormatter={x=>x?.slice(5)||x} minTickGap={20}/>
              <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} width={52} tickFormatter={v=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v)}/>
              <Tooltip formatter={value=>fmt(value,currency)} labelFormatter={date=>date}/>
              <Area name={selectedName} type="monotone" dataKey={selectedKey}
                stroke="#2563eb" strokeWidth={2.5} fill="url(#erpPaymentArea)" dot={report.trend.length<=9?{r:2.5}:false} activeDot={{r:5}}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ):<p className="py-5 text-center text-xs text-muted-foreground">{copy.noData}</p>}
    </div>

    <div className="min-w-0 rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex items-start gap-2">
        <Layers3 className="mt-0.5 size-4 shrink-0 text-violet-600"/>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">{copy.details}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.detailHint}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{copy.select}</p>
        </div>
      </div>
      <div data-testid="payment-source-list" className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {report.sources.length===0&&<p className="py-4 text-center text-sm text-muted-foreground">{copy.noSources}</p>}
        {report.sources.map((source,index)=>(
          <button type="button" key={source.key} aria-pressed={selected===source.key}
            onClick={()=>setSelected(source.key)}
            className={`min-w-0 rounded-xl border p-3 text-start transition ${selected===source.key?'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30':'border-border bg-muted/15 hover:border-blue-300'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold leading-snug text-foreground">{source.name}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{copy.now}</p>
              </div>
              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">{String(index+1).padStart(2,'0')}</span>
            </div>
            <p className="mt-1 text-xl font-black tabular-nums text-foreground" dir="ltr">{fmt(source.value,currency)}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
              <span className="text-[11px] text-muted-foreground">{copy.previous}: <strong className="tabular-nums">{fmt(source.previous,currency)}</strong></span>
              <Trend percentage={source.change} copy={copy}/>
            </div>
          </button>
        ))}
      </div>
    </div>
    <p className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-xs leading-relaxed text-slate-600 dark:border-blue-900 dark:bg-blue-950/30 dark:text-slate-300">
      <BarChart3 className="me-1 inline size-3.5"/>{copy.warning}
    </p>
  </div>;
}
