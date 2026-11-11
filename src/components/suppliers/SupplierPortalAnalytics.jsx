import React,{useMemo,useState} from 'react';
import { BarChart3,CalendarDays,CheckCircle2,Clock3,FileText,Truck,Wallet } from 'lucide-react';
import { riyadhDate,supplierPeriodRange,supplierPortalAnalytics } from '@/lib/supplierPortalAnalytics';

const WORDS={
 en:{title:'Supplier analytics',hint:'Real orders, invoices and payments in your assigned branch',tz:'Saudi Arabia time',today:'Today',week:'7 days',month:'This month',three:'3 months',six:'6 months',year:'12 months',custom:'Custom',from:'From',to:'To',
  orders:'Orders created',shipped:'Awaiting Owner verification',completed:'Received orders',invoices:'Invoices issued',payments:'Payment transactions',
  invoiced:'Invoiced',paid:'Payments received',balance:'Outstanding on selected invoices',overdue:'Overdue on selected invoices',
  trend:'Order activity trend',invoiceTrend:'Invoices vs payments',none:'No records in this period',invalid:'Choose valid dates, from before to (maximum two years)',by:'Grouped',period:'Period'},
 ar:{title:'تحليلات حساب المورّد',hint:'طلبات وفواتير ودفعات حقيقية ضمن الفرع المعيّن',tz:'التواريخ بتوقيت السعودية',today:'اليوم',week:'٧ أيام',month:'هذا الشهر',three:'٣ أشهر',six:'٦ أشهر',year:'١٢ شهراً',custom:'مخصص',from:'من',to:'إلى',
  orders:'طلبات جديدة',shipped:'بانتظار اعتماد المالك',completed:'طلبات مستلمة',invoices:'فواتير صادرة',payments:'عمليات دفع',
  invoiced:'الفواتير',paid:'دفعات مستلمة',balance:'المتبقي من فواتير الفترة',overdue:'المتأخر من فواتير الفترة',
  trend:'اتجاه الطلبات',invoiceTrend:'الفواتير مقابل الدفعات',none:'لا توجد سجلات في الفترة',invalid:'حدد تاريخ بداية ونهاية صحيحين (بحد أقصى سنتين)',by:'التجميع',period:'الفترة'},
 fa:{title:'تحلیل حساب سپلایر',hint:'سفارش‌ها، فاکتورها و پرداخت‌های واقعی شعبهٔ شما',tz:'تاریخ‌ها به وقت عربستان',today:'امروز',week:'۷ روز',month:'این ماه',three:'۳ ماه',six:'۶ ماه',year:'۱۲ ماه',custom:'دلخواه',from:'از',to:'تا',
  orders:'سفارش جدید',shipped:'در انتظار تأیید اونر',completed:'سفارش دریافت‌شده',invoices:'فاکتور ثبت‌شده',payments:'تراکنش پرداخت',
  invoiced:'مجموع فاکتورها',paid:'پرداخت دریافت‌شده',balance:'ماندهٔ فاکتورهای دوره',overdue:'معوقهٔ فاکتورهای دوره',
  trend:'روند سفارش‌ها',invoiceTrend:'فاکتورها و پرداخت‌ها',none:'در این دوره ریکوردی نیست',invalid:'تاریخ شروع و پایان معتبر انتخاب کنید (حداکثر دو سال)',by:'گروه‌بندی',period:'دوره'}
};
const n=(v,dec=0)=>Number(v||0).toLocaleString(undefined,{minimumFractionDigits:dec,maximumFractionDigits:dec});
const periods=['today','7d','month','3m','6m','12m','custom'];

