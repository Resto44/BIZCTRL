import React, { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, CalendarDays,
  CreditCard, Layers3, TrendingUp, Wifi, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { networkInsights, NETWORK_PERIODS, networkReportedAmount } from '@/lib/networkAnalytics';

const COLORS = ['#2563eb','#06b6d4','#8b5cf6','#14b8a6','#f59e0b','#ec4899'];
const labels = {
  en: {
    title:'Network Intelligence',desc:'Finalized card revenue • Riyadh business date',
    periods:['Day','Week','Month','3 Months','6 Months','Year'],
    branch:'Branch', all:'All branches',revenue:'Network sales',growth:'Change vs previous',
    average:'Daily average',share:'Card share of sales',closings:'Final closings',
    active:'Active networks',variance:'Settlement variance',pending:'Pending settlements',
    noPrevious:'No prior sales',prev:'Prior',activity:'Active sales days',
    trend:'Card sales trend',weekday:'Sales by weekday',branches:'Branch contribution',
    accounts:'POS account allocation',gap:'Unallocated card revenue',
    gapHint:'Difference between finalized card sales and attributed POS rows; negative values need review.',
    allocation:'Account allocation uses saved POS rows only. It is NOT extra sales revenue.',
    recent:'Recent finalized network sales',empty:'No finalized card sales for this period.',
    emptyAccounts:'No identified POS allocations for this period.',
    caution:'Results may be incomplete due to the safe record cap. Shorten the period.',
    scope:'Finalized/locked sales and legacy closings without state. Settlements are not new revenue.',
    tz:'Dates and comparison use Asia/Riyadh.',rows:'records',review:'records need allocation review',
    loading:'Loading verified financial data…',unavailable:'Unable to verify financial data. Refresh and check access.',riskUnavailable:'Settlement data unavailable',
  },
  fa: {
    title:'تحلیل هوشمند شبکه',desc:'فروش نهایی کارت • تاریخ کاری عربستان',
    periods:['روز','هفته','ماه','۳ ماه','۶ ماه','سال'],
    branch:'شعبه',all:'تمام شعبه‌ها',revenue:'فروش شبکه',growth:'تغییر نسبت به دوره قبل',
    average:'میانگین روزانه',share:'سهم کارت از فروش',closings:'کلوزینگ نهایی',
    active:'حساب‌های شبکه فعال',variance:'اختلاف تسویه',pending:'تسویه‌های در انتظار',
    noPrevious:'دوره قبل فروش نداشته',prev:'دوره قبل',activity:'روزهای دارای فروش',
    trend:'روند فروش کارت',weekday:'فروش بر اساس روز هفته',branches:'سهم شعبه‌ها',
    accounts:'تخصیص فروش به POS',gap:'فروش بدون تخصیص به POS',
    gapHint:'اختلاف مجموع فروش کارت با ردیف‌های POS؛ مقدار منفی نیازمند بررسی است.',
    allocation:'تخصیص POS فقط از ردیف‌های ثبت‌شده است و دوباره به درآمد جمع نمی‌شود.',
    recent:'جدیدترین فروش‌های نهایی شبکه',empty:'در این دوره فروش نهایی کارت وجود ندارد.',
    emptyAccounts:'در این دوره حساب POS مشخص نشده.',
    caution:'ممکن است نتیجه ناقص باشد؛ سقف ایمن دریافت رکورد پر شده است. دوره را کوتاه کنید.',
    scope:'کلوزینگ نهایی/قفل‌شده و رکوردهای قدیمیِ بدون وضعیت؛ تسویه درآمد جدید نیست.',
    tz:'محاسبه تاریخ و مقایسه بر اساس Asia/Riyadh است.',rows:'رکورد',review:'رکورد نیازمند بررسی تخصیص',
    loading:'در حال دریافت ارقام تأییدشده…',unavailable:'اطلاعات مالی قابل تأیید نیست. صفحه و مجوز دسترسی را بررسی کنید.',riskUnavailable:'اطلاعات تسویه در دسترس نیست',
  },
  ar: {
    title:'ذكاء مبيعات الشبكة',desc:'إيراد البطاقات النهائي • توقيت الرياض',
    periods:['يوم','أسبوع','شهر','٣ أشهر','٦ أشهر','سنة'],
    branch:'الفرع',all:'جميع الفروع',revenue:'مبيعات الشبكة',growth:'التغير عن الفترة السابقة',
    average:'المتوسط اليومي',share:'نسبة البطاقات من البيع',closings:'إقفالات نهائية',
    active:'حسابات الشبكة النشطة',variance:'فروقات التسوية',pending:'تسويات معلقة',
    noPrevious:'لا توجد مبيعات سابقة',prev:'السابق',activity:'أيام نشاط البيع',
    trend:'اتجاه مبيعات الشبكة',weekday:'المبيعات حسب يوم الأسبوع',branches:'توزيع الفروع',
    accounts:'تخصيص مبيعات أجهزة POS',gap:'مبيعات غير مخصصة لجهاز',
    gapHint:'الفرق بين إجمالي البطاقة ومبالغ الأجهزة؛ الرقم السالب يحتاج مراجعة.',
    allocation:'تخصيص الأجهزة من السجلات المحفوظة فقط، وليس إيراداً إضافياً.',
    recent:'أحدث مبيعات الشبكة النهائية',empty:'لا توجد مبيعات نهائية للشبكة في هذه الفترة.',
    emptyAccounts:'لا توجد تخصيصات لأجهزة POS في هذه الفترة.',
    caution:'قد تكون النتائج ناقصة بسبب الحد الآمن للسجلات؛ قلّص الفترة.',
    scope:'الإقفالات النهائية والمقفلة والسجلات القديمة دون حالة. التسويات ليست إيراداً جديداً.',
    tz:'التاريخ والمقارنة حسب توقيت الرياض.',rows:'سجل',review:'سجلات تحتاج مراجعة التخصيص',
    loading:'جارٍ تحميل البيانات المالية المعتمدة…',unavailable:'تعذر التحقق من البيانات المالية. راجع الاتصال والصلاحيات.',riskUnavailable:'بيانات التسويات غير متاحة',
  },
};
const money = (value,currency) => currency+' '+Number(value||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const percent = value => value == null ? '—' : Number(value).toFixed(1)+'%';
const shortValue = value => Number(value).toLocaleString('en-US',{notation:'compact',maximumFractionDigits:1});
const AXIS = {fontSize:11,fill:'#64748b'};
function Metric({name,value,sub,icon:Icon,highlight=false,warning=false}) {
  return <Card className={'min-w-0 border p-3 sm:p-4 '+(warning?'border-amber-300 ':'')+(highlight?'border-blue-200 bg-gradient-to-br from-blue-50 to-white':'')}>
    <div className="flex items-start justify-between gap-1">
      <span className="min-w-0 text-xs font-semibold leading-5 text-slate-600">{name}</span>
      <Icon className={'h-4 w-4 shrink-0 '+(warning?'text-amber-600':'text-blue-600')}/>
    </div>
    <p className="mt-2 break-words text-lg font-black tabular-nums text-slate-900 sm:text-2xl">{value}</p>
    {sub && <p className="mt-1 text-xs leading-5 text-slate-500">{sub}</p>}
  </Card>;
}
function Graph({title,children,empty,caption}) {
  return <Card className="min-w-0 p-3 sm:p-4">
    <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
    {caption&&<p className="mt-1 text-xs leading-5 text-slate-500">{caption}</p>}
    {empty?<p className="flex min-h-52 items-center justify-center text-center text-sm text-slate-500">{empty}</p>:
    <div className="mt-4 h-60 min-w-0 sm:h-72">{children}</div>}
  </Card>;
}
export default function NetworkERPInsights({
  mode='dashboard',sales=[],recons=[],accounts=[],branches=[],window,period,onPeriod,
  branchId,onBranch,currency='SAR',lang='en',incomplete=false,loading=false,unavailable=false,riskUnavailable=false,
}) {
  const t = labels[lang]||labels.en;
  const v = useMemo(()=>networkInsights({sales,recons,accounts,branches,window,branchId}),
    [sales,recons,accounts,branches,window,branchId]);
  const details = mode==='analytics';
  const format = value=>money(value,currency);
  return <section className="min-w-0 space-y-4" dir={lang==='en'?'ltr':'rtl'} data-testid="network-erp-insights" data-i18n-skip="true">
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 p-4 text-white shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <Layers3 className="h-5 w-5 shrink-0 text-cyan-300"/>
        <h2 className="min-w-0 text-lg font-black">{t.title}</h2>
        <span className="ms-auto rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs">ERP</span>
      </div>
      <p className="mt-1 text-xs text-blue-100">{t.desc}</p>
      <div role="group" aria-label={t.title} className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {NETWORK_PERIODS.map((code,i)=><button key={code} type="button"
          data-testid={'network-period-'+code} aria-pressed={period===code} onClick={()=>onPeriod(code)}
          className={'min-h-10 rounded-lg border px-1 text-xs font-bold '+(period===code?'border-cyan-200 bg-white text-blue-900':'border-white/20 bg-white/10 text-white hover:bg-white/20')}>
          {t.periods[i]}
        </button>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold">
          <Building2 className="h-4 w-4"/> {t.branch}
          <select aria-label={t.branch} data-testid="network-branch-filter" value={branchId}
            onChange={e=>onBranch(e.target.value)}
            className="min-h-10 min-w-0 max-w-56 rounded-lg border border-white/30 bg-white px-2 text-slate-900">
            <option value="all">{t.all}</option>
            {branches.map(b=><option key={b.id} value={String(b.id)}>{b.name||b.key||b.id}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1 text-xs text-blue-100"><CalendarDays className="h-4 w-4"/>
          {window.start} — {window.end}
        </div>
      </div>
    </div>
    <p className="text-xs text-slate-500">{t.scope}</p>
    {incomplete && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
      <AlertTriangle className="me-1 inline h-4 w-4"/>{t.caution}
    </p>}
    {unavailable ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{t.unavailable}</p>
      : loading ? <p role="status" className="rounded-xl border bg-white p-6 text-sm text-slate-600">{t.loading}</p>
      : <>
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
      <Metric name={t.revenue} value={format(v.revenue)} icon={CreditCard} highlight sub={v.currentRows+' '+t.rows}/>
      <Metric name={t.growth} value={percent(v.change)} icon={v.change!=null&&v.change<0?ArrowDownRight:ArrowUpRight}
        warning={v.change!=null&&v.change<0} sub={v.change==null?t.noPrevious:t.prev+': '+format(v.priorRevenue)}/>
      <Metric name={t.average} value={format(v.averageDay)} icon={TrendingUp} sub={v.activeDays+' '+t.activity}/>
      <Metric name={t.share} value={percent(v.cardShare)} icon={Activity}/>
      <Metric name={t.active} value={v.activeAccounts} icon={Wifi}/>
      <Metric name={t.closings} value={v.currentRows} icon={Layers3}/>
      <Metric name={t.variance} value={riskUnavailable?t.riskUnavailable:format(v.variance)} warning={!riskUnavailable&&v.variance>0} icon={AlertTriangle}/>
      <Metric name={t.pending} value={riskUnavailable?'—':v.pending} warning={!riskUnavailable&&v.pending>0} icon={Activity}/>
    </div>
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      <Graph title={t.trend} caption={t.tz} empty={v.currentRows?null:t.empty}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={v.trend} margin={{left:-10,right:10,top:10,bottom:0}}>
            <defs><linearGradient id="networkERPGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.33}/>
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02}/>
            </linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 4"/>
            <XAxis dataKey="date" tick={AXIS} minTickGap={18} tickFormatter={s=>s.slice(5)}/>
            <YAxis tick={AXIS} width={45} tickFormatter={shortValue}/>
            <Tooltip formatter={format} contentStyle={{borderRadius:12,fontSize:12}}/>
            <Area dataKey="value" name={t.revenue} stroke="#2563eb" strokeWidth={2.5}
              fill="url(#networkERPGradient)" type="monotone" isAnimationActive={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </Graph>
      <Graph title={t.weekday} empty={v.currentRows?null:t.empty}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={v.weekdays} margin={{left:-10,right:10,top:10,bottom:0}}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 4"/>
            <XAxis dataKey="day" tick={AXIS}/><YAxis tick={AXIS} width={45} tickFormatter={shortValue}/>
            <Tooltip formatter={format} contentStyle={{borderRadius:12,fontSize:12}}/>
            <Bar dataKey="value" name={t.revenue} fill="#06b6d4" radius={[5,5,0,0]} maxBarSize={32} isAnimationActive={false}/>
          </BarChart>
        </ResponsiveContainer>
      </Graph>
    </div>
    {details ? <>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <Graph title={t.branches} empty={v.byBranch.length?null:t.empty}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={v.byBranch.slice(0,8)} layout="vertical" margin={{left:0,right:16,top:10,bottom:0}}>
              <XAxis type="number" tick={AXIS} tickFormatter={shortValue}/>
              <YAxis type="category" dataKey="name" tick={AXIS} width={96}
                tickFormatter={s=>String(s).length>13?String(s).slice(0,12)+'…':s}/>
              <Tooltip formatter={format} contentStyle={{borderRadius:12,fontSize:12}}/>
              <Bar dataKey="value" radius={[0,5,5,0]} maxBarSize={24} isAnimationActive={false}>
                {v.byBranch.slice(0,8).map((b,i)=><Cell key={b.id} fill={COLORS[i%COLORS.length]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Graph>
        <Graph title={t.accounts} caption={t.allocation} empty={v.byAccount.length?null:t.emptyAccounts}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={v.byAccount.slice(0,7)} dataKey="value" nameKey="name" cx="50%" cy="50%"
                innerRadius="52%" outerRadius="78%" paddingAngle={2} isAnimationActive={false}>
                {v.byAccount.slice(0,7).map((a,i)=><Cell key={a.id} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={format} contentStyle={{borderRadius:12,fontSize:12}}/>
            </PieChart>
          </ResponsiveContainer>
        </Graph>
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <Card className="min-w-0 p-4">
          <h3 className="mb-2 text-sm font-extrabold">{t.accounts}</h3>
          <p className="mb-3 text-xs text-slate-500">{t.allocation}</p>
          {v.byAccount.length ? v.byAccount.slice(0,12).map((a,i)=>
            <div key={a.id} className="flex items-center justify-between gap-2 border-b py-2 text-xs">
              <span className="min-w-0 break-words">{i+1}. {a.name}</span>
              <b className="shrink-0 tabular-nums">{format(a.value)}</b>
            </div>) : <p className="text-sm text-slate-500">{t.emptyAccounts}</p>}
        </Card>
        <Card className={'min-w-0 p-4 '+(Math.abs(v.unallocated)>0.009?'border-amber-300':'')}>
          <h3 className="text-sm font-extrabold">{t.gap}</h3>
          <p className="my-3 break-words text-2xl font-black tabular-nums">{format(v.unallocated)}</p>
          <p className="text-xs leading-5 text-slate-600">{t.gapHint}</p>
          <p className="mt-2 text-xs font-semibold">{v.unattributedRecords} {t.review}</p>
        </Card>
      </div>
    </> : <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      <Card className="min-w-0 p-4">
        <h3 className="mb-3 text-sm font-extrabold">{t.branches}</h3>
        {v.byBranch.length ? v.byBranch.slice(0,6).map(b=>
          <div key={b.id} className="mb-3">
            <div className="mb-1 flex justify-between gap-2 text-xs">
              <span className="min-w-0 break-words">{b.name}</span><b className="shrink-0">{format(b.value)}</b>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-500"
                style={{width:Math.max(0,Math.min(100,v.revenue>0?100*b.value/v.revenue:0))+'%'}}/>
            </div>
          </div>) : <p className="text-sm text-slate-500">{t.empty}</p>}
      </Card>
      <Card className="min-w-0 p-4">
        <h3 className="mb-3 text-sm font-extrabold">{t.recent}</h3>
        {v.currentSales.filter(row=>networkReportedAmount(row)!==0).slice(0,8).map(row=>
          <div key={row.id} className="flex justify-between gap-2 border-b py-2 text-xs">
            <span className="min-w-0 break-words">{row.date} · {row.branch||'—'}</span>
            <strong className="shrink-0 tabular-nums">{format(networkReportedAmount(row))}</strong>
          </div>)}
        {!v.currentRows && <p className="text-sm text-slate-500">{t.empty}</p>}
      </Card>
    </div>}
    </>}
  </section>;
}
