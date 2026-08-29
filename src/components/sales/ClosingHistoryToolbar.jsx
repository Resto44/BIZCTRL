import React, { memo, useMemo } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  ListFilter,
  Store,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';

const numeric = (value) => Number(value) || 0;
const totalSales = (sale) => numeric(sale?.restaurant_cash ?? sale?.cash)
  + numeric(sale?.restaurant_network ?? sale?.network)
  + numeric(sale?.credit)
  + Math.max(0, numeric(sale?.custom_sources_total));
const operatingProfit = (sale) => Number.isFinite(Number(sale?.operating_result))
  ? Number(sale.operating_result)
  : totalSales(sale) - numeric(sale?.approved_purchases_total) - numeric(sale?.expenses_total);
const money = (currency, value) => `${currency} ${numeric(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const FilterSelect = memo(function FilterSelect({ icon: Icon, value, onChange, ariaLabel, children }) {
  return (
    <label className="relative flex min-w-[145px] flex-1 items-center rounded-xl border border-border/80 bg-background shadow-sm">
      <Icon className="pointer-events-none absolute left-3 h-4 w-4 text-foreground" aria-hidden="true" />
      <span className="sr-only">{ariaLabel}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="h-11 w-full appearance-none rounded-xl bg-transparent py-2 pl-10 pr-9 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </label>
  );
});

const PerformanceChart = memo(function PerformanceChart({ records, currency }) {
  const chart = useMemo(() => {
    const days = [...records].slice(0, 7).reverse();
    const values = days.flatMap((record) => [totalSales(record), operatingProfit(record)]);
    const maximum = Math.max(...values, 1);
    const minimum = Math.min(...values, 0);
    const range = Math.max(maximum - minimum, 1);
    const y = (value) => 138 - ((value - minimum) / range) * 104;
    const points = days.map((record, index) => {
      const x = days.length === 1 ? 350 : 58 + (index / (days.length - 1)) * 584;
      return {
        id: record.id || `${record.date}-${index}`,
        date: new Date(`${record.date}T12:00:00`),
        x,
        sales: totalSales(record),
        profit: operatingProfit(record),
        salesY: y(totalSales(record)),
        profitY: y(operatingProfit(record)),
      };
    });
    return { points, profitPath: points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.profitY}`).join(' ') };
  }, [records]);

  if (chart.points.length === 0) return <div className="grid h-44 place-items-center text-xs text-muted-foreground">No closing data for this period</div>;

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox="0 0 700 180" className="h-48 min-w-[620px] w-full" role="img" aria-label={`Sales and profit performance in ${currency}`}>
        {[34, 60, 86, 112, 138].map((lineY) => <line key={lineY} x1="44" x2="656" y1={lineY} y2={lineY} stroke="currentColor" className="text-border/70" strokeDasharray="3 5" />)}
        {chart.points.map((point) => (
          <g key={point.id}>
            <rect x={point.x - 18} y={point.salesY} width="36" height={Math.max(2, 138 - point.salesY)} rx="4" fill="rgb(37 99 235)" />
            <text x={point.x} y="163" textAnchor="middle" fontSize="10" fill="currentColor" className="text-muted-foreground">
              {new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' }).format(point.date)}
            </text>
          </g>
        ))}
        <path d={chart.profitPath} fill="none" stroke="rgb(5 150 105)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {chart.points.map((point) => <circle key={`profit-${point.id}`} cx={point.x} cy={point.profitY} r="4.5" fill="rgb(5 150 105)" stroke="white" strokeWidth="2" />)}
      </svg>
    </div>
  );
});

const StatusMetric = memo(function StatusMetric({ icon: Icon, value, label, tone }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-4 sm:px-5">
      <Icon className={`h-8 w-8 shrink-0 ${tone}`} strokeWidth={1.8} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xl font-black tabular-nums text-foreground">{value}</p>
        <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
        <p className="text-[10px] text-muted-foreground">This period</p>
      </div>
    </div>
  );
});

