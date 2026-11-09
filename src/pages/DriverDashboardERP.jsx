import React, {useMemo,useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {format,startOfDay,startOfWeek,startOfMonth,startOfYear,subMonths} from 'date-fns';
import {useAuth} from '@/lib/AuthContext';
import {useLanguage} from '@/lib/LanguageContext';
import {supabase} from '@/api/supabaseClient';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card,CardContent} from '@/components/ui/card';
import {toast} from 'sonner';
import {
  Truck,Wallet, CreditCard,TrendingUp,CalendarDays,RefreshCw,
  ShieldCheck,ClipboardList,ReceiptText,BarChart3,LogOut,CheckCircle2,
  AlertTriangle,Clock,PackageCheck
} from 'lucide-react';

// A driver's declaration must NEVER become a second Sales Closing or cash count.
// The canonical server snapshot includes only finalized entries from finalized
// or locked closings. No tenant/branch/driver ID is accepted from the browser.
const COPY={
 en:{title:'Driver workspace',subtitle:'Your own delivery activity and finalized sales',dashboard:'Overview',
 sales:'Sales history',orders:'Deliveries',reports:'Daily reports',today:'Today',week:'Week',
 month:'Month',three:'3 months',six:'6 months',year:'Year',cash:'Cash sales',network:'Card / Network',
 total:'Finalized sales',entries:'Sales records',cashShare:'Cash share',average:'Average per entry',
 trend:'Sales trend',noTrend:'No finalized sales in this period.',recent:'Recent sales',
 noSales:'No finalized driver sales found. Your daily declaration does not add revenue.',
 refresh:'Refresh',logout:'Sign out',emptyOrders:'No assigned deliveries for this period.',
 daily:'Daily cash and network report',date:'Date',cashInput:'Cash collected',networkInput:'Network collected',
 notes:'Notes (optional)',save:'Submit daily report',sending:'Submitting…',status:'Status',
 pending:'Awaiting manager review',reviewed:'Reviewed',matched:'Matched to finalized closing',
 rejected:'Rejected — update and resubmit',noReports:'No daily reports submitted.',
 pendingHelp:'These reports are not yet sales. Only the manager\'s finalized closing records revenue.',
 difference:'Only manager-matched final closings are counted as sales.',submitted:'Report saved for manager review',
 refreshError:'Could not load your own driver records. Retry or contact your Owner.',
 saveError:'Could not submit your report',invalid:'Enter valid nonnegative cash and network amounts with no more than two decimals; at least one must be positive.',
 history:'Your reporting history',order:'Delivery',unknown:'Not recorded',salesSplit:'Cash / Network split',
 activity:'Assigned deliveries',reportStatus:'Declaration status',id:'Driver code',
 confirm:'Confirmed final sales',explanation:'The report is your declared collections; only a finalized sales closing affects business revenue.',
 update:'Update pending report',salesNote:'Figures include finalized driver entries only and do not add delivery orders a second time.'},
 ar:{title:'بوابة السائق',subtitle:'نشاط التوصيل والمبيعات المعتمدة الخاصة بك',dashboard:'نظرة عامة',
 sales:'سجل المبيعات',orders:'التوصيلات',reports:'التقرير اليومي',today:'اليوم',week:'أسبوع',
 month:'شهر',three:'٣ أشهر',six:'٦ أشهر',year:'سنة',cash:'المبيعات النقدية',network:'الشبكة',
 total:'المبيعات المعتمدة',entries:'قيود البيع',cashShare:'حصة النقد',average:'متوسط القيد',
 trend:'اتجاه المبيعات',noTrend:'لا توجد مبيعات معتمدة في هذه الفترة.',recent:'آخر المبيعات',
 noSales:'لا توجد مبيعات توصيل نهائية. إقرار السائق لا يضيف إيراداً.',
 refresh:'تحديث',logout:'خروج',emptyOrders:'لا توجد توصيلات مسندة في هذه الفترة.',
 daily:'تقرير النقد والشبكة اليومي',date:'التاريخ',cashInput:'النقد المستلم',networkInput:'الشبكة المستلمة',
 notes:'ملاحظات (اختياري)',save:'إرسال التقرير',sending:'جار الإرسال…',status:'الحالة',
 pending:'بانتظار مراجعة المدير',reviewed:'تمت المراجعة',matched:'مطابق لإقفال البيع النهائي',
 rejected:'مرفوض — عدّل وأعد الإرسال',noReports:'لا توجد تقارير يومية.',
 pendingHelp:'الإقرارات ليست مبيعات جديدة. الإيرادات تعتمد فقط بعد إقفال المدير.',
 difference:'تحتسب مبيعات الإقفال النهائي المطابق فقط.',submitted:'حُفظ التقرير لمراجعة المدير',
 refreshError:'تعذر تحميل سجلات السائق. حدّث أو تواصل مع المالك.',
 saveError:'تعذر إرسال التقرير',invalid:'أدخل النقد والشبكة بمبالغ غير سالبة ومنزلتين عشريتين على الأكثر، وإحداهما أكبر من الصفر.',
 history:'سجل تقاريرك',order:'توصيل',unknown:'غير مسجل',salesSplit:'توزيع النقد والشبكة',
 activity:'التوصيلات المسندة',reportStatus:'حالة التقرير',id:'رقم السائق',
 confirm:'مبيعات معتمدة',explanation:'هذا التقرير يصرّح بالمبالغ المستلمة؛ لا يُسجل الإيراد إلا عبر إقفال المبيعات النهائي.',
 update:'تحديث التقرير المعلق',salesNote:'الأرقام من مبيعات السائق النهائية ولا تُضاف قيمة التوصيل مرة أخرى.'},
 fa:{title:'پورتال راننده',subtitle:'فروشات نهایی و فعالیت دلیوری مربوط به خودت',dashboard:'نمای کلی',
 sales:'تاریخچه فروش',orders:'دلیوری‌ها',reports:'گزارش روزانه',today:'امروز',week:'هفته',
 month:'ماه',three:'۳ ماه',six:'۶ ماه',year:'سال',cash:'فروش نقدی',network:'شبکه / کارت',
 total:'فروش نهایی',entries:'رکورد فروش',cashShare:'سهم نقد',average:'میانگین هر رکورد',
 trend:'روند فروشات',noTrend:'در این دوره فروش نهایی وجود ندارد.',recent:'آخرین فروشات',
 noSales:'هنوز فروش نهایی راننده ثبت نشده؛ گزارش راننده درآمد جدید نمی‌سازد.',
 refresh:'تازه‌سازی',logout:'خروج',emptyOrders:'دلیوری مربوط به شما در این دوره وجود ندارد.',
 daily:'گزارش روزانهٔ نقد و شبکه',date:'تاریخ',cashInput:'نقد دریافت‌شده',networkInput:'شبکه دریافت‌شده',
 notes:'یادداشت (اختیاری)',save:'ارسال گزارش',sending:'در حال ارسال…',status:'وضعیت',
 pending:'منتظر بررسی مدیر',reviewed:'بررسی‌شده',matched:'مطابق کلوزینگ نهایی',
 rejected:'رد شده — اصلاح و ارسال کن',noReports:'گزارش روزانه ثبت نشده است.',
 pendingHelp:'این گزارش درآمد جدید نیست. تنها کلوزینگ نهایی مدیر به فروش اضافه می‌شود.',
 difference:'فقط فروشات تأییدشده در کلوزینگ محاسبه می‌شود.',submitted:'گزارش برای بررسی مدیر ذخیره شد',
 refreshError:'دریافت رکوردهای راننده ممکن نشد؛ تازه‌سازی کن یا به مالک خبر بده.',
 saveError:'ثبت گزارش ناموفق بود',invalid:'مبالغ نقد و شبکه را غیرمنفی و حداکثر با دو رقم اعشار وارد کن؛ یکی باید بیشتر از صفر باشد.',
 history:'تاریخچه گزارش‌ها',order:'دلیوری',unknown:'ثبت نشده',salesSplit:'تقسیم نقد و شبکه',
 activity:'دلیوری‌های تعیین‌شده',reportStatus:'حالت گزارش',id:'کد راننده',
 confirm:'فروش نهایی',explanation:'این گزارش فقط اظهار پول دریافتی است؛ درآمد صرف در کلوزینگ نهایی فروش ثبت می‌شود.',
 update:'اصلاح گزارش منتظر بررسی',salesNote:'این مبالغ فقط از کلوزینگ نهایی هستند؛ فروشات دلیوری دوباره اضافه نمی‌شود.'}
};
const PERIODS=['today','week','month','three','six','year'];
function localDate(date){return format(date,'yyyy-MM-dd')}
function rangeFor(period,now=new Date()){
 const today=startOfDay(now);
 const start=period==='today'?today:period==='week'?startOfWeek(today,{weekStartsOn:1}):
   period==='month'?startOfMonth(today):period==='three'?startOfDay(subMonths(today,3)):
   period==='six'?startOfDay(subMonths(today,6)):startOfYear(today);
 return {from:localDate(start),to:localDate(today)};
}
function money(value){const n=Number(value);return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}
function amountValid(value){const s=String(value||'').trim();return /^\d+(?:\.\d{1,2})?$/.test(s)&&Number(s)<=1000000}
const colors={pending:'border-amber-200 bg-amber-50 text-amber-800',reviewed:'border-blue-200 bg-blue-50 text-blue-800',matched:'border-emerald-200 bg-emerald-50 text-emerald-800',rejected:'border-rose-200 bg-rose-50 text-rose-800'};
export default function DriverDashboardERP(){
 const {user,logout}=useAuth();
 const {lang='en',isRTL=false}=useLanguage()||{};
 const t=COPY[lang]||COPY.en;
 const qc=useQueryClient();
 const [period,setPeriod]=useState('month');
 const [tab,setTab]=useState('dashboard');
 const [cash,setCash]=useState('');
 const [network,setNetwork]=useState('');
 const [notes,setNotes]=useState('');
 const [workDate,setWorkDate]=useState(()=>localDate(new Date()));
 const bounds=useMemo(()=>rangeFor(period),[period]);
 const scopedKey=['driver-erp-snapshot',user?.id,bounds.from,bounds.to];
 const {data,refetch,isLoading,isError}=useQuery({
   queryKey:scopedKey,
   queryFn:async()=>{
     const {data:result,error}=await supabase.rpc('erp_driver_self_snapshot',{
       p_from:bounds.from,p_to:bounds.to
     });
     if(error)throw error;
     return result;
   },
   enabled:Boolean(user?.id&&user?.role==='driver'),
   refetchInterval:15000,refetchOnWindowFocus:true,
 });
 const save=useMutation({
   mutationFn:async()=>{
     if(!amountValid(cash)||!amountValid(network)||Number(cash)+Number(network)<=0)throw Error(t.invalid);
     const {data:result,error}=await supabase.rpc('erp_driver_save_daily_report',{
       p_date:workDate,p_cash:Number(cash),p_network:Number(network),p_notes:notes
     });
     if(error)throw error;
     return result;
   },
   onSuccess:()=>{toast.success(t.submitted);setCash('');setNetwork('');setNotes('');qc.invalidateQueries({queryKey:['driver-erp-snapshot']});},
   onError:e=>toast.error(e?.message||t.saveError),
 });
 const totals=data?.totals||{};
 const entries=data?.finalized_entries||[];
 const trend=data?.daily_trend||[];
 const orders=data?.delivery_orders||[];
 const reports=data?.daily_reports||[];
 const share=Number(totals.sales)>0?Math.round(100*Number(totals.cash||0)/Number(totals.sales)):0;
 const average=Number(totals.entries)>0?Number(totals.sales)/Number(totals.entries):0;
 const maxTrend=Math.max(1,...trend.map(r=>Number(r.total)||0));
 const tabs=[['dashboard',t.dashboard,BarChart3],['sales',t.sales,ReceiptText],['orders',t.orders,Truck],['reports',t.reports,ClipboardList]];
 return <section dir={isRTL?'rtl':'ltr'} data-testid="driver-erp-portal" className="min-h-[calc(100vh-9rem)] bg-slate-50 px-3 pb-10 pt-3 text-slate-900 dark:bg-slate-950 dark:text-white sm:px-5">
  <div className="mx-auto w-full max-w-6xl space-y-3.5">
   <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="rounded-xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><Truck className="h-6 w-6"/></div>
      <div className="min-w-0"><div className="text-xs font-semibold text-blue-700 dark:text-blue-300">{t.title}</div>
       <h1 className="truncate text-lg font-black">{data?.driver?.name||user?.full_name||t.title}</h1>
       <p className="text-xs text-slate-500 dark:text-slate-400">{t.subtitle}</p>
      </div>
     </div>
     <div className="flex items-center gap-1">
       <Button type="button" variant="ghost" size="icon" aria-label={t.refresh} className="h-11 w-11" onClick={()=>refetch()}><RefreshCw className="h-5 w-5"/></Button>
       <Button type="button" variant="ghost" size="icon" aria-label={t.logout} className="h-11 w-11" onClick={logout}><LogOut className="h-5 w-5"/></Button>
     </div>
    </div>
    {data?.driver&&<div className="mt-3 flex flex-wrap gap-2 border-t pt-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
       <span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">{data.driver.branch_name}</span>
       {data.driver.driver_code&&<span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">{t.id}: {data.driver.driver_code}</span>}
       {data.driver.vehicle&&<span className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">{data.driver.vehicle} · {data.driver.plate||''}</span>}
      </div>}
   </header>
   <nav aria-label={t.title} data-testid="driver-tabs" className="grid grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
     {tabs.map(([id,label,Icon])=><button type="button" key={id} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}
      className={'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] font-bold sm:flex-row sm:text-sm '+(tab===id?'bg-blue-600 text-white':'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
      <Icon className="h-4 w-4 shrink-0"/><span className="max-w-full truncate">{label}</span>
     </button>)}
   </nav>
   <div className="flex flex-wrap gap-1.5" data-testid="driver-period-filter">
    {PERIODS.map(p=><Button type="button" key={p} size="sm" variant={period===p?'default':'outline'} onClick={()=>setPeriod(p)}
     className="min-h-10 rounded-xl text-xs">{t[p]}</Button>)}
   </div>
   {isLoading&&<p role="status" className="rounded-xl bg-white p-4 text-sm dark:bg-slate-900">…</p>}
   {isError&&<div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle className="mb-2 h-5 w-5"/>{t.refreshError}
      <Button type="button" variant="outline" onClick={()=>refetch()} className="ms-3 min-h-10">{t.refresh}</Button>
    </div>}
   {!isLoading&&!isError&&data&&<>
    {tab==='dashboard'&&<div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
       {[[t.total,totals.sales,TrendingUp,'text-blue-700'],[t.cash,totals.cash,Wallet,'text-emerald-700'],
         [t.network,totals.network,CreditCard,'text-violet-700'],[t.entries,totals.entries,ReceiptText,'text-amber-700']].map(([label,value,Icon,tone],i)=>
         <Card key={label} className="min-w-0 border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="p-3.5"><Icon className={'mb-2 h-5 w-5 '+tone}/><p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
           <p dir="ltr" className="mt-1 break-words text-start text-lg font-black tabular-nums sm:text-xl">{i===3?value:money(value)+' SAR'}</p>
          </CardContent></Card>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
       <Card className="border-slate-200 dark:border-slate-800"><CardContent className="p-4">
        <h2 className="text-sm font-bold">{t.trend}</h2>
        {trend.length===0?<p className="py-5 text-sm text-slate-500">{t.noTrend}</p>:
        <div data-testid="driver-trend-chart" className="mt-4 flex h-36 items-end gap-1 overflow-x-auto" role="img" aria-label={t.trend}>
          {trend.slice(-45).map(d=><div key={d.date} className="min-w-[9px] flex-1 self-end rounded-t bg-blue-500" style={{height:Math.max(3,(100*(Number(d.total)||0)/maxTrend))+'%'}} title={d.date+': '+money(d.total)}/>)}
        </div>}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t.salesNote}</p>
       </CardContent></Card>
       <Card className="border-slate-200 dark:border-slate-800"><CardContent className="space-y-4 p-4">
        <h2 className="text-sm font-bold">{t.salesSplit}</h2>
        <div className="flex items-end justify-between gap-3"><strong className="text-2xl text-emerald-700">{share}%</strong><span className="text-xs text-slate-500">{t.cashShare}</span></div>
        <div className="h-3 overflow-hidden rounded-full bg-violet-200 dark:bg-violet-900"><div className="h-full bg-emerald-500" style={{width:share+'%'}}/></div>
        <div className="flex justify-between text-xs"><span>{t.cash}: {money(totals.cash)}</span><span>{t.network}: {money(totals.network)}</span></div>
        <div className="border-t pt-3 text-sm dark:border-slate-700">{t.average}: <strong>{money(average)} SAR</strong></div>
        <div className="rounded-lg bg-blue-50 p-2 text-xs text-blue-900 dark:bg-blue-950 dark:text-blue-200"><ShieldCheck className="me-1 inline h-4 w-4"/>{t.difference}</div>
       </CardContent></Card>
      </div>
      <Card className="border-slate-200 dark:border-slate-800"><CardContent className="p-4">
       <h2 className="mb-3 text-sm font-bold">{t.activity}</h2>
       <div className="grid grid-cols-3 gap-2 text-center">
        {['assigned','picked_up','delivered'].map((s,i)=><div key={s} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xl font-black">{orders.filter(o=>String(o.status||'').toLowerCase()===(i===0?'assigned':s)).length}</p><p className="mt-1 break-words text-xs capitalize text-slate-500">{s.replace('_',' ')}</p></div>)}
       </div>
      </CardContent></Card>
    </div>}
    {tab==='sales'&&<section className="space-y-2" data-testid="driver-finalized-sales">
      <h2 className="text-sm font-bold">{t.confirm} · {entries.length}</h2>
      {entries.length===0?<p className="rounded-xl bg-white p-4 text-sm text-slate-500 dark:bg-slate-900">{t.noSales}</p>:
       entries.map(e=><Card key={e.id} className="border-slate-200 dark:border-slate-800"><CardContent className="space-y-2 p-3.5">
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{e.date} · {e.shift||'—'}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">{t.confirm}</span></div>
        <strong dir="ltr" className="block text-xl tabular-nums">{money(e.total)} SAR</strong>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400"><span>{t.cash}: {money(e.cash)}</span><span>{t.network}: {money(e.network)}</span></div>
       </CardContent></Card>)}
    </section>}
    {tab==='orders'&&<section className="space-y-2" data-testid="driver-assigned-deliveries">
      <h2 className="text-sm font-bold">{t.activity} · {orders.length}</h2>
      {orders.length===0?<p className="rounded-xl bg-white p-4 text-sm text-slate-500 dark:bg-slate-900">{t.emptyOrders}</p>:
       orders.map(o=><Card key={o.id} className="border-slate-200 dark:border-slate-800"><CardContent className="p-3.5">
        <div className="flex items-center justify-between"><p className="text-sm font-bold">{t.order} #{o.order_number||String(o.id).slice(0,8)}</p><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{o.status||t.unknown}</span></div>
        <p className="mt-2 text-xs text-slate-500">{String(o.date||'').slice(0,10)} · {o.payment_method||t.unknown}</p>
        <p dir="ltr" className="mt-1 text-start font-bold">{o.total==null?t.unknown:money(o.total)+' SAR'}</p>
       </CardContent></Card>)}
      <p className="text-xs text-slate-500">{t.salesNote}</p>
    </section>}
    {tab==='reports'&&<div className="grid gap-3 md:grid-cols-2" data-testid="driver-reporting">
      <Card className="border-slate-200 dark:border-slate-800"><CardContent className="space-y-3 p-4">
        <h2 className="text-base font-black">{t.daily}</h2>
        <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">{t.explanation}</p>
        <form onSubmit={e=>{e.preventDefault();save.mutate()}} className="space-y-3">
          <label className="block text-xs font-semibold">{t.date}<Input type="date" className="mt-1 min-h-11" value={workDate} onChange={e=>setWorkDate(e.target.value)} required/></label>
          <div className="grid grid-cols-2 gap-2">
           <label className="min-w-0 text-xs font-semibold">{t.cashInput}<Input className="mt-1 min-h-11" inputMode="decimal" type="number" min="0" step="0.01" value={cash} onChange={e=>setCash(e.target.value)} required/></label>
           <label className="min-w-0 text-xs font-semibold">{t.networkInput}<Input className="mt-1 min-h-11" inputMode="decimal" type="number" min="0" step="0.01" value={network} onChange={e=>setNetwork(e.target.value)} required/></label>
          </div>
          <label className="block text-xs font-semibold">{t.notes}<Input className="mt-1 min-h-11" maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
          <Button type="submit" className="min-h-11 w-full bg-blue-600 text-white hover:bg-blue-700" disabled={save.isPending}>{save.isPending?t.sending:t.save}</Button>
        </form>
      </CardContent></Card>
      <Card className="border-slate-200 dark:border-slate-800"><CardContent className="p-4">
       <h2 className="text-sm font-black">{t.history} · {reports.length}</h2>
       {reports.length===0?<p className="mt-4 text-xs text-slate-500">{t.noReports}</p>:
        <div className="mt-3 space-y-2">{reports.map(r=><div key={r.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex flex-wrap justify-between gap-2"><strong className="text-xs">{r.date}</strong><span className={'rounded-full border px-2 py-1 text-[11px] font-bold '+(colors[r.status]||colors.pending)}>{t[r.status]||r.status}</span></div>
          <p dir="ltr" className="mt-2 text-start text-base font-bold">{money(r.total)} SAR</p>
          <p className="text-xs text-slate-500">{t.cash}: {money(r.cash)} · {t.network}: {money(r.network)}</p>
          {r.review_notes&&<p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{r.review_notes}</p>}
        </div>)}</div>}
      </CardContent></Card>
    </div>}
   </>}
  </div>
 </section>;
}
