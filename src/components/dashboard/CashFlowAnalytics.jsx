import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCurrency } from '@/lib/helpers';
import { getDailyCashFlow, getCashFlowSummary, calculateCashBalances } from '@/services/analytics/cashflowAnalytics';
import { getCashFlowForecast } from '@/services/analytics/forecastAnalytics';
import { Card } from '@/components/ui/card';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function CashFlowAnalytics({ branchKey = 'all' }) {
  const { ownerFilter, branches } = useTenant();
  const { t, currency } = useLanguage();
  const [forecastDays, setForecastDays] = React.useState(7);

  // Fetch current cash balances
  const { data: cashBalances = {} } = useQuery({
    queryKey: ['cash_balances', ownerFilter],
    queryFn: async () => {
      const walletTx = await base44.entities.WalletTransaction.filter(ownerFilter || {}, '-transaction_date', 1000);
      return calculateCashBalances(walletTx, branches);
    },
    enabled: !!ownerFilter?.created_by,
    staleTime: 60000,
  });

  // Fetch daily cash flow for the last 30 days
  const { data: dailyCashFlow = [] } = useQuery({
    queryKey: ['daily_cash_flow', ownerFilter, branchKey],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
      return getDailyCashFlow(ownerFilter, thirtyDaysAgo, today, branchKey);
    },
    enabled: !!ownerFilter?.created_by,
    staleTime: 120000,
  });

  // Fetch cash flow summary
  const { data: cashFlowSummary = {} } = useQuery({
    queryKey: ['cash_flow_summary', ownerFilter, branchKey],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
      return getCashFlowSummary(ownerFilter, thirtyDaysAgo, today, branchKey);
    },
    enabled: !!ownerFilter?.created_by,
    staleTime: 120000,
  });

  // Fetch cash flow forecast
  const { data: cashFlowForecast = {} } = useQuery({
    queryKey: ['cash_flow_forecast', ownerFilter, branchKey, forecastDays],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
      return getCashFlowForecast(ownerFilter, thirtyDaysAgo, today, forecastDays, branchKey);
    },
    enabled: !!ownerFilter?.created_by,
    staleTime: 300000,
  });

  // Combine historical and forecasted data for visualization
  const combinedCashFlowData = useMemo(() => {
    const lastHistoricalDate = dailyCashFlow.length > 0 ? dailyCashFlow[dailyCashFlow.length - 1].date : new Date().toISOString().split('T')[0];
    const forecast = cashFlowForecast.expectedCase || [];
    return [...dailyCashFlow, ...forecast];
  }, [dailyCashFlow, cashFlowForecast]);

  return (
    <div className="space-y-4">
      {/* Cash Balances Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 bg-blue-50 dark:bg-blue-950">
          <p className="text-xs text-muted-foreground">{t('owner_network')}</p>
          <p className={`text-lg font-bold ${cashBalances.ownerNetwork >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {formatCurrency(cashBalances.ownerNetwork, currency)}
          </p>
        </Card>
        <Card className="p-3 bg-emerald-50 dark:bg-emerald-950">
          <p className="text-xs text-muted-foreground">{t('owner_cash')}</p>
          <p className={`text-lg font-bold ${cashBalances.ownerCash >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(cashBalances.ownerCash, currency)}
          </p>
        </Card>
        <Card className="p-3 bg-amber-50 dark:bg-amber-950">
          <p className="text-xs text-muted-foreground">{t('branch_cash')}</p>
          <p className={`text-lg font-bold ${cashBalances.totalBranchCash >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
            {formatCurrency(cashBalances.totalBranchCash, currency)}
          </p>
        </Card>
        <Card className="p-3 bg-indigo-50 dark:bg-indigo-950">
          <p className="text-xs text-muted-foreground">{t('total_held')}</p>
          <p className={`text-lg font-bold ${cashBalances.totalHeldByOwner >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
            {formatCurrency(cashBalances.totalHeldByOwner, currency)}
          </p>
        </Card>
      </div>

      {/* Cash Flow Summary */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t('cash_flow_summary')}</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{t('inflows')}</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(cashFlowSummary.totalInflows, currency)}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{t('outflows')}</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(cashFlowSummary.totalOutflows, currency)}</p>
          </div>
          <div className={`${cashFlowSummary.netCashFlow >= 0 ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-red-50 dark:bg-red-950'} rounded-lg p-3 text-center`}>
            <p className="text-xs text-muted-foreground">{t('net_cash_flow')}</p>
            <p className={`text-lg font-bold ${cashFlowSummary.netCashFlow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(cashFlowSummary.netCashFlow, currency)}
            </p>
          </div>
        </div>
      </Card>

      {/* Cash Flow Trend Chart */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">{t('cash_flow_trend')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={combinedCashFlowData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatCurrency(value, currency)} />
            <Legend />
            <Area type="monotone" dataKey="inflows" stackId="1" stroke="#10b981" fill="#d1fae5" name={t('inflows')} />
            <Area type="monotone" dataKey="outflows" stackId="1" stroke="#ef4444" fill="#fee2e2" name={t('outflows')} />
            <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} name={t('net_flow')} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Cash Flow Forecast */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{t('cash_flow_forecast')}</h3>
          <div className="flex gap-2">
            <button onClick={() => setForecastDays(7)} className={`px-3 py-1 text-xs rounded ${forecastDays === 7 ? 'bg-primary text-white' : 'bg-slate-100'}`}>7 {t('days')}</button>
            <button onClick={() => setForecastDays(30)} className={`px-3 py-1 text-xs rounded ${forecastDays === 30 ? 'bg-primary text-white' : 'bg-slate-100'}`}>30 {t('days')}</button>
            <button onClick={() => setForecastDays(90)} className={`px-3 py-1 text-xs rounded ${forecastDays === 90 ? 'bg-primary text-white' : 'bg-slate-100'}`}>90 {t('days')}</button>
          </div>
        </div>

        {/* Best/Expected/Worst Case Scenarios */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{t('best_case')}</p>
            <p className="text-sm font-bold text-green-600">+10%</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{t('expected_case')}</p>
            <p className="text-sm font-bold text-blue-600">Baseline</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{t('worst_case')}</p>
            <p className="text-sm font-bold text-red-600">-10%</p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={cashFlowForecast.expectedCase || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => formatCurrency(value, currency)} />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} name={t('expected_case')} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