export default function ClosingHistoryToolbar({
  records,
  allRecords,
  branches,
  filters,
  onFilterChange,
  statusTab,
  onStatusTabChange,
  onExport,
}) {
  const { currency, lang } = useLanguage();
  const months = useMemo(() => Array.from(new Set(allRecords.map((record) => String(record?.date || '').slice(0, 7)).filter((value) => /^\d{4}-\d{2}$/.test(value)))).sort().reverse(), [allRecords]);
  const cashiers = useMemo(() => Array.from(new Set(allRecords.map((record) => record.cashier_name || record.manager_name || '').filter(Boolean))).sort(), [allRecords]);
  const metrics = useMemo(() => records.reduce((summary, record) => {
    const state = record.closing_state || 'finalized';
    const variance = Math.abs(numeric(record.cash_difference)) > 0 || ['Shortage', 'Overage'].includes(record.cash_status);
    return {
      sales: summary.sales + totalSales(record),
      profit: summary.profit + operatingProfit(record),
      count: summary.count + 1,
      finalized: summary.finalized + (state === 'finalized' ? 1 : 0),
      drafts: summary.drafts + (['draft', 'ready'].includes(state) ? 1 : 0),
      variance: summary.variance + (variance ? 1 : 0),
    };
  }, { sales: 0, profit: 0, count: 0, finalized: 0, drafts: 0, variance: 0 }), [records]);
  const monthLabel = (month) => new Intl.DateTimeFormat(lang || 'en', { month: 'short', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));

  return (
    <div className="mb-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">Closing History</h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Track performance and closing activity</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onExport} className="gap-2 rounded-lg">
          <Download className="h-4 w-4" aria-hidden="true" /> Export
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterSelect icon={CalendarDays} value={filters.month} onChange={(value) => onFilterChange('month', value)} ariaLabel="Filter closings by month">
          <option value="all">All months</option>
          {months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
        </FilterSelect>
        <FilterSelect icon={Store} value={filters.branch} onChange={(value) => onFilterChange('branch', value)} ariaLabel="Filter closings by branch">
          <option value="all">All branches</option>
          {branches.map((branch) => <option key={branch.id || branch.key} value={branch.key}>{branch.label || branch.name || branch.key}</option>)}
        </FilterSelect>
        <FilterSelect icon={UserRound} value={filters.cashier} onChange={(value) => onFilterChange('cashier', value)} ariaLabel="Filter closings by cashier">
          <option value="all">All cashiers</option>
          {cashiers.map((cashier) => <option key={cashier} value={cashier}>{cashier}</option>)}
        </FilterSelect>
      </div>

      <section aria-label="Closing performance" className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="grid grid-cols-3 divide-x divide-border/70 px-2 py-4 sm:px-4">
          <div className="min-w-0 px-2 sm:px-4"><p className="text-[10px] text-muted-foreground sm:text-xs">Total Sales</p><p className="mt-1 truncate text-base font-black tabular-nums text-primary sm:text-xl">{money(currency, metrics.sales)}</p></div>
          <div className="min-w-0 px-2 sm:px-4"><p className="text-[10px] text-muted-foreground sm:text-xs">Operating Profit</p><p className={`mt-1 truncate text-base font-black tabular-nums sm:text-xl ${metrics.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{metrics.profit >= 0 ? '+' : '−'}{money(currency, Math.abs(metrics.profit))}</p></div>
          <div className="min-w-0 px-2 sm:px-4"><p className="text-[10px] text-muted-foreground sm:text-xs">Avg Closing</p><p className="mt-1 truncate text-base font-black tabular-nums text-primary sm:text-xl">{money(currency, metrics.count ? metrics.sales / metrics.count : 0)}</p></div>
        </div>
        <div className="border-t border-border/70 px-4 pt-3">
          <div className="flex flex-wrap items-center gap-5 text-[10px] text-muted-foreground sm:text-xs">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-blue-600" />Sales ({currency})</span>
            <span className="flex items-center gap-2"><span className="h-0.5 w-7 bg-emerald-600" />Profit ({currency})</span>
            <span className="ml-auto">Last 7 closings</span>
          </div>
          <PerformanceChart records={records} currency={currency} />
        </div>
      </section>

      <section aria-label="Closing statuses" className="grid grid-cols-3 divide-x divide-border/70 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <StatusMetric icon={CheckCircle2} value={metrics.finalized} label="Finalized" tone="text-emerald-600" />
        <StatusMetric icon={FileText} value={metrics.drafts} label="Drafts" tone="text-slate-600" />
        <StatusMetric icon={TriangleAlert} value={metrics.variance} label="Cash Variance" tone="text-amber-600" />
      </section>

      <div className="grid grid-cols-4 rounded-xl border border-border/80 bg-card px-2" role="tablist" aria-label="Closing status">
        {[
          ['all', 'All'],
          ['finalized', 'Finalized'],
          ['draft', 'Draft'],
          ['variance', 'Variance'],
        ].map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={statusTab === value} onClick={() => onStatusTabChange(value)} className={`relative h-11 text-xs font-semibold transition sm:text-sm ${statusTab === value ? 'text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Newest first</span>
        <ListFilter className="h-4 w-4" aria-hidden="true" />
      </div>
    </div>
  );
}
