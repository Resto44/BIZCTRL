import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  Calculator,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileBarChart,
  Landmark,
  PackageCheck,
  PackageSearch,
  ReceiptText,
  Scale,
  ShieldAlert,
  ShoppingBasket,
  Store,
  Target,
  TrendingUp,
  Truck,
  Users,
  WalletCards,
  Warehouse,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

function text(copy, key, fallback) {
  return copy?.[key] || fallback;
}

function compactNumber(value, decimals = 0) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function Panel({ children, className = '', testId }) {
  return (
    <section data-testid={testId} className={`w-full min-w-0 max-w-full overflow-hidden rounded-[1.45rem] border border-border/80 bg-card p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, badge, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300',
  };
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tones[tone] || tones.blue}`}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight text-foreground sm:text-lg">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {badge ? <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-black text-foreground">{badge}</span> : null}
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'blue', trend }) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50/70 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/35 dark:text-blue-300',
    green: 'border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300',
    violet: 'border-violet-100 bg-violet-50/70 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/35 dark:text-violet-300',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-300',
    rose: 'border-rose-100 bg-rose-50/70 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-300',
    slate: 'border-border bg-muted/35 text-foreground',
  };
  return (
    <div className={`min-w-0 rounded-2xl border p-3.5 ${tones[tone] || tones.blue}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-lg font-black tracking-tight text-foreground sm:text-xl">{value}</p>
        </div>
        {Icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/80 shadow-sm"><Icon className="h-4 w-4" /></span> : null}
      </div>
      {detail ? <p className="mt-1.5 truncate text-[10px] font-semibold text-muted-foreground">{detail}</p> : null}
      {trend != null ? (
        <p className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-black ${trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
        </p>
      ) : null}
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/25 px-4 py-7 text-center text-xs font-semibold text-muted-foreground">{label}</div>;
}

function ReportLinks({ links, copy }) {
  const navigate = useNavigate();
  return (
    <Panel>
      <SectionTitle icon={FileBarChart} title={text(copy, 'reportDirectory', 'Complete report directory')} subtitle={text(copy, 'reportDirectoryHint', 'Open every ERP report without leaving the dashboard')} tone="violet" />
      <nav aria-label={text(copy, 'reportDirectory', 'Complete report directory')} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {links.map(({ label, path, icon: Icon, tone = 'blue' }) => (
          <button key={path} type="button" onClick={() => navigate(path)} className="group flex min-h-14 min-w-0 items-center gap-2.5 rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-start transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1 truncate text-xs font-black text-foreground">{label}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </button>
        ))}
      </nav>
    </Panel>
  );
}

function TrendChart({ data, copy, formatMoney }) {
  if (!data.length) return <EmptyState label={text(copy, 'noPeriodData', 'No recorded data for this period.')} />;
  return (
    <div className="mt-4 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-1">
      <div className="h-56 min-w-[34rem]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} opacity={0.2} />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} width={48} />
            <RechartsTooltip formatter={(value) => formatMoney(value)} contentStyle={{ borderRadius: 14, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
            <Bar dataKey="sales" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={24} />
            <Line dataKey="sales" stroke="#22c55e" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ExecutiveReport({ model, copy }) {
  const {
    formatMoney, todayMetrics, monthMetrics, monthSalesChange, branchRankings,
    scopedAlerts, inventoryOverview, receivables, payables, openQuickAddBranch,
  } = model;
  const navigate = useNavigate();
  return (
    <div data-testid="report-executive" className="w-full min-w-0 max-w-full overflow-x-hidden space-y-4">
      <section className="relative overflow-hidden rounded-[1.65rem] bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-950 p-4 text-white shadow-xl shadow-blue-900/20 sm:p-6">
        <div className="pointer-events-none absolute -end-12 -top-16 h-52 w-52 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold text-blue-100">{text(copy, 'executiveSnapshot', 'Executive snapshot')}</p><h2 className="mt-1 text-xl font-black sm:text-2xl">{text(copy, 'monthToDate', 'Month to date')}</h2></div>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black backdrop-blur">{text(copy, 'verifiedERP', 'VERIFIED ERP')}</span>
          </div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-white/20 rtl:divide-x-reverse">
            {[
              [text(copy, 'sales', 'Sales'), formatMoney(monthMetrics.totalSales)],
              [text(copy, 'netProfit', 'Net profit'), formatMoney(monthMetrics.netProfit)],
              [text(copy, 'netMargin', 'Net margin'), `${monthMetrics.netMargin.toFixed(1)}%`],
            ].map(([label, value], index) => <div key={label} className={`min-w-0 px-2 text-center sm:px-5 ${index === 0 ? '' : ''}`}><p className="truncate text-[10px] font-semibold text-blue-100 sm:text-xs">{label}</p><p className="mt-1 truncate text-base font-black sm:text-2xl">{value}</p></div>)}
          </div>
          {monthSalesChange != null ? <p className={`mt-4 flex items-center justify-center gap-1 text-xs font-black ${monthSalesChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{monthSalesChange >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}{monthSalesChange >= 0 ? '+' : ''}{monthSalesChange.toFixed(1)}% {text(copy, 'vsPreviousMonth', 'vs previous month')}</p> : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label={text(copy, 'todaySales', "Today's sales")} value={formatMoney(todayMetrics.totalSales)} icon={BarChart3} tone="blue" />
        <MetricCard label={text(copy, 'receivables', 'Receivables')} value={formatMoney(receivables)} icon={Landmark} tone="green" />
        <MetricCard label={text(copy, 'payables', 'Payables')} value={formatMoney(payables)} icon={ReceiptText} tone="amber" />
        <MetricCard label={text(copy, 'activeRisks', 'Active risks')} value={compactNumber(scopedAlerts.length)} icon={ShieldAlert} tone={scopedAlerts.length ? 'rose' : 'green'} />
      </div>

      <Panel>
        <SectionTitle icon={Building2} title={text(copy, 'branchCommand', 'Branch command board')} subtitle={text(copy, 'branchCommandHint', "Ranked by today's verified sales")} badge={`${branchRankings.length}`} />
        <div className="mt-4 space-y-2">
          {branchRankings.length ? branchRankings.slice(0, 5).map((branch, index) => (
            <button key={branch.id || branch.key} type="button" onClick={() => { model.selectBranch(branch.id); navigate('/branch-analytics'); }} className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border/70 bg-background p-3 text-start transition hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_auto]">
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-black text-white ${index === 0 ? 'bg-emerald-600' : index === 1 ? 'bg-blue-600' : index === 2 ? 'bg-amber-500' : 'bg-slate-500'}`}>{index + 1}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-black text-foreground">{branch.label}</span><span className="text-[10px] text-muted-foreground">{text(copy, 'health', 'Health')} <strong className={branch.health >= 80 ? 'text-emerald-600' : branch.health >= 60 ? 'text-amber-600' : 'text-rose-600'}>{branch.health ?? '—'}</strong></span></span>
              <span className="hidden sm:block"><span className="block text-[10px] font-bold text-muted-foreground">{text(copy, 'sales', 'Sales')}</span><strong className="text-xs text-foreground">{formatMoney(branch.metrics.totalSales)}</strong></span>
              <span className="hidden sm:block"><span className="block text-[10px] font-bold text-muted-foreground">{text(copy, 'profit', 'Profit')}</span><strong className={branch.metrics.netProfit >= 0 ? 'text-xs text-emerald-600' : 'text-xs text-rose-600'}>{formatMoney(branch.metrics.netProfit)}</strong></span>
              <span className="text-end sm:hidden"><strong className="block text-xs text-foreground">{formatMoney(branch.metrics.totalSales)}</strong></span>
              <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
            </button>
          )) : <EmptyState label={text(copy, 'noBranchData', 'No branch sales have been recorded today.')} />}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle icon={ShieldAlert} title={text(copy, 'ownerAttention', 'Owner attention')} subtitle={text(copy, 'ownerAttentionHint', 'Highest-priority ERP exceptions')} badge={`${scopedAlerts.length}`} tone="rose" />
          <div className="mt-4 space-y-2">
            {scopedAlerts.length ? scopedAlerts.slice(0, 4).map((alert) => <button key={alert.id} type="button" onClick={() => navigate('/alerts')} className="flex w-full items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/60 p-3 text-start dark:border-rose-900/60 dark:bg-rose-950/25"><AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" /><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-foreground">{alert.title}</strong><span className="block truncate text-[10px] text-muted-foreground">{alert.message}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" /></button>) : <EmptyState label={text(copy, 'noRisks', 'No active risks. Operations are clear.')} />}
          </div>
        </Panel>
        <Panel>
          <SectionTitle icon={Warehouse} title={text(copy, 'inventoryPulse', 'Inventory pulse')} subtitle={text(copy, 'inventoryPulseHint', 'Current stock health across the selected scope')} tone="green" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MetricCard label={text(copy, 'stockValue', 'Stock value')} value={formatMoney(inventoryOverview.totalValue)} icon={Boxes} tone="green" />
            <MetricCard label={text(copy, 'activeProducts', 'Active products')} value={compactNumber(inventoryOverview.skuCount)} icon={PackageCheck} tone="blue" />
            <MetricCard label={text(copy, 'lowStock', 'Low stock')} value={compactNumber(inventoryOverview.lowStock)} icon={AlertTriangle} tone="amber" />
            <MetricCard label={text(copy, 'outOfStock', 'Out of stock')} value={compactNumber(inventoryOverview.outOfStock)} icon={PackageSearch} tone="rose" />
          </div>
        </Panel>
      </div>

      <nav data-testid="owner-mega-actions" aria-label="ERP dashboard actions" className="grid grid-cols-2 gap-2 rounded-[1.45rem] border border-border/80 bg-card p-3 shadow-sm sm:grid-cols-4">
        {model.canAddBranch ? <button type="button" onClick={openQuickAddBranch} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background px-3 text-xs font-black"><Building2 className="h-4 w-4 text-emerald-600" />{text(copy, 'addBranch', 'Add branch')}</button> : null}
        <button type="button" onClick={() => navigate('/branch-analytics')} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background px-3 text-xs font-black"><Scale className="h-4 w-4 text-blue-600" />{text(copy, 'compare', 'Compare')}</button>
        <button type="button" onClick={() => navigate('/scheduled-reports')} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background px-3 text-xs font-black"><FileBarChart className="h-4 w-4 text-violet-600" />{text(copy, 'scheduled', 'Scheduled')}</button>
        <button type="button" onClick={() => navigate('/alerts')} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background px-3 text-xs font-black"><ShieldAlert className="h-4 w-4 text-rose-600" />{text(copy, 'alerts', 'Alerts')}</button>
      </nav>

      <ReportLinks copy={copy} links={[
        { label: text(copy, 'branchAnalytics', 'Branch analytics'), path: '/branch-analytics', icon: Building2, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60' },
        { label: text(copy, 'salesAnalytics', 'Sales analytics'), path: '/reports', icon: BarChart3, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60' },
        { label: text(copy, 'biCenter', 'BI center'), path: '/bi-center', icon: Calculator, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60' },
        { label: text(copy, 'activityLog', 'Activity log'), path: '/activity-logs', icon: ClipboardList, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60' },
      ]} />
    </div>
  );
}

function FinancialReport({ model, copy }) {
  const { formatMoney, monthMetrics, previousMonthMetrics, expenseGroups, revenueTrend, receivables, payables, cashRegister } = model;
  const revenueBreakdown = [
    { label: text(copy, 'cash', 'Cash'), value: monthMetrics.totalCash, color: 'bg-emerald-500' },
    { label: text(copy, 'network', 'Network'), value: monthMetrics.totalNetwork, color: 'bg-blue-500' },
    { label: text(copy, 'credit', 'Credit'), value: monthMetrics.totalCredit, color: 'bg-violet-500' },
    { label: text(copy, 'otherSources', 'Other sources'), value: monthMetrics.totalAdditionalSources, color: 'bg-amber-500' },
  ];
  const maxExpense = Math.max(...expenseGroups.map((row) => row.amount), 1);
  const operatingCash = monthMetrics.totalCash + monthMetrics.totalNetwork - monthMetrics.totalPurchaseCost - monthMetrics.totalExpenses;
  return (
    <div data-testid="report-finance" className="w-full min-w-0 max-w-full overflow-x-hidden space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label={text(copy, 'revenue', 'Revenue')} value={formatMoney(monthMetrics.totalSales)} icon={CircleDollarSign} tone="blue" trend={model.monthSalesChange} />
        <MetricCard label={text(copy, 'grossProfit', 'Gross profit')} value={formatMoney(monthMetrics.grossProfit)} icon={TrendingUp} tone="green" />
        <MetricCard label={text(copy, 'operatingExpense', 'Operating expense')} value={formatMoney(monthMetrics.totalExpenses)} icon={ReceiptText} tone="amber" />
        <MetricCard label={text(copy, 'netProfit', 'Net profit')} value={formatMoney(monthMetrics.netProfit)} icon={BadgeDollarSign} tone={monthMetrics.netProfit >= 0 ? 'violet' : 'rose'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Panel>
          <SectionTitle icon={BarChart3} title={text(copy, 'revenueTrend', 'Revenue trend')} subtitle={text(copy, 'revenueTrendHint', 'Verified daily revenue for the current month')} badge={text(copy, 'monthToDate', 'Month to date')} />
          <TrendChart data={revenueTrend} copy={copy} formatMoney={formatMoney} />
        </Panel>
        <Panel>
          <SectionTitle icon={WalletCards} title={text(copy, 'revenueMix', 'Revenue mix')} subtitle={text(copy, 'revenueMixHint', 'Payment and configured sales sources')} tone="violet" />
          <div className="mt-4 space-y-3">
            {revenueBreakdown.map((row) => {
              const pct = monthMetrics.totalSales > 0 ? (row.value / monthMetrics.totalSales) * 100 : 0;
              return <div key={row.label}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="font-bold text-foreground">{row.label}</span><span className="font-black text-foreground">{formatMoney(row.value)} <span className="text-muted-foreground">· {pct.toFixed(1)}%</span></span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.min(100, pct)}%` }} /></div></div>;
            })}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle icon={ReceiptText} title={text(copy, 'expenseControl', 'Expense control')} subtitle={text(copy, 'expenseControlHint', 'Month-to-date spending by ERP category')} tone="amber" />
          <div className="mt-4 space-y-3">
            {expenseGroups.length ? expenseGroups.slice(0, 7).map((row) => <div key={row.name}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-bold text-foreground">{row.name}</span><strong className="shrink-0 text-foreground">{formatMoney(row.amount)}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(4, (row.amount / maxExpense) * 100)}%` }} /></div></div>) : <EmptyState label={text(copy, 'noExpenseData', 'No expenses recorded for this period.')} />}
          </div>
        </Panel>
        <Panel>
          <SectionTitle icon={Landmark} title={text(copy, 'cashAndObligations', 'Cash & obligations')} subtitle={text(copy, 'cashAndObligationsHint', 'Liquidity, receivables and supplier exposure')} tone="green" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MetricCard label={text(copy, 'register', 'Cash register')} value={formatMoney(cashRegister)} icon={Banknote} tone="violet" />
            <MetricCard label={text(copy, 'operatingCash', 'Operating cash')} value={formatMoney(operatingCash)} icon={CreditCard} tone={operatingCash >= 0 ? 'green' : 'rose'} />
            <MetricCard label={text(copy, 'receivables', 'Receivables')} value={formatMoney(receivables)} icon={Landmark} tone="blue" />
            <MetricCard label={text(copy, 'payables', 'Payables')} value={formatMoney(payables)} icon={ReceiptText} tone="amber" />
          </div>
          <div className="mt-3 rounded-2xl border border-border bg-muted/30 p-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">{text(copy, 'previousMonthSales', 'Previous month sales')}</span><strong>{formatMoney(previousMonthMetrics.totalSales)}</strong></div>
            <div className="mt-2 flex justify-between"><span className="text-muted-foreground">{text(copy, 'previousMonthProfit', 'Previous month profit')}</span><strong>{formatMoney(previousMonthMetrics.netProfit)}</strong></div>
          </div>
        </Panel>
      </div>

      <ReportLinks copy={copy} links={[
        { label: text(copy, 'profitLoss', 'Profit & loss'), path: '/profit-loss', icon: BadgeDollarSign, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60' },
        { label: text(copy, 'cashFlow', 'Cash flow'), path: '/cashflow', icon: WalletCards, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60' },
        { label: text(copy, 'balanceSheet', 'Balance sheet'), path: '/balance-sheet', icon: Scale, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60' },
        { label: text(copy, 'expenses', 'Expenses'), path: '/expenses', icon: ReceiptText, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60' },
        { label: text(copy, 'purchases', 'Purchases'), path: '/purchases', icon: ShoppingBasket, tone: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60' },
        { label: text(copy, 'supplierLedger', 'Supplier ledger'), path: '/supplier-ledger', icon: Truck, tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800' },
        { label: text(copy, 'debts', 'Debts'), path: '/debts', icon: Landmark, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60' },
        { label: text(copy, 'treasury', 'Treasury'), path: '/treasury', icon: Banknote, tone: 'bg-green-50 text-green-600 dark:bg-green-950/60' },
      ]} />
    </div>
  );
}

function OperationsReport({ model, copy }) {
  const { formatMoney, consumption, inventoryOverview, todayPurchaseQuantity, todayPurchaseCost, supplierCount } = model;
  return (
    <div data-testid="report-operations" className="w-full min-w-0 max-w-full overflow-x-hidden space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label={text(copy, 'ingredientsUsed', 'Ingredients used')} value={compactNumber(consumption.totalQuantity, 2)} detail={text(copy, 'verifiedMovements', 'Verified stock movements')} icon={ShoppingBasket} tone="blue" />
        <MetricCard label={text(copy, 'consumptionCost', 'Consumption cost')} value={formatMoney(consumption.totalCost)} icon={Calculator} tone="violet" />
        <MetricCard label={text(copy, 'wasteCost', 'Waste cost')} value={formatMoney(consumption.wasteCost)} detail={`${compactNumber(consumption.wasteQuantity, 2)} ${text(copy, 'units', 'units')}`} icon={AlertTriangle} tone={consumption.wasteCost > 0 ? 'rose' : 'green'} />
        <MetricCard label={text(copy, 'stockValue', 'Stock value')} value={formatMoney(inventoryOverview.totalValue)} icon={Warehouse} tone="green" />
      </div>

      <Panel>
        <SectionTitle icon={ShoppingBasket} title={text(copy, 'todayConsumption', "Today's ingredient consumption")} subtitle={text(copy, 'todayConsumptionHint', 'Calculated from approved sales and inventory movements — not purchase quantities')} badge={`${consumption.items.length}`} tone="green" />
        <div className="mt-4 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
          {consumption.items.length ? (
            <div className="min-w-[42rem]">
              <div className="grid grid-cols-[minmax(12rem,1.5fr)_7rem_8rem_8rem_7rem] gap-3 border-b border-border px-3 pb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                <span>{text(copy, 'product', 'Product')}</span><span>{text(copy, 'used', 'Used')}</span><span>{text(copy, 'usageCost', 'Usage cost')}</span><span>{text(copy, 'stockLeft', 'Stock left')}</span><span>{text(copy, 'status', 'Status')}</span>
              </div>
              <div className="divide-y divide-border/70">
                {consumption.items.slice(0, 10).map((item) => {
                  const low = item.stock != null && item.stock <= item.quantity;
                  return <div key={item.productId} className="grid grid-cols-[minmax(12rem,1.5fr)_7rem_8rem_8rem_7rem] items-center gap-3 px-3 py-3 text-xs"><span className="flex min-w-0 items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60"><ShoppingBasket className="h-4 w-4" /></span><strong className="truncate text-foreground">{item.name}</strong></span><strong>{compactNumber(item.quantity, 2)} {item.unit}</strong><span>{formatMoney(item.cost, 2)}</span><span>{item.stock == null ? '—' : `${compactNumber(item.stock, 2)} ${item.unit}`}</span><span className={`w-fit rounded-full px-2 py-1 text-[10px] font-black ${low ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'}`}>{low ? text(copy, 'review', 'Review') : text(copy, 'healthy', 'Healthy')}</span></div>;
                })}
              </div>
            </div>
          ) : <EmptyState label={text(copy, 'noConsumptionData', 'No ingredient-consumption movement is recorded today. Configure recipes or sales inventory deduction to populate this report.')} />}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle icon={Truck} title={text(copy, 'procurementPulse', 'Procurement pulse')} subtitle={text(copy, 'procurementPulseHint', "Today's approved supplier receipts")} tone="blue" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MetricCard label={text(copy, 'purchasedQty', 'Purchased qty')} value={compactNumber(todayPurchaseQuantity, 2)} icon={Boxes} tone="blue" />
            <MetricCard label={text(copy, 'purchaseCost', 'Purchase cost')} value={formatMoney(todayPurchaseCost)} icon={ReceiptText} tone="violet" />
            <MetricCard label={text(copy, 'suppliers', 'Suppliers')} value={compactNumber(supplierCount)} icon={Truck} tone="green" />
          </div>
        </Panel>
        <Panel>
          <SectionTitle icon={Warehouse} title={text(copy, 'stockHealth', 'Stock health')} subtitle={text(copy, 'stockHealthHint', 'Availability risks in the selected branch scope')} tone="amber" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MetricCard label={text(copy, 'products', 'Products')} value={compactNumber(inventoryOverview.skuCount)} icon={PackageCheck} tone="slate" />
            <MetricCard label={text(copy, 'lowStock', 'Low stock')} value={compactNumber(inventoryOverview.lowStock)} icon={AlertTriangle} tone="amber" />
            <MetricCard label={text(copy, 'outOfStock', 'Out of stock')} value={compactNumber(inventoryOverview.outOfStock)} icon={PackageSearch} tone="rose" />
          </div>
        </Panel>
      </div>

      <ReportLinks copy={copy} links={[
        { label: text(copy, 'inventoryCommand', 'Inventory command'), path: '/inventory-command-center', icon: Warehouse, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60' },
        { label: text(copy, 'inventoryLedger', 'Inventory ledger'), path: '/inventory', icon: Boxes, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60' },
        { label: text(copy, 'wasteReport', 'Waste report'), path: '/inventory-waste', icon: AlertTriangle, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60' },
        { label: text(copy, 'stockTransfers', 'Stock transfers'), path: '/inventory-transfers', icon: Truck, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60' },
        { label: text(copy, 'productMaster', 'Product master'), path: '/product-management', icon: PackageCheck, tone: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60' },
        { label: text(copy, 'procurement', 'Procurement'), path: '/procurement-dashboard', icon: ShoppingBasket, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60' },
        { label: text(copy, 'suppliers', 'Suppliers'), path: '/suppliers', icon: Truck, tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800' },
        { label: text(copy, 'peoplePayroll', 'People & payroll'), path: '/employees', icon: Users, tone: 'bg-green-50 text-green-600 dark:bg-green-950/60' },
      ]} />
    </div>
  );
}

function PriceControlReport({ model, copy }) {
  const { formatMoney, priceReport, supplierComparisons, branchPriceInconsistencies, priceHistory } = model;
  const navigate = useNavigate();
  return (
    <div data-testid="report-price-control" className="w-full min-w-0 max-w-full overflow-x-hidden space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label={text(copy, 'targetMargin', 'Target margin')} value={`${priceReport.targetMargin}%`} icon={Target} tone="blue" />
        <MetricCard label={text(copy, 'averageMargin', 'Average margin')} value={priceReport.averageMargin == null ? '—' : `${priceReport.averageMargin.toFixed(1)}%`} icon={TrendingUp} tone={priceReport.averageMargin != null && priceReport.averageMargin >= priceReport.targetMargin ? 'green' : 'amber'} />
        <MetricCard label={text(copy, 'costIncreases', 'Cost increases')} value={compactNumber(priceReport.increaseCount)} detail={text(copy, 'last30Days', 'Last 30 days')} icon={ArrowUpRight} tone={priceReport.increaseCount ? 'rose' : 'green'} />
        <MetricCard label={text(copy, 'needsAction', 'Needs action')} value={compactNumber(priceReport.criticalCount + priceReport.watchCount)} detail={`${priceReport.criticalCount} ${text(copy, 'critical', 'critical')}`} icon={ShieldAlert} tone={priceReport.criticalCount ? 'rose' : 'green'} />
      </div>

      <Panel>
        <SectionTitle icon={BadgeDollarSign} title={text(copy, 'marginIntelligence', 'Margin intelligence')} subtitle={text(copy, 'marginIntelligenceHint', 'Current cost, selling price and target-based recommendation')} badge={`${priceReport.rows.length}`} tone="violet" />
        <div className="mt-4 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
          {priceReport.rows.length ? (
            <div className="min-w-[50rem]">
              <div className="grid grid-cols-[minmax(12rem,1.5fr)_7rem_7rem_7rem_8rem_7rem] gap-3 border-b border-border px-3 pb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground"><span>{text(copy, 'product', 'Product')}</span><span>{text(copy, 'cost', 'Cost')}</span><span>{text(copy, 'sellingPrice', 'Selling price')}</span><span>{text(copy, 'margin', 'Margin')}</span><span>{text(copy, 'suggestedPrice', 'Suggested price')}</span><span>{text(copy, 'status', 'Status')}</span></div>
              <div className="divide-y divide-border/70">
                {priceReport.rows.slice(0, 12).map((row) => {
                  const tone = row.status === 'critical' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300' : row.status === 'watch' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300' : row.status === 'healthy' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300' : 'bg-muted text-muted-foreground';
                  return <button key={row.productId} type="button" onClick={() => navigate('/product-management')} className="grid w-full grid-cols-[minmax(12rem,1.5fr)_7rem_7rem_7rem_8rem_7rem] items-center gap-3 px-3 py-3 text-start text-xs transition hover:bg-muted/35"><span className="min-w-0"><strong className="block truncate text-foreground">{row.name}</strong>{row.costChangePct != null ? <span className={`text-[10px] font-black ${row.costChangePct > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{row.costChangePct > 0 ? '+' : ''}{row.costChangePct.toFixed(1)}% {text(copy, 'costChange', 'cost change')}</span> : null}</span><span>{row.cost ? formatMoney(row.cost, 2) : '—'}</span><span>{row.sellingPrice ? formatMoney(row.sellingPrice, 2) : '—'}</span><strong className={row.margin != null && row.margin >= priceReport.targetMargin ? 'text-emerald-600' : 'text-rose-600'}>{row.margin == null ? '—' : `${row.margin.toFixed(1)}%`}</strong><strong className="text-blue-600 dark:text-blue-300">{row.suggestedPrice ? formatMoney(row.suggestedPrice, 2) : '—'}</strong><span className={`w-fit rounded-full px-2 py-1 text-[10px] font-black ${tone}`}>{text(copy, row.status, row.status)}</span></button>;
                })}
              </div>
            </div>
          ) : <EmptyState label={text(copy, 'noPriceData', 'No product price data is available. Add cost and selling prices in Product Master.')} />}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionTitle icon={Truck} title={text(copy, 'supplierComparison', 'Supplier rate comparison')} subtitle={text(copy, 'supplierComparisonHint', 'Latest recorded offer per supplier and product')} badge={`${supplierComparisons.length}`} tone="green" />
          <div className="mt-4 space-y-2">
            {supplierComparisons.length ? supplierComparisons.slice(0, 5).map((group) => <div key={group.productId} className="rounded-2xl border border-border/70 bg-background p-3"><div className="flex items-center justify-between gap-3"><strong className="truncate text-xs text-foreground">{group.name}</strong><span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">{text(copy, 'save', 'Save')} {formatMoney(group.saving, 2)}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"><span className="rounded-xl bg-emerald-50 p-2 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"><strong className="block truncate">{group.best.supplier}</strong>{formatMoney(group.best.price, 2)}</span><span className="rounded-xl bg-rose-50 p-2 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><strong className="block truncate">{group.highest.supplier}</strong>{formatMoney(group.highest.price, 2)}</span></div></div>) : <EmptyState label={text(copy, 'noSupplierComparison', 'No product has rates from multiple suppliers in the selected 30-day history.')} />}
          </div>
        </Panel>
        <Panel>
          <SectionTitle icon={Building2} title={text(copy, 'branchRateConsistency', 'Branch rate consistency')} subtitle={text(copy, 'branchRateConsistencyHint', 'Products with different recorded costs across branches')} badge={`${branchPriceInconsistencies.length}`} tone="amber" />
          <div className="mt-4 space-y-2">
            {branchPriceInconsistencies.length ? branchPriceInconsistencies.slice(0, 6).map((group) => <div key={group.productId} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background p-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60"><Store className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-foreground">{group.name}</strong><span className="block truncate text-[10px] text-muted-foreground">{group.branches.map((branch) => `${branch.branch}: ${formatMoney(branch.price, 2)}`).join(' · ')}</span></span><strong className="shrink-0 text-xs text-amber-700 dark:text-amber-300">Δ {formatMoney(group.spread, 2)}</strong></div>) : <EmptyState label={text(copy, 'consistentRates', 'No cross-branch cost difference is recorded in the selected history.')} />}
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionTitle icon={ClipboardList} title={text(copy, 'rateAudit', 'Rate audit trail')} subtitle={text(copy, 'rateAuditHint', 'Recent supplier cost changes recorded by ERP')} badge={`${priceHistory.length}`} tone="blue" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {priceHistory.length ? priceHistory.slice(0, 6).map((row) => <div key={row.id} className="rounded-2xl border border-border/70 bg-background p-3"><div className="flex items-start justify-between gap-2"><strong className="min-w-0 truncate text-xs text-foreground">{row.product_name}</strong><span className={`shrink-0 text-[10px] font-black ${Number(row.difference) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{Number(row.difference) > 0 ? '+' : ''}{Number(row.pct_change || 0).toFixed(1)}%</span></div><div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{formatMoney(row.previous_price, 2)} → <strong className="text-foreground">{formatMoney(row.new_price, 2)}</strong></span><span className="truncate">{row.supplier_name || row.branch || 'ERP'}</span></div></div>) : <EmptyState label={text(copy, 'noRateChanges', 'No supplier rate changes were recorded in the last 30 days.')} />}
        </div>
      </Panel>

      <ReportLinks copy={copy} links={[
        { label: text(copy, 'priceOptimization', 'Price optimization'), path: '/price-optimization', icon: Target, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60' },
        { label: text(copy, 'productMaster', 'Product master'), path: '/product-management', icon: PackageCheck, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60' },
        { label: text(copy, 'supplierLedger', 'Supplier ledger'), path: '/supplier-ledger', icon: Truck, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60' },
        { label: text(copy, 'purchaseOrders', 'Purchase orders'), path: '/purchase-orders', icon: ClipboardList, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60' },
      ]} />
    </div>
  );
}

export default function OwnerReportCenter({ activePage, model, copy }) {
  if (activePage === 'finance') return <FinancialReport model={model} copy={copy} />;
  if (activePage === 'operations') return <OperationsReport model={model} copy={copy} />;
  if (activePage === 'price-control') return <PriceControlReport model={model} copy={copy} />;
  return <ExecutiveReport model={model} copy={copy} />;
}
