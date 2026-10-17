/**
 * EnterpriseUIComponents — Section 15
 * Premium enterprise UI polish:
 * - Glassmorphism KPI cards with gradient accents
 * - Executive-grade typography and spacing
 * - Recharts-powered analytics (memoized)
 * - Dark mode support via Tailwind dark: classes
 * - Responsive layouts (mobile → tablet → desktop)
 * - Smooth entrance animations (framer-motion optional, CSS fallback)
 * - RTL-aware flex directions
 */

import React, { memo, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, AlertCircle,
  DollarSign, ShoppingCart, Star, Package,
  BarChart3, ArrowUpRight, ArrowDownRight, Zap
} from 'lucide-react';

// ── Color palette (chart-safe, dark-mode aware) ───────────────────────────────
export const CHART_COLORS = {
  primary:  'hsl(221, 83%, 53%)',   // blue
  success:  'hsl(142, 71%, 45%)',   // emerald
  warning:  'hsl(38, 92%, 50%)',    // amber
  danger:   'hsl(0, 84%, 60%)',     // red
  purple:   'hsl(262, 83%, 58%)',   // purple
  cyan:     'hsl(188, 94%, 43%)',   // cyan
  slate:    'hsl(215, 16%, 47%)',   // slate
};

const PIE_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.purple,
  CHART_COLORS.cyan,
];

// ── Glassmorphism Executive KPI Card ─────────────────────────────────────────
export const GlassKPICard = memo(function GlassKPICard({
  icon: Icon,
  label,
  value,
  sublabel,
  trend,
  trendLabel,
  accentColor = 'blue',
  urgent = false,
  isTextValue = false,
}) {
  const accentMap = {
    blue:    { gradient: 'from-blue-500/10 to-blue-600/5',    icon: 'text-blue-600 dark:text-blue-400',    ring: 'ring-blue-500/20',    glow: 'shadow-blue-500/10' },
    emerald: { gradient: 'from-emerald-500/10 to-emerald-600/5', icon: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/20', glow: 'shadow-emerald-500/10' },
    amber:   { gradient: 'from-amber-500/10 to-amber-600/5',  icon: 'text-amber-600 dark:text-amber-400',  ring: 'ring-amber-500/20',  glow: 'shadow-amber-500/10' },
    red:     { gradient: 'from-red-500/10 to-red-600/5',      icon: 'text-red-600 dark:text-red-400',      ring: 'ring-red-500/20',    glow: 'shadow-red-500/10' },
    purple:  { gradient: 'from-purple-500/10 to-purple-600/5',icon: 'text-purple-600 dark:text-purple-400',ring: 'ring-purple-500/20', glow: 'shadow-purple-500/10' },
    cyan:    { gradient: 'from-cyan-500/10 to-cyan-600/5',    icon: 'text-cyan-600 dark:text-cyan-400',    ring: 'ring-cyan-500/20',   glow: 'shadow-cyan-500/10' },
    slate:   { gradient: 'from-slate-500/10 to-slate-600/5',  icon: 'text-slate-600 dark:text-slate-400',  ring: 'ring-slate-500/20',  glow: 'shadow-slate-500/10' },
  };

  const a = accentMap[accentColor] || accentMap.blue;

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border border-border/50
        bg-gradient-to-br ${a.gradient}
        backdrop-blur-sm
        shadow-sm hover:shadow-md ${a.glow}
        transition-all duration-200
        ${urgent ? 'ring-2 ring-red-500/40 animate-pulse-subtle' : ''}
        min-w-0 p-3 sm:p-4
      `}
    >
      {/* Background glow blob */}
      <div
        className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${a.gradient} blur-2xl opacity-60 pointer-events-none`}
      />

      <div className="relative z-10 min-w-0">
        {/* Icon + trend row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className={`w-10 h-10 rounded-xl bg-background/80 backdrop-blur-sm ring-1 ${a.ring} flex items-center justify-center shrink-0`}>
            <Icon className={`w-5 h-5 ${a.icon}`} />
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
              trend >= 0
                ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-950/60'
                : 'text-red-700 dark:text-red-400 bg-red-100/80 dark:bg-red-950/60'
            }`}>
              {trend >= 0
                ? <ArrowUpRight className="w-3 h-3" />
                : <ArrowDownRight className="w-3 h-3" />
              }
              {Math.abs(trend)}%
            </div>
          )}
        </div>

        {/* Value */}
        <p
          dir={isTextValue ? 'auto' : 'ltr'}
          title={isTextValue ? String(value) : undefined}
          className={isTextValue
            ? 'min-w-0 min-h-12 text-start text-[clamp(0.88rem,3.7vw,1.15rem)] sm:text-lg font-bold leading-6 text-foreground break-words [overflow-wrap:anywhere] line-clamp-2'
            : 'min-w-0 text-start text-[clamp(0.95rem,4.5vw,1.5rem)] sm:text-2xl font-extrabold leading-tight tracking-tight text-foreground tabular-nums break-words [overflow-wrap:anywhere]'}
        >
          {value}
        </p>

        {/* Label */}
        <p className="min-w-0 mt-2 text-xs font-semibold leading-5 text-muted-foreground break-words">{label}</p>

        {/* Sublabel / trend label */}
        {(sublabel || trendLabel) && (
          <p className="min-w-0 mt-0.5 text-[11px] leading-4 text-muted-foreground/80 break-words">{sublabel || trendLabel}</p>
        )}
      </div>
    </div>
  );
});

