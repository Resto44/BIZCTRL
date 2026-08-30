import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCurrency, formatPct, getDateRange, formatDate } from '@/lib/helpers';
import { calculateDailySalesTrend } from '@/services/analytics/salesAnalytics';
import { getProfitAndLoss } from '@/services/analytics/profitAnalytics';
import { Card } from '@/components/ui/card';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Percent } from 'lucide-react';

const KPICard = ({ label, value, trend, trendLabel, icon: Icon, color, sparklineData }) => {
  const isPositiveTrend = trend >= 0;

  return (
    <Card className="p-4 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>

      {/* Trend Indicator */}
      {trend !== null && (
        <div className="flex items-center gap-1 mb-3">
          {isPositiveTrend ? (
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-500" />
          )}
          <span className={`text-xs font-semibold ${isPositiveTrend ? 'text-emerald-500' : 'text-red-500'}`}>
            {isPositiveTrend ? '+' : ''}{trend.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">{trendLabel}</span>
        </div>
      )}

      {/* Sparkline Chart */}
      {sparklineData && sparklineData.length > 0 && (
        <ResponsiveContainer width="100%" height={40}>
          <AreaChart data={sparklineData}>
            <Area type="monotone" dataKey="value" fill={color} stroke={color} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};

export default function AdvancedKPICards({ branchKey = 'all' }) {
  const { ownerFilter } = useTenant();
  const { t, currency } = useLanguage();
  const [rangeType, setRangeType] = React.useState('month');

  const dateRange = useMemo(() => getDateRange(rangeType), [rangeType]);
  const fromStr = formatDate(dateRange.from);
  const toStr = formatDate(dateRange.to);

  // Previous period for comparison
  const prevRange = useMemo(() => {
    const diffMs = dateRange.to - dateRange.from;
    return { from: new Date(dateRange.from - diffMs - 86400000), to: new Date(dateRange.from - 86400000) };
  }, [dateRange]);
  const prevFrom = formatDate(prevRange.from);
  const prevTo = formatDate(prevRange.to);

  // Fetch current period P&L
  const { data: currentPnL = {} } = useQuery({
    queryKey: ['kpi_current_pnl', ownerFilter, branchKey, fromStr, toStr],
    queryFn: () => getProfitAndLoss(ownerFilter, fromStr, toStr, branchKey),
    enabled: !!ownerFilter?.created_by,
    staleTime: 120000,
  });

  // Fetch previous period P&L for comparison
  const { data: previousPnL = {} } = useQuery({
    queryKey: ['kpi_previous_pnl', ownerFilter, branchKey, prevFrom, prevTo],
    queryFn: () => getProfitAndLoss(ownerFilter, prevFrom, prevTo, branchKey),
    enabled: !!ownerFilter?.created_by,
    staleTime: 120000,
  });

  // Fetch daily sales trend for sparkline
  const { data: dailySalesTrend = [] } = useQuery({
    queryKey: ['kpi_daily_sales_trend', ownerFilter, branchKey, fromStr, toStr],
    queryFn: async () => {
      const sales = await base44.entities.DailySales.filter(ownerFilter || {}, '-date', 1000);
      const filtered = sales.filter(s => s.date >= fromStr && s.date <= toStr && (branchKey === 'all' || s.branch === branchKey));
      return calculateDailySalesTrend(filtered);
    },
    enabled: !!ownerFilter?.created_by,
    staleTime: 120000,
  });

  // Calculate trends
  const revenueTrend = previousPnL.revenue > 0 ? ((currentPnL.revenue - previousPnL.revenue) / previousPnL.revenue) * 100 : 0;
  const profitTrend = previousPnL.netProfit > 0 ? ((currentPnL.netProfit - previousPnL.netProfit) / previousPnL.netProfit) * 100 : 0;
  const marginTrend = previousPnL.profitMargin > 0 ? ((currentPnL.profitMargin - previousPnL.profitMargin) / previousPnL.profitMargin) * 100 : 0;

  const sparklineData = dailySalesTrend.map(d => ({ value: d.totalSales }));

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['today', 'week', 'month', 'quarter', 'year'].map(period => (
          <button
            key={period}
            onClick={() => setRangeType(period)}
            className={`px-3 py-1 text-xs rounded whitespace-nowrap transition ${rangeType === period ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
          >
            {t(period)}
          </button>
        ))}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label={t('revenue')}
          value={formatCurrency(currentPnL.revenue, currency)}
          trend={revenueTrend}
          trendLabel={t('vs_last_period')}
          icon={DollarSign}
          color="text-blue-600"
          sparklineData={sparklineData}
        />
        <KPICard
          label={t('cogs')}
          value={formatCurrency(currentPnL.cogs, currency)}
          trend={-revenueTrend} // Inverse trend for costs
          trendLabel={t('vs_last_period')}
          icon={ShoppingCart}
          color="text-amber-600"
          sparklineData={[]}
        />
        <KPICard
          label={t('net_profit')}
          value={formatCurrency(currentPnL.netProfit, currency)}
          trend={profitTrend}
          trendLabel={t('vs_last_period')}
          icon={currentPnL.netProfit >= 0 ? TrendingUp : TrendingDown}
          color={currentPnL.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
          sparklineData={[]}
        />
        <KPICard
          label={t('net_margin')}
          value={formatPct(currentPnL.netProfitMargin)}
          trend={marginTrend}
          trendLabel={t('vs_last_period')}
          icon={Percent}
          color="text-violet-600"
          sparklineData={[]}
        />
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-3 bg-blue-50 dark:bg-blue-950">
          <p className="text-xs text-muted-foreground mb-1">{t('gross_profit')}</p>
          <p className="text-lg font-bold text-blue-600">{formatCurrency(currentPnL.grossProfit, currency)}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatPct(currentPnL.profitMargin)} {t('margin')}</p>
        </Card>
        <Card className="p-3 bg-emerald-50 dark:bg-emerald-950">
          <p className="text-xs text-muted-foreground mb-1">{t('operating_expenses')}</p>
          <p className="text-lg font-bold text-emerald-600">{formatCurrency(currentPnL.operatingExpenses, currency)}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatPct((currentPnL.operatingExpenses / currentPnL.revenue) * 100)} {t('of_revenue')}</p>
        </Card>
        <Card className="p-3 bg-indigo-50 dark:bg-indigo-950">
          <p className="text-xs text-muted-foreground mb-1">{t('roi')}</p>
          <p className="text-lg font-bold text-indigo-600">{formatPct((currentPnL.netProfit / currentPnL.revenue) * 100)}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('return_on_revenue')}</p>
        </Card>
      </div>
    </div>
  );
}