export default function SupplierPortalAnalytics({orders=[],invoices=[],payments=[],lang='en',loading=false,onOpenOrders,onOpenInvoices}){
 const t=WORDS[lang]||WORDS.en;
 const [period,setPeriod]=useState('month');
 const [custom,setCustom]=useState(()=>supplierPeriodRange('7d',riyadhDate()));
 const data=useMemo(()=>supplierPortalAnalytics({orders,invoices,payments,period,custom}),[orders,invoices,payments,period,custom]);
 const kpi=[
  {key:'orders',value:data.orders,icon:FileText,run:onOpenOrders},
  {key:'shipped',value:data.awaitingOwner,icon:Clock3,run:onOpenOrders},
  {key:'completed',value:data.received,icon:CheckCircle2,run:onOpenOrders},
  {key:'invoices',value:data.invoices,icon:FileText,run:onOpenInvoices},
  {key:'payments',value:data.paymentRecords,icon:Wallet,run:onOpenInvoices}
 ];
 const max=Math.max(1,...(data.trend||[]).map(d=>Math.max(d.orders,d.completed)));
 return <section data-testid="supplier-erp-analytics" className="min-w-0 space-y-3 rounded-3xl border border-slate-200 bg-slate-100/75 p-3 dark:border-slate-800 dark:bg-slate-900/70 sm:p-5">
  <header className="min-w-0"><div className="flex min-w-0 items-center gap-2">
   <BarChart3 className="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-300"/>
   <h2 className="min-w-0 text-lg font-black leading-tight text-slate-900 dark:text-white">{t.title}</h2>
  </div>
  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{t.hint}</p>
  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><CalendarDays className="size-3.5"/>{t.tz}</p></header>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t.period}>
   {periods.map((p,i)=><button key={p} type="button" data-testid={'supplier-analytics-period-'+p}
     aria-pressed={period===p} onClick={()=>setPeriod(p)}
     className={'min-h-11 rounded-xl border px-2 py-2 text-sm font-bold '+(period===p
       ?'border-blue-600 bg-blue-600 text-white':'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white')}>
     {[t.today,t.week,t.month,t.three,t.six,t.year,t.custom][i]}
   </button>)}
  </div>
  {period==='custom'&&<div className="grid grid-cols-2 gap-2">
   {[['from',t.from],['to',t.to]].map(([key,label])=><label key={key} className="min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200">{label}
    <input type="date" className="mt-1 min-h-11 w-full min-w-0 rounded-xl border bg-white px-2 text-sm text-slate-950" value={custom[key]}
      onChange={e=>setCustom(s=>({...s,[key]:e.target.value}))}/>
   </label>)}
  </div>}
  {data.invalid?<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{t.invalid}</p>:<>
   <p className="text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300" dir="ltr">{data.range.from} — {data.range.to} · {t.by}: {data.granularity}</p>
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {kpi.map(k=><button key={k.key} type="button" onClick={k.run} disabled={loading}
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 text-start shadow-sm focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-2 flex items-center justify-between"><k.icon className="size-4 text-teal-700 dark:text-teal-300"/>{loading&&<span className="text-xs">…</span>}</div>
      <p className="text-xl font-extrabold tabular-nums">{loading?'…':n(k.value)}</p>
      <p className="mt-1 break-words text-xs font-semibold leading-4 text-slate-600 dark:text-slate-300">{t[k.key]}</p>
    </button>)}
   </div>
   <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
    <h3 className="text-sm font-bold">{t.trend}</h3>
    {!data.trend.length?<p className="mt-2 text-xs text-slate-500">{t.none}</p>:<div className="mt-3 flex min-h-36 items-end gap-1.5 overflow-x-auto pb-1" role="img" aria-label={t.trend}>
      {data.trend.map(row=><div key={row.date} title={row.date+': '+row.orders+' / '+row.completed} className="flex min-w-9 flex-1 flex-col items-center gap-1">
       <span className="text-[10px] font-bold tabular-nums text-slate-600">{row.orders}</span>
       <div className="flex h-24 w-full items-end justify-center gap-0.5">
        <div className="w-3 rounded-t-sm bg-blue-500" style={{height:Math.max(2,row.orders/max*96)+'px'}}/>
        <div className="w-2 rounded-t-sm bg-emerald-500" style={{height:Math.max(2,row.completed/max*96)+'px'}}/>
       </div>
       <span className="max-w-full truncate text-center text-[9px] text-slate-500" dir="ltr">{row.date.slice(5)}</span>
      </div>)}
     </div>}
    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-600 dark:text-slate-300">
     <span> <span className="inline-block size-2.5 rounded-sm bg-blue-500"/> {t.orders}</span>
     <span> <span className="inline-block size-2.5 rounded-sm bg-emerald-500"/> {t.completed}</span>
    </div>
   </div>
   {!data.currencies.length?<p className="text-xs text-slate-500 dark:text-slate-400">{t.none}</p>:
    data.currencies.map(c=>{
     const maxAmount=Math.max(1,...c.trend.flatMap(row=>[row.invoiced,row.paid]));
     return <div key={c.currency} className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950" data-testid={'supplier-analytics-currency-'+c.currency}>
      <h3 className="text-sm font-bold">{c.currency} · {t.invoiceTrend}</h3>
      <div className="grid grid-cols-2 gap-2">
       {[[t.invoiced,c.invoiced],[t.paid,c.paid],[t.balance,c.outstanding],[t.overdue,c.overdue]].map(([label,amount])=>
        <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-900">
         <p className="text-[11px] leading-4 text-slate-600 dark:text-slate-300">{label}</p>
         <strong dir="ltr" className="mt-1 block break-words text-start text-sm font-black tabular-nums">{n(amount,2)} {c.currency}</strong>
        </div>)}
      </div>
      {c.trend.length>0&&<div className="flex min-h-32 items-end gap-1.5 overflow-x-auto" role="img" aria-label={t.invoiceTrend}>
       {c.trend.map(x=><div key={x.date} title={x.date+' · '+n(x.invoiced,2)+' / '+n(x.paid,2)} className="flex min-w-9 flex-1 flex-col items-center gap-1">
        <div className="flex h-24 items-end justify-center gap-0.5">
         <div className="w-3 rounded-t-sm bg-blue-500" style={{height:Math.max(2,x.invoiced/maxAmount*96)+'px'}}/>
         <div className="w-2 rounded-t-sm bg-emerald-500" style={{height:Math.max(2,x.paid/maxAmount*96)+'px'}}/>
        </div>
        <span dir="ltr" className="text-[9px] text-slate-500">{x.date.slice(5)}</span>
       </div>)}
      </div>}
      <div className="flex gap-3 text-[11px] text-slate-600 dark:text-slate-300">
       <span><span className="inline-block size-2.5 rounded-sm bg-blue-500"/> {t.invoiced}</span>
       <span><span className="inline-block size-2.5 rounded-sm bg-emerald-500"/> {t.paid}</span>
      </div>
     </div>;
    })}
  </>}
 </section>;
}
