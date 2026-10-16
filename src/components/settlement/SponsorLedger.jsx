/**
 * Sponsor ↔ Owner sub-ledger. An approved Manager→Sponsor is a receipt,
 * an approved Sponsor→Owner is an outflow. Pending is never paid/settled.
 * The scoped read excludes orphan legacy records; no silent backfill.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { formatTreasuryCurrency, treasuryCurrencyWarning } from '@/lib/treasuryCurrency';
import { sponsorStatement, readSponsorSettlementRows } from '@/lib/sponsorSettlementStatement';
import { Card } from '@/components/ui/card';
import SponsorOwnerBilateralLedger from './SponsorOwnerBilateralLedger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ShieldCheck, Clock, RefreshCw, Building2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const COPY = {
  en: {
    title:'Sponsor Balance Ledger', help:'Approved branch receipts − approved transfers to owner = sponsor liability',
    refresh:'Refresh', loading:'Loading complete sponsor ledger…', error:'Complete sponsor ledger is unavailable. Amounts are hidden to avoid misleading financial decisions.',
    received:'Received by sponsor', sent:'Sponsor → Owner', remain:'Net held by sponsor',
    pending:'Awaiting approval', pendingHelp:'Pending and verified submissions are not counted as settled cash',
    records:'Approved entries', view:'Branch-by-branch settlement', noData:'No approved sponsor settlement records for this business.',
    noDataHelp:'No activity is not the same as fully settled. Legacy unassigned records are excluded until ownership is verified.',
    unassigned:'Unattributed branch', settlement:'Settlement state', mismatch:'Over-transfer / investigate', settled:'Fully settled',
    partial:'Partially settled', awaiting_transfer:'Awaiting owner transfer', no_data:'No approved activity',
    other:'Owner-funded branch; no sponsor receipt', progress:'Transferred to owner', pending_status:'Awaiting approval',
    zero:'No approved sponsor receipts yet', approved:'Approved', detail:'Approved settlement history',
    date:'Date', receivedShort:'Received', sentShort:'Sent', balance:'Balance',
    discrepancy:'Important: one or more branches have transferred more than their approved receipts. Do not treat this as a zero liability.',
    all:'All branches', chart:'Sponsor settlement by branch', ledgerOnly:'Only business-scoped approved records are counted.',
    count:'entries', noHistory:'No approved movements', ownerFunding:'Owner → Branch (reference only)',
    currencyNote:'Amounts are shown in the selected business accounting unit; no exchange conversion is performed.',
  },
  fa: {
    title:'دفتر حساب کفیل',help:'دریافت تأییدشده شعبه منهای حواله تأییدشده به مالک = مانده نزد کفیل',
    refresh:'تازه‌سازی',loading:'دفتر کامل کفیل بارگذاری می‌شود…',error:'داده کامل حساب کفیل در دسترس نیست؛ برای جلوگیری از تصمیم نادرست، مبلغ‌ها پنهان شده‌اند.',
    received:'دریافت‌شده نزد کفیل',sent:'کفیل ← مالک (حواله)',remain:'مانده نزد کفیل',
    pending:'در انتظار تأیید',pendingHelp:'اسناد معلق و بررسی‌شده هنوز پول تسویه‌شده نیستند',
    records:'اسناد تأییدشده',view:'حساب کفیل به تفکیک فرع',noData:'برای این کسب‌وکار هیچ سند تسویه تأییدشده وجود ندارد.',
    noDataHelp:'نبود داده به معنی تسویه کامل نیست. اسناد قدیمی بدون انتساب معتبر تا بررسی مالکیت حساب نمی‌شوند.',
    unassigned:'فرع نامشخص',settlement:'وضعیت تسویه',mismatch:'حواله بیشتر از دریافت؛ نیاز به بررسی',settled:'تسویه کامل',
    partial:'تسویه جزئی',awaiting_transfer:'منتظر حواله به مالک',no_data:'فعالیت تأییدشده وجود ندارد',
    other:'تمویل فرع توسط مالک؛ بدون دریافت کفیل',progress:'حواله‌شده به مالک',pending_status:'در انتظار تأیید',
    zero:'هنوز دریافت تأییدشده کفیل وجود ندارد',approved:'تأییدشده',detail:'تاریخچه تأییدشده تسویه',
    date:'تاریخ',receivedShort:'دریافت',sentShort:'حواله',balance:'مانده',
    discrepancy:'هشدار: در یک یا چند فرع، حواله به مالک بیشتر از دریافت تأییدشده است؛ این را تسویه صفر حساب نکنید.',
    all:'تمام فرع‌ها',chart:'روند تسویه کفیل به تفکیک فرع',ledgerOnly:'فقط اسناد تأییدشده و متعلق به همین کسب‌وکار محاسبه شده‌اند.',
    count:'سند',noHistory:'حواله تأییدشده وجود ندارد',ownerFunding:'تمویل مالک به فرع (صرفاً مرجع)',
    currencyNote:'مبلغ‌ها با واحد حسابداری انتخاب‌شده نمایش داده می‌شوند؛ تبدیل ارز انجام نشده است.',
  },
  ar: {
    title:'سجل أرصدة الكفيل',help:'استلامات الفروع المعتمدة − التحويلات المعتمدة إلى المالك = المستحق لدى الكفيل',
    refresh:'تحديث',loading:'جارٍ تحميل سجل الكفيل الكامل…',error:'تعذر تحميل سجل الكفيل بالكامل، لذلك تم إخفاء المبالغ تفاديًا لقرارات مالية مضللة.',
    received:'ما استلمه الكفيل',sent:'الكفيل ← المالك',remain:'المتبقي لدى الكفيل',
    pending:'بانتظار الاعتماد',pendingHelp:'العمليات المعلقة والمتحقق منها لا تعتبر تسويات مالية معتمدة',
    records:'القيود المعتمدة',view:'سجل الكفيل حسب الفرع',noData:'لا توجد قيود تسوية معتمدة لهذه المنشأة.',
    noDataHelp:'عدم وجود بيانات لا يعني اكتمال التسوية. تُستبعد السجلات القديمة بلا ملكية موثقة حتى التحقق منها.',
    unassigned:'فرع غير محدد',settlement:'حالة التسوية',mismatch:'تحويل زائد عن الاستلام؛ يلزم التحقيق',settled:'تمت التسوية بالكامل',
    partial:'تسوية جزئية',awaiting_transfer:'بانتظار التحويل إلى المالك',no_data:'لا يوجد نشاط معتمد',
    other:'تمويل من المالك للفرع دون استلام كفيل',progress:'المحوّل إلى المالك',pending_status:'بانتظار الاعتماد',
    zero:'لا توجد استلامات معتمدة من الكفيل',approved:'معتمد',detail:'سجل التسويات المعتمدة',
    date:'التاريخ',receivedShort:'الاستلام',sentShort:'التحويل',balance:'الرصيد',
    discrepancy:'تحذير: في فرع واحد أو أكثر تتجاوز التحويلات إلى المالك الاستلامات المعتمدة؛ لا تعتبر الرصيد صفراً.',
    all:'جميع الفروع',chart:'مقارنة تسويات الكفيل حسب الفرع',ledgerOnly:'تُحتسب القيود المعتمدة والمرتبطة بهذه المنشأة فقط.',
    count:'قيود',noHistory:'لا توجد حركات معتمدة',ownerFunding:'تمويل المالك للفرع (للعلم فقط)',
    currencyNote:'تعرض المبالغ بوحدة الحساب المختارة دون إجراء تحويل عملات.',
  },
};

const STATUS_STYLE = {
  mismatch:'border-rose-300 bg-rose-50 text-rose-800',
  settled:'border-emerald-200 bg-emerald-50 text-emerald-800',
  partial:'border-amber-300 bg-amber-50 text-amber-800',
  pending:'border-blue-200 bg-blue-50 text-blue-800',
  awaiting_transfer:'border-amber-300 bg-amber-50 text-amber-800',
  no_data:'border-border bg-muted/40 text-muted-foreground',
  other:'border-border bg-muted/40 text-muted-foreground',
};

export default function SponsorLedger({view='ledger'}) {
  const {lang, currency} = useLanguage();
  const ui = COPY[lang] || COPY.en;
  const {activeRestaurantId,activeRestaurant,branches} = useTenant();
  const [expanded, setExpanded] = useState(null);
  const [branchFilter, setBranchFilter] = useState('all');
  const moneyArgs = {appCurrency:currency,restaurantCurrency:activeRestaurant?.currency,lang};
  const fmt = amount => formatTreasuryCurrency(amount,moneyArgs);

  const {data:rows=[],isLoading,isError,refetch,isFetching} = useQuery({
    queryKey:['sponsor-ledger-full',activeRestaurantId],
    queryFn:()=>readSponsorSettlementRows(supabase,activeRestaurantId),
    enabled:Boolean(activeRestaurantId),staleTime:30000,retry:1,
  });
  const statement = useMemo(()=>sponsorStatement(rows,branches,lang),[rows,branches,lang]);
  const {ledger,totals}=statement;
  const filtered = branchFilter==='all' ? ledger : ledger.filter(b=>b.branch===branchFilter);
  const chartRows = filtered.filter(b=>b.received!==0||b.sent!==0).map(b=>({
    name:b.label.length>15?b.label.slice(0,15)+'…':b.label,
    Received:b.received,Sent:b.sent,Remaining:b.remaining,
  }));

  if(!activeRestaurantId) return <Card role="alert" className="p-4 text-sm">{ui.noData}</Card>;
  if(isError) return <Card role="alert" className="min-w-0 space-y-3 border-rose-300 p-4 text-sm text-rose-800">
    <p>{ui.error}</p><Button type="button" onClick={()=>refetch()} variant="outline"><RefreshCw className="me-1.5 h-4 w-4"/>{ui.refresh}</Button>
  </Card>;
  if(isLoading) return <Card role="status" className="p-4 text-sm text-muted-foreground">{ui.loading}</Card>;

  const status = totals.status;
  const progress=totals.received>0 ? Math.min(100,Math.max(0,(totals.sent/totals.received)*100)) : 0;
  return <section dir={lang==='en'?'ltr':'rtl'} className="min-w-0 space-y-4 overflow-x-clip">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-base font-extrabold">{view === 'balances' ? ui.view : ui.title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{ui.help}</p>
      </div>
      <Button size="sm" type="button" variant="outline" disabled={isFetching} onClick={()=>refetch()} className="shrink-0">
        <RefreshCw className={'me-1.5 h-4 w-4 '+(isFetching?'animate-spin':'')}/>{ui.refresh}
      </Button>
    </div>
    {treasuryCurrencyWarning(moneyArgs)&&<p role="note" className="rounded-lg border border-amber-300 p-2 text-xs">{treasuryCurrencyWarning(moneyArgs)}</p>}
    {totals.mismatchCount>0&&<p role="alert" className="flex gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
      <AlertTriangle className="h-5 w-5 shrink-0"/>{ui.discrepancy}</p>}

    <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
      {[
        {name:ui.received,value:totals.received,style:'border-blue-200 bg-blue-50 text-blue-800'},
        {name:ui.sent,value:totals.sent,style:'border-violet-200 bg-violet-50 text-violet-800'},
      ].map(k=><Card key={k.name} className={'min-w-0 space-y-2 rounded-2xl p-3 sm:p-4 '+k.style}>
        <p className="text-xs font-semibold leading-5">{k.name}</p>
        <p dir="ltr" className="break-all text-start text-lg font-extrabold tabular-nums">{fmt(k.value)}</p>
      </Card>)}
    </div>
    <Card className={'min-w-0 space-y-3 rounded-2xl border p-4 '+STATUS_STYLE[status]}>
      <div className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
        {status==='settled'?<ShieldCheck className="h-5 w-5 shrink-0"/>:status==='mismatch'?<AlertTriangle className="h-5 w-5 shrink-0"/>:<Clock className="h-5 w-5 shrink-0"/>}
        <span>{ui[status]||ui.no_data}</span>
      </div>
      <p dir="ltr" className="break-all text-start text-2xl font-black tabular-nums">{fmt(totals.remaining)}</p>
      <p className="text-xs">{ui.remain} · {totals.outstandingBranches} {ui.count}</p>
      {totals.received>0&&<div className="space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-background/80">
          <div className="h-full rounded-full bg-violet-500" style={{width:progress+'%'}}/>
        </div>
        <p className="text-xs">{ui.progress}: {Math.round(progress)}%</p>
      </div>}
      {status==='no_data'&&<p className="text-xs leading-5">{ui.noDataHelp}</p>}
      {status==='pending'&&<p className="text-xs leading-5">{ui.pendingHelp}</p>}
    </Card>
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <Card className="min-w-0 border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-semibold text-amber-800">{ui.pending}</p>
        <p dir="ltr" className="mt-1 break-all text-start text-lg font-bold text-amber-900">{fmt(totals.pending)}</p>
        <p className="text-xs text-muted-foreground">{totals.pendingCount} {ui.count}</p>
      </Card>
      <Card className="min-w-0 p-3">
        <p className="text-xs font-semibold">{ui.records}</p>
        <p className="mt-1 text-lg font-bold tabular-nums">{totals.approvedCount}</p>
        <p className="text-xs text-muted-foreground">{ui.ledgerOnly}</p>
      </Card>
    </div>

    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
        <h4 className="text-sm font-bold">{ui.view}</h4>
        <select aria-label={ui.view} value={branchFilter} onChange={event=>{setBranchFilter(event.target.value);setExpanded(null)}}
          className="h-9 min-w-0 max-w-full rounded-lg border bg-background px-3 text-xs">
          <option value="all">{ui.all}</option>
          {ledger.map(b=><option key={b.branch} value={b.branch}>{b.label}</option>)}
        </select>
      </div>
      {filtered.length===0 ? <Card className="rounded-xl border-dashed p-7 text-center">
        <p className="text-sm font-medium text-muted-foreground">{ui.noData}</p>
        <p className="mt-2 text-xs text-muted-foreground">{ui.noDataHelp}</p>
      </Card> : <div className="space-y-2">{filtered.map(b=>{
        const isExpanded=expanded===b.branch;
        return <Card key={b.branch} className="min-w-0 rounded-xl p-3 sm:p-4">
          <button type="button" aria-expanded={isExpanded} onClick={()=>setExpanded(isExpanded?null:b.branch)}
            className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 text-start">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-primary"/>
              <span className="break-words text-sm font-bold">{b.label}</span>
              <Badge variant="outline" className={'whitespace-normal text-[10px] '+STATUS_STYLE[b.state]}>
                {ui[b.state]||ui.no_data}</Badge>
            </span>
            <span dir="ltr" className={'shrink-0 text-sm font-bold tabular-nums '+(b.remaining<0?'text-rose-700':'text-foreground')}>{fmt(b.remaining)}</span>
          </button>
          <div className="mt-3 grid min-w-0 grid-cols-3 gap-2">
            {[[ui.receivedShort,b.received,'text-blue-700'],
              [ui.sentShort,b.sent,'text-violet-700'],
              [ui.balance,b.remaining,b.remaining<0?'text-rose-700':'text-emerald-700']
            ].map(([name,amount,style])=><div key={name} className="min-w-0 rounded-lg bg-muted/40 p-2">
              <p className="text-[11px] text-muted-foreground">{name}</p>
              <p dir="ltr" className={'break-all text-start text-xs font-extrabold tabular-nums '+style}>{fmt(amount)}</p>
            </div>)}
          </div>
          {b.pendingCount>0&&<p className="mt-2 text-xs text-amber-700">{ui.pending}: {fmt(b.pendingAmount)} ({b.pendingCount})</p>}
          {b.ownerToBranch>0&&<p className="mt-2 text-xs text-muted-foreground">{ui.ownerFunding}: {fmt(b.ownerToBranch)}</p>}
          {isExpanded&&<div className="mt-3 space-y-2 border-t pt-3">
            <h5 className="text-xs font-semibold">{ui.detail}</h5>
            {b.history.length===0?<p className="text-xs text-muted-foreground">{ui.noHistory}</p>:
              b.history.map(row=><div key={row.id} className="flex min-w-0 items-center justify-between gap-2 border-b py-2 text-xs last:border-0">
                <span className="min-w-0">
                  <span className="block font-medium">{row.flow_type==='MANAGER_TO_SPONSOR'?ui.received:row.flow_type==='SPONSOR_TO_OWNER'?ui.sent:ui.ownerFunding}</span>
                  <span className="text-muted-foreground">{row.date}</span>
                </span>
                <span dir="ltr" className="shrink-0 font-semibold">{fmt(row.amount)}</span>
              </div>)}
          </div>}
        </Card>})}</div>}
    </div>
    {view === 'ledger' && <SponsorOwnerBilateralLedger />}
    {chartRows.length>0&&<Card className="min-w-0 space-y-3 p-3 sm:p-4">
      <h4 className="text-sm font-bold">{ui.chart}</h4>
      <div dir="ltr" className="h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} margin={{left:-22,right:0}}>
            <CartesianGrid strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/>
            <Tooltip formatter={v=>fmt(v)}/><Legend wrapperStyle={{fontSize:10}}/>
            <Bar name={ui.receivedShort} dataKey="Received" fill="#3b82f6"/>
            <Bar name={ui.sentShort} dataKey="Sent" fill="#8b5cf6"/>
            <Bar name={ui.balance} dataKey="Remaining" fill="#f59e0b"/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>}
  </section>;
}
