import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BadgeDollarSign,
  Banknote, BarChart3, CreditCard, Landmark, Layers3, ReceiptText,
  ShieldAlert, ShoppingBasket, TrendingUp,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { buildExecutiveSnapshotPresentation, buildExecutiveComparisonTrend, moneyChange } from '@/lib/executiveSnapshotPresentation';
import OwnerOrderSourcesAnalytics from './OwnerOrderSourcesAnalytics';
import { buildOwnerOrderSourceAnalytics } from '@/lib/ownerOrderSourceAnalytics';

const t = (copy,key,fallback) => copy?.[key] || fallback;

function Change({ percent, points = false, suffix = '', light = false, lowerIsBetter = false }) {
  if (percent == null || !Number.isFinite(percent)) return null;
  const positive = percent >= 0;
  const amount = Math.abs(percent).toFixed(1);
  const favorable = lowerIsBetter ? !positive : positive;
  return <span className={`inline-flex max-w-full items-center gap-0.5 rounded-full px-2 py-1 text-[10px] font-black tabular-nums ${light
    ? 'bg-white/15 text-white'
    : favorable ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
      : 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'}`}>
    {positive ? <ArrowUpRight className="h-3 w-3 shrink-0"/> : <ArrowDownRight className="h-3 w-3 shrink-0"/>}
    {positive ? '+' : '-'}{amount}{points?' pp':'%'}{suffix ? ` ${suffix}`:''}
  </span>;
}
function ComparisonMeter({ current, previous, color }) {
  if (!Number.isFinite(Number(previous)) || Number(previous) <= 0) return null;
  const a = Math.max(0, Number(current)||0), b = Math.max(0, Number(previous)||0);
  const max = Math.max(1,a,b);
  return <div role="img" aria-label="Current period compared with the previous period" className="mt-3 flex h-7 items-end gap-1.5">
    <span className="w-2.5 rounded-t bg-slate-300/70 dark:bg-slate-600" style={{height:`${Math.max(2,100*b/max)}%`}}/>
    <span className={`w-2.5 rounded-t ${color}`} style={{height:`${Math.max(2,100*a/max)}%`}}/>
  </div>;
}
function StatCard({ title, value, icon: Icon, tone, hint, change, previous, current, testId, lowerIsBetter = false, comparisonLabel }) {
  const tones = {
    blue:'border-blue-200/70 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/40 text-blue-700',
    green:'border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-900 dark:from-emerald-950/45 dark:to-slate-950 text-emerald-700',
    violet:'border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-900 dark:from-violet-950/40 dark:to-slate-950 text-violet-700',
    rose:'border-rose-200/70 bg-gradient-to-br from-rose-50 to-white dark:border-rose-900 dark:from-rose-950/40 dark:to-slate-950 text-rose-700',
    amber:'border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-900 dark:from-amber-950/40 dark:to-slate-950 text-amber-700',
  };
  return <div data-testid={testId} className={`min-w-0 rounded-2xl border p-3.5 shadow-sm ${tones[tone]||tones.green}`}>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-black sm:text-xs"><Icon className="h-4 w-4 shrink-0"/><span className="break-words">{title}</span></span>
      <Change percent={change} lowerIsBetter={lowerIsBetter}/>
    </div>
    <p className="mt-2 break-words text-[clamp(1.05rem,3.5vw,1.65rem)] font-black leading-tight tracking-tight tabular-nums text-slate-950 dark:text-white" dir="ltr">{value}</p>
    {comparisonLabel && <p className="mt-1 text-[10px] text-muted-foreground">{comparisonLabel}</p>}
    <p className="mt-1 min-h-4 text-[10px] leading-4 text-muted-foreground">{hint}</p>
    <ComparisonMeter current={current} previous={previous} color={tone==='rose'?'bg-rose-400':tone==='violet'?'bg-violet-500':tone==='amber'?'bg-amber-400':'bg-emerald-500'}/>
  </div>;
}
function SectionHeader({ icon: Icon, title, subtitle, children }) {
  return <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm"><Icon className="h-5 w-5"/></div>
      <div className="min-w-0">
        <h3 className="text-sm font-black tracking-tight text-foreground sm:text-base">{title}</h3>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{subtitle}</p>
      </div>
    </div>
    {children}
  </div>;
}
function DetailTile({title,amount,icon:Icon,onClick,tone='blue',hint}) {
  const styles={
    blue:'border-blue-100 bg-blue-50/55 text-blue-600 dark:border-blue-900 dark:bg-blue-950/30',
    violet:'border-violet-100 bg-violet-50/55 text-violet-600 dark:border-violet-900 dark:bg-violet-950/30',
  };
  return <button type="button" onClick={onClick} className={`min-w-0 rounded-xl border p-3 text-start transition hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-blue-500 ${styles[tone]}`}>
    <span className="flex items-center gap-1.5 text-xs font-bold"><Icon className="h-4 w-4"/>{title}</span>
    <strong className="mt-1.5 block break-words text-base font-black tabular-nums text-foreground" dir="ltr">{amount}</strong>
    <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span>
  </button>;
}

