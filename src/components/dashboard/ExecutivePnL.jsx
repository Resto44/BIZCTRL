import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCurrency, formatPct } from '@/lib/helpers';
import { getProfitAndLoss, getProfitAndLossToday, getProfitAndLossThisWeek, getProfitAndLossThisMonth, getProfitAndLossThisQuarter, getProfitAndLossThisYear } from '@/services/analytics/profitAnalytics';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function ExecutivePnL({ branchKey = 'all' }) {
  const { ownerFilter } = useTenant();
  const { t, currency } = useLanguage();
  const [selectedPeriod, setSelectedPeriod] = React.useState('month');

  // Fetch P&L data for the selected period
  const { data: pnlData = {}, isLoading } = useQuery({
    queryKey: ['executive_pnl', ownerFilter, branchKey, selectedPeriod],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      let pnl = {};

      switch (selectedPeriod) {
        case 'today':
          pnl = await getProfitAndLossToday(ownerFilter, branchKey);
          break;
        case 'week':
          pnl = await getProfitAndLossThisWeek(ownerFilter, branchKey);
          break;
        case 'month':
          pnl = await getProfitAndLossThisMonth(ownerFilter, branchKey);
          break;
        case 'quarter':
          pnl = await getProfitAndLossThisQuarter(ownerFilter, branchKey);
          break;
        case 'year':
          pnl = await getProfitAndLossThisYear(ownerFilter, branchKey);
          break;
        default:
          pnl = await getProfitAndLossThisMonth(ownerFilter, branchKey);
      }

      return pnl;
    },
    enabled: !!ownerFilter?.created_by,
    staleTime: 120000,
  });

  // Fetch historical data for trend chart
  const { data: historicalData = [] } = useQuery({
    queryKey: ['executive_pnl_history', ownerFilter, branchKey],
    queryFn: async () => {
      const today = new Date();
      const data = [];

      // Fetch last 30 days of P&L data
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dailyPnL = await getProfitAndLoss(ownerFilter, dateStr, dateStr, branchKey);
        data.push({
          date: dateStr,
          revenue: dailyPnL.revenue,
          cogs: dailyPnL.cogs,
          grossProfit: dailyPnL.grossProfit,
          operatingExpenses: dailyPnL.operatingExpenses,
          netProfit: dailyPnL.netProfit,
        });
      }

      return data;
    },
    enabled: !!ownerFilter?.created_by,
    staleTime: 300000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const pnlMetrics = [
    { label: t('revenue'), value: pnlData.revenue, icon: TrendingUp, color: 'text-blue-600' },
    { label: t('cogs'), value: -pnlData.cogs, icon: TrendingDown, color: 'text-amber-600' },
    { label: t('gross_profit'), value: pnlData.grossProfit, icon: TrendingUp, color: 'text-emerald-600' },
    { label: t('operating_expenses'), value: -pnlData.operatingExpenses, icon: TrendingDown, color: 'text-red-600' },
    { label: t('net_profit'), value: pnlData.netProfit, icon: pnlData.netProfit >= 0 ? TrendingUp : TrendingDown, color: pnlData.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600' },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{t('executive_pnl')}</h2>
          <Tabs value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <TabsList>
              <TabsTrigger value="today" className="text-xs">{t('today')}</TabsTrigger>
              <TabsTrigger value="week" className="text-xs">{t('week')}</TabsTrigger>
              <TabsTrigger value="month" className="text-xs">{t('month')}</TabsTrigger>
              <TabsTrigger value="quarter" className="text-xs">{t('quarter')}</TabsTrigger>
              <TabsTrigger value="year" className="text-xs">{t('year')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* P&L Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          {pnlMetrics.map((metric, idx) => (
            <div key={idx} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{metric.label}</p>
              <p className={`text-sm font-bold ${metric.color}`}>{formatCurrency(metric.value, currency)}</p>
            </div>
          ))}
        </div>

        {/* Margin Indicators */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{t('gross_margin')}</p>
            <p className="text-lg font-bold text-blue-600">{formatPct(pnlData.profitMargin)}</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{t('net_margin')}</p>
            <p className="text-lg font-bold text-emerald-600">{formatPct(pnlData.netProfitMargin)}</p>
          </div>
        </div>
      </Card>

      {/* Historical Trend Chart */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">{t('pnl_trend')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={historicalData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatCurrency(value, currency)} />
            <Legend />
            <Bar dataKey="revenue" fill="#3b82f6" name={t('revenue')} />
            <Bar dataKey="cogs" fill="#f59e0b" name={t('cogs')} />
            <Line type="monotone" dataKey="netProfit" stroke="#10b981" name={t('net_profit')} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