// ── Executive KPI Grid ────────────────────────────────────────────────────────
export const ExecutiveKPIGrid = memo(function ExecutiveKPIGrid({ kpis, currency, t }) {
  const cards = useMemo(() => [
    {
      icon: ShoppingCart,
      label: t?.('purchases_today') || 'Purchases Today',
      value: `${currency}${(kpis.purchasesToday || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      accentColor: 'blue',
      sublabel: t?.('today') || 'Today',
    },
    {
      icon: TrendingUp,
      label: t?.('this_month') || 'This Month',
      value: `${currency}${(kpis.purchasesThisMonth || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      accentColor: 'purple',
      sublabel: t?.('monthly_total') || 'Monthly total',
    },
    {
      icon: DollarSign,
      label: t?.('payables') || 'Outstanding',
      value: `${currency}${(kpis.outstandingPayables || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      accentColor: kpis.outstandingPayables > 0 ? 'amber' : 'emerald',
      urgent: false,
      sublabel: t?.('accounts_payable') || 'Accounts payable',
    },
    {
      icon: AlertCircle,
      label: t?.('overdue') || 'Overdue',
      value: `${currency}${(kpis.overduePayables || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      accentColor: kpis.overduePayables > 0 ? 'red' : 'emerald',
      urgent: kpis.overduePayables > 0,
      sublabel: kpis.overduePayables > 0 ? 'Action required' : 'All clear',
    },
    {
      icon: Star,
      label: t?.('top_supplier') || 'Top Supplier',
      value: kpis.topSupplier || '—',
      isTextValue: true,
      accentColor: 'cyan',
      sublabel: t?.('by_spend') || 'By spend',
    },
    {
      icon: Package,
      label: t?.('most_purchased') || 'Most Purchased',
      value: kpis.mostPurchasedProduct || '—',
      isTextValue: true,
      accentColor: 'slate',
      sublabel: t?.('by_quantity') || 'By quantity',
    },
    {
      icon: BarChart3,
      label: t?.('avg_purchase_cost') || 'Avg Invoice',
      value: `${currency}${(kpis.avgPurchaseCost || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      accentColor: 'slate',
      sublabel: t?.('per_invoice') || 'Per invoice',
    },
    {
      icon: Zap,
      label: t?.('inventory_value_added') || 'Inventory Value',
      value: `${currency}${(kpis.inventoryValueAdded || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      accentColor: 'emerald',
      sublabel: t?.('approved_received') || 'Approved + received',
    },
  ], [kpis, currency, t]);

  return (
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
      {cards.map((card, i) => (
        <GlassKPICard key={i} {...card} />
      ))}
    </div>
  );
});

// ── Custom Recharts Tooltip ───────────────────────────────────────────────────
const CustomTooltip = memo(function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-xl p-3 text-xs min-w-[120px]">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
          </div>
          <span className="font-semibold text-foreground">
            {currency}{(entry.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
});

// ── Monthly Spend Area Chart ──────────────────────────────────────────────────
export const MonthlySpendChart = memo(function MonthlySpendChart({ data, currency, t }) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="paidGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${currency}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
        />
        <Tooltip content={<CustomTooltip currency={currency} />} />
        <Legend
          wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
          iconType="circle"
          iconSize={8}
        />
        <Area
          type="monotone"
          dataKey="total"
          name={t?.('total_spend') || 'Total Spend'}
          stroke={CHART_COLORS.primary}
          strokeWidth={2}
          fill="url(#spendGradient)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="paid"
          name={t?.('paid') || 'Paid'}
          stroke={CHART_COLORS.success}
          strokeWidth={2}
          fill="url(#paidGradient)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
});

// ── Supplier Spend Bar Chart ──────────────────────────────────────────────────
export const SupplierSpendChart = memo(function SupplierSpendChart({ data, currency, t }) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">
        No supplier data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={20}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={36}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${currency}${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
        />
        <Tooltip content={<CustomTooltip currency={currency} />} />
        <Bar
          dataKey="spend"
          name={t?.('total_spend') || 'Total Spend'}
          fill={CHART_COLORS.primary}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
});

// ── Payment Status Pie Chart ──────────────────────────────────────────────────
export const PaymentStatusPie = memo(function PaymentStatusPie({ data, t: _t }) {
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">
        No data
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={120} height={120}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={32}
            outerRadius={52}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [value, '']}
            contentStyle={{
              background: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '11px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex-1 space-y-1.5">
        {data.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              <span className="text-muted-foreground capitalize">{entry.name}</span>
            </div>
            <span className="font-semibold text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Enterprise Section Header ─────────────────────────────────────────────────
export const SectionHeader = memo(function SectionHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground tracking-tight truncate">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
});

// ── Enterprise Alert Banner ───────────────────────────────────────────────────
export const EnterpriseBanner = memo(function EnterpriseBanner({
  type = 'warning', // 'warning' | 'danger' | 'info' | 'success'
  icon: Icon,
  title,
  items = [],
  action,
  maxItems = 3,
}) {
  const config = {
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'border-amber-200 dark:border-amber-800',
      title: 'text-amber-800 dark:text-amber-200',
      text: 'text-amber-700 dark:text-amber-300',
      icon: 'text-amber-600 dark:text-amber-400',
    },
    danger: {
      bg: 'bg-red-50 dark:bg-red-950/40',
      border: 'border-red-200 dark:border-red-800',
      title: 'text-red-800 dark:text-red-200',
      text: 'text-red-700 dark:text-red-300',
      icon: 'text-red-600 dark:text-red-400',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      border: 'border-blue-200 dark:border-blue-800',
      title: 'text-blue-800 dark:text-blue-200',
      text: 'text-blue-700 dark:text-blue-300',
      icon: 'text-blue-600 dark:text-blue-400',
    },
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'border-emerald-200 dark:border-emerald-800',
      title: 'text-emerald-800 dark:text-emerald-200',
      text: 'text-emerald-700 dark:text-emerald-300',
      icon: 'text-emerald-600 dark:text-emerald-400',
    },
  };

  const c = config[type] || config.warning;

  return (
    <div className={`rounded-2xl border ${c.bg} ${c.border} p-3.5`}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className={`w-4 h-4 ${c.icon} shrink-0`} />}
        <span className={`text-sm font-semibold ${c.title}`}>{title}</span>
      </div>
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.slice(0, maxItems).map((item, i) => (
            <div key={i} className={`flex items-center justify-between text-xs ${c.text}`}>
              <span className="truncate flex-1 min-w-0 me-2">{item.label}</span>
              {item.value && <span className="font-semibold shrink-0">{item.value}</span>}
              {item.badge && (
                <Badge className={`text-[9px] ms-1 shrink-0 ${item.badgeCls || ''}`}>
                  {item.badge}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
});

// ── Skeleton Loader ───────────────────────────────────────────────────────────
export const PurchaseSkeleton = memo(function PurchaseSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* KPI grid skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted/60" />
        ))}
      </div>
      {/* Chart skeleton */}
      <div className="h-52 rounded-2xl bg-muted/60" />
      {/* List skeleton */}
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-muted/60" />
      ))}
    </div>
  );
});