export default function ExecutiveSnapshotV2({model,copy}) {
  const navigate=useNavigate();
  const {
    periodMetrics={},previousPeriodMetrics={},revenueTrend=[],periodKey='today',
    periodLabel,formatMoney,hasQueryError,accountingProvisional,drawerCash,receivables,payables,scopedAlerts=[],
    periodSales=[],revenueSources=[],lang='en', previousRevenueTrend=[], reportPeriod, changeReportPeriod,
  }=model;
  const presentation=useMemo(()=>buildExecutiveSnapshotPresentation({
    periodMetrics,previousPeriodMetrics,revenueTrend,periodKey,
  }),[periodMetrics,previousPeriodMetrics,revenueTrend,periodKey]);
  const sourceBreakdown=useMemo(()=>buildOwnerOrderSourceAnalytics({
    sales:periodSales,revenueSources,verifiedSales:presentation.sales,lang,
  }),[periodSales,revenueSources,presentation.sales,lang]);
  const prev=previousPeriodMetrics;
  const methods=presentation.methods;
  const gradient=methods.reduce((acc,method)=>{
    const previous=acc.sum;
    const next=Math.min(100,previous+method.percent);
    return {sum:next,colors:[...acc.colors,`${method.color} ${previous.toFixed(4)}% ${next.toFixed(4)}%`]};
  },{sum:0,colors:[]});
  const comparisonTrend=useMemo(()=>buildExecutiveComparisonTrend({revenueTrend,previousRevenueTrend,periodKey,period:reportPeriod}),[revenueTrend,previousRevenueTrend,periodKey,reportPeriod]);
  const canChart=comparisonTrend.some(row=>row.sales!=null||row.previousSales!=null);
  const slotLabel=(periodKey==='year'||periodKey==='six-months')?(lang==='fa'?'ماه':lang==='ar'?'شهر':'Month'):(lang==='fa'?'روز':lang==='ar'?'يوم':'Day');
  const compareLabel=t(copy,'vsPreviousPeriod','vs previous period');
  const money=value=>hasQueryError?'—':formatMoney(value);

  const risksKnown=!hasQueryError;
  return <div data-testid="executive-snapshot-v2" className="space-y-3.5">
    <section data-testid="executive-snapshot" className="min-w-0 rounded-[1.55rem] border border-border/80 bg-card p-3.5 shadow-sm sm:p-5">
      <SectionHeader icon={BarChart3} title={t(copy,'executiveSnapshot','Executive snapshot')}
        subtitle={`${t(copy,'performanceOverview','Key performance overview')} · ${periodLabel}`}>
        <div className="flex flex-wrap items-center gap-2">
          {changeReportPeriod && <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900" aria-label={t(copy,'choosePeriod','Report period')}>
            {[['today','today','Today'],['week','thisWeek','This week'],['month','thisMonth','This month']].map(([key,label,fallback])=><button type="button" key={key} aria-pressed={periodKey===key} onClick={()=>changeReportPeriod(key)} className={`min-h-9 rounded-lg px-2.5 text-[11px] font-bold ${periodKey===key?'bg-blue-600 text-white shadow-sm':'text-muted-foreground hover:bg-background'}`}>{t(copy,label,fallback)}</button>)}
          </div>}
          {(hasQueryError||accountingProvisional)&&<span role="status" className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">{hasQueryError?t(copy,'syncRequired','Sync required'):t(copy,'accountingProvisionalLabel','Management estimate · pending expenses')}</span>}
        </div>
      </SectionHeader>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div data-testid="snapshot-sales" className="min-w-0 rounded-2xl border border-blue-200/70 bg-blue-50/60 p-3.5 dark:border-blue-900 dark:bg-blue-950/40">
          <span className="flex items-center gap-1.5 text-xs font-black text-blue-700 dark:text-blue-300"><BarChart3 className="h-4 w-4"/>{t(copy,'sales','Sales')}</span>
          <p className="my-2 break-words text-[clamp(1.05rem,3.5vw,1.65rem)] font-black tracking-tight tabular-nums" dir="ltr">{money(presentation.sales)}</p>
          {!hasQueryError&&<Change percent={presentation.salesChange}/>}
          <p className="mt-1 text-[10px] text-muted-foreground">{compareLabel}</p>
        </div>
        <StatCard testId="snapshot-sales-less-purchases" title={t(copy,'grossProfit','Sales less purchases')} value={money(periodMetrics.grossProfit)} icon={BadgeDollarSign} tone="green"
          change={hasQueryError?null:moneyChange(periodMetrics.grossProfit,prev.grossProfit)} comparisonLabel={compareLabel}/>
        <StatCard testId="snapshot-expenses" title={t(copy,'operatingExpense','Recorded expenses')} value={money(periodMetrics.totalExpenses)} icon={ReceiptText} tone="rose" lowerIsBetter
          change={hasQueryError?null:moneyChange(periodMetrics.totalExpenses,prev.totalExpenses)} comparisonLabel={compareLabel}/>
        <StatCard testId="snapshot-profit" title={t(copy,'netProfit','Operating estimate')} value={money(periodMetrics.netProfit)} icon={TrendingUp} tone={periodMetrics.netProfit<0?'rose':'violet'}
          change={hasQueryError?null:presentation.profitChange} comparisonLabel={compareLabel}/>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{t(copy,'profitHint','Sales less purchases and expenses; not inventory-COGS profit')}</p>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-2xl border border-border/80 p-3">
          <h4 className="text-xs font-black">{t(copy,'revenueTrend','Revenue trend')}</h4>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-blue-600"/>{periodLabel}</span>
            <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-slate-400"/>{t(copy,'previousPeriodSales','Previous period sales')}</span>
          </div>
          {canChart&&!hasQueryError?<div data-testid="snapshot-sales-trend" className="mt-3 h-48 min-w-0 sm:h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={comparisonTrend} margin={{top:8,right:8,left:0,bottom:0}}>
                <defs><linearGradient id="ownerExecutiveSalesGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.2}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0.01}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.45}/>
                <XAxis dataKey="slot" tickFormatter={value=>`${slotLabel} ${value}`} tick={{fontSize:10}} axisLine={false} tickLine={false} minTickGap={20}/>
                <YAxis width={42} tick={{fontSize:9}} axisLine={false} tickLine={false} tickFormatter={value=>new Intl.NumberFormat(lang,{notation:'compact',maximumFractionDigits:1}).format(value)}/>
                <Tooltip formatter={(value,name)=>[formatMoney(value),name]} labelFormatter={(_,payload)=>{const row=payload?.[0]?.payload;return [row?.date,row?.previousDate].filter(Boolean).join(' / ');}} contentStyle={{borderRadius:12,color:'#0f172a',fontSize:11}}/>
                <Area type="linear" dataKey="previousSales" name={t(copy,'previousPeriodSales','Previous period sales')} stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={2} fill="transparent" dot={{r:2}} connectNulls={false}/>
                <Area type="linear" dataKey="sales" name={t(copy,'sales','Sales')} stroke="#2563eb" strokeWidth={2.5} fill="url(#ownerExecutiveSalesGradient)" dot={{r:3}} connectNulls={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>:<div className="grid h-48 place-items-center text-center text-xs text-muted-foreground">{hasQueryError?t(copy,'syncRequired','Sync required'):t(copy,'noPeriodData','No recorded data for this period.')}</div>}
          <p className="mt-1 text-[10px] text-muted-foreground">{t(copy,'revenueTrendHint','Recorded revenue in the selected period')}</p>
        </div>
        <div data-testid="snapshot-margin" className="min-w-0 rounded-2xl border border-violet-200/70 bg-violet-50/50 p-3.5 dark:border-violet-900 dark:bg-violet-950/30">
          <h4 className="flex items-center gap-1.5 text-xs font-black text-violet-700 dark:text-violet-300"><TrendingUp className="h-4 w-4"/>{t(copy,'netMargin','Estimated margin')}</h4>
          <p className="my-3 break-words text-3xl font-black tabular-nums" dir="ltr">{!hasQueryError&&presentation.sales>0&&Number.isFinite(Number(periodMetrics.netMargin))?Number(periodMetrics.netMargin).toFixed(1)+'%':'—'}</p>
          {!hasQueryError&&presentation.sales>0&&<Change points percent={presentation.marginChangePoints}/>}
          <p className="mt-1 text-[10px] text-muted-foreground">{compareLabel}</p>
          <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{t(copy,'marginHint','Estimated result as a share of sales')}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3 dark:border-blue-900 dark:bg-blue-950/30">
        <span className="flex items-center gap-2 text-xs font-bold"><ShoppingBasket className="h-4 w-4 text-blue-600"/>{t(copy,'purchases','Purchases')}</span>
        <strong className="text-base tabular-nums" dir="ltr">{money(periodMetrics.totalPurchaseCost)}</strong>
        <span className="text-[10px] text-muted-foreground">{t(copy,'purchasesHint','Approved purchases in the selected period')}</span>
      </div>
    </section>

    <section data-testid="snapshot-payment-section" className="min-w-0 rounded-[1.55rem] border border-border/80 bg-card p-3.5 shadow-sm sm:p-5">
      <SectionHeader icon={CreditCard} title={t(copy,'paymentOverview','Cash position & payments')}
        subtitle={t(copy,'cashMixNote','Physical drawer balance is separate from sales')}>
        <button type="button" onClick={()=>navigate('/reports')} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
          {t(copy,'viewDetails','View details')}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180"/>
        </button>
      </SectionHeader>
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,0.75fr)_minmax(0,1.65fr)]">
        <div data-testid="snapshot-drawer-cash" className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="flex items-center gap-2 text-xs font-black text-emerald-800 dark:text-emerald-300"><Banknote className="h-4 w-4"/>{t(copy,'drawerCash','Cash in drawer')}</p>
          <p className="mt-3 text-[clamp(1.45rem,4vw,2rem)] font-black text-emerald-950 dark:text-emerald-100" dir="ltr">{drawerCash?.complete?formatMoney(drawerCash.amount):'—'}</p>
          <p className="mt-2 text-[11px] leading-4 text-emerald-700 dark:text-emerald-300">{drawerCash?.complete?t(copy,'drawerCashHint','Last verified physical count · not a live bank balance'):drawerCash?.error?t(copy,'syncRequired','Sync required'):drawerCash?.missingBranches?t(copy,'partialDrawerCash','Some branch cash counts are missing'):t(copy,'drawerCashMissing','Not recorded')}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-border/80 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-black text-foreground">{t(copy,'paymentMix','Payment sources (sales mix)')}</h4>
            <strong className="text-xs tabular-nums text-foreground" dir="ltr">{formatMoney(presentation.sales)}</strong>
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-4">
            <div data-testid="snapshot-payment-mix" role="img" aria-label={t(copy,'paymentMix','Payment sources (sales mix)')}
              className="relative mx-auto grid h-28 w-28 shrink-0 place-items-center rounded-full"
              style={{background:presentation.sales>0&&presentation.reconciled?`conic-gradient(${gradient.colors.join(',')})`:'conic-gradient(#cbd5e1 0% 100%)'}}>
              <div className="grid h-[76px] w-[76px] place-content-center rounded-full bg-card text-center">
                <span className="text-[10px] text-muted-foreground">{t(copy,'sales','Sales')}</span>
                <span className="text-sm font-black text-foreground">{Number(presentation.sales).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
              </div>
            </div>
            <div className="min-w-[9rem] flex-1 space-y-2">
              {methods.map(method=><div key={method.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-[10px] sm:text-xs">
                <span className="flex min-w-0 items-center gap-1.5 font-semibold text-muted-foreground"><span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor:method.color}}/><span className="truncate">{method.key==='cash'?t(copy,'cashSales','Cash sales'):method.key==='otherSources'?t(copy,'otherPaymentMethods','Other payment methods'):t(copy,method.key,method.key)}</span></span>
                <strong className="tabular-nums text-foreground" dir="ltr">{Number(method.amount).toLocaleString(undefined,{maximumFractionDigits:0})}</strong>
                <span className="w-12 text-end tabular-nums text-muted-foreground">{presentation.reconciled?method.percent.toFixed(1)+'%':'—'}</span>
              </div>)}
            </div>
          </div>
          {!presentation.reconciled && <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-700">{t(copy,'mixMismatch','Payment mix differs from reported sales; review the closing records.')}</p>}
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{t(copy,'cashDrawerWarning','Cash sales and cash left in drawer are different figures.')}</p>
          {sourceBreakdown.sources.length>0&&!hasQueryError&&<div data-testid="snapshot-recorded-source-shortcut" className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-violet-800 dark:text-violet-200">{t(copy,'recordedSalesSources','Recorded order / sales sources')} · <span className="tabular-nums">{sourceBreakdown.sources.length}</span></p>
                <p className="mt-1 text-[10px] text-muted-foreground">{t(copy,'sourceBreakdownHint','Breakdown of sales already counted above, not extra revenue.')}</p>
              </div>
              <a href="#owner-order-sources-analytics" className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-violet-200 bg-background px-2.5 py-1 text-xs font-black text-violet-700 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-violet-900 dark:text-violet-300" aria-label={t(copy,'viewRecordedSources','View recorded sales sources')}>
                <span dir="ltr">{formatMoney(sourceBreakdown.allocatedTotal)}</span><ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </a>
            </div>
          </div>}
        </div>
      </div>
    </section>

    <OwnerOrderSourcesAnalytics
      sales={periodSales} revenueSources={revenueSources} verifiedSales={presentation.sales}
      formatMoney={formatMoney} lang={lang} periodLabel={periodLabel} hasQueryError={hasQueryError} report={sourceBreakdown}
    />

    <section data-testid="snapshot-related-financials" className="min-w-0 rounded-[1.55rem] border border-border/80 bg-card p-3.5 shadow-sm sm:p-5">
      <SectionHeader icon={Layers3} title={t(copy,'relatedFinancials','Related financials')}
        subtitle={t(copy,'relatedFinancialsHint','Purchases, receivables, payables and risks')}/>
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard testId="snapshot-purchases" title={t(copy,'purchases','Purchases')} icon={ShoppingBasket}
          value={formatMoney(periodMetrics.totalPurchaseCost)} tone="rose"
          change={moneyChange(periodMetrics.totalPurchaseCost,prev.totalPurchaseCost)}
          current={periodMetrics.totalPurchaseCost} previous={prev.totalPurchaseCost}
          hint={t(copy,'purchasesHint','Approved purchases in the period')}/>
        <StatCard testId="snapshot-receivables" title={t(copy,'receivables','Receivables')} icon={ReceiptText}
          value={hasQueryError?'—':formatMoney(receivables)} tone="green"
          hint={t(copy,'receivablesHint','Current outstanding customer balance')}/>
        <StatCard testId="snapshot-payables" title={t(copy,'payables','Payables')} icon={Landmark}
          value={hasQueryError?'—':formatMoney(payables)} tone="amber"
          hint={t(copy,'payablesHint','Current unpaid supplier balance')}/>
        <StatCard testId="snapshot-active-risks" title={t(copy,'activeRisks','Active risks')} icon={ShieldAlert}
          value={risksKnown?String(scopedAlerts.length):'—'} tone="rose"
          hint={t(copy,'risksHint','Recorded issues requiring attention')}/>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
        <span className="flex items-center gap-2 text-[11px] font-semibold"><Activity className="h-4 w-4 shrink-0"/>{t(copy,'businessHealthHint','Review active risks and overdue balances regularly.')}</span>
        <button type="button" className="inline-flex items-center gap-1 text-xs font-bold" onClick={()=>navigate('/debts')}>{t(copy,'review','Review')}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180"/></button>
      </div>
    </section>
  </div>;
}
