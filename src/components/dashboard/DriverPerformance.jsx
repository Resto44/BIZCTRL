import React, { memo, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, BarChart3, CreditCard, DollarSign, Package, Truck, Users } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import DriverTrendAnalytics from '@/components/dashboard/DriverTrendAnalytics';
import {
  buildBranchDriverAnalytics,
  buildDriverSalesAnalytics,
  DRIVER_ANALYTICS_PERIODS,
  getDriverAnalyticsDateRange,
} from '@/lib/driverAnalytics';

const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const branchKey = (branch) => branch?.key || branch?.branch_key || '';

function money(value, currency) {
  return `${currency || '$'}${(Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

const DriverPerformance = memo(function DriverPerformance({
  restaurantId,
  branches,
  selectedBranch,
  currency,
  title,
  description,
}) {
  const [period, setPeriod] = useState('today');
  const range = useMemo(() => getDriverAnalyticsDateRange(period), [period]);
  const branchList = asArray(branches);
  const selectedBranchRecord = useMemo(() => branchList.find((branch) =>
    String(branch.id || '') === String(selectedBranch || '') || branchKey(branch) === selectedBranch,
  ) || null, [branchList, selectedBranch]);
  const branchId = selectedBranchRecord?.id || null;
  const selectedBranchKey = selectedBranch === 'all' ? '' : branchKey(selectedBranchRecord) || selectedBranch || '';

  const { data: driversData = [], isLoading: driversLoading, error: driversError } = useQuery({
    queryKey: ['driver-performance', 'drivers', restaurantId, selectedBranch, period],
    queryFn: async () => {
      let query = supabase
        .from('drivers')
        .select('id, restaurant_id, branch_id, full_name, is_active, status')
        .eq('restaurant_id', restaurantId)
        .order('full_name')
        .limit(1000);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
    staleTime: 0,
  });

  const { data: salesData = [], isLoading: salesLoading, error: salesError } = useQuery({
    queryKey: ['driver-performance', 'sales', restaurantId, selectedBranch, range.startDate, range.endDate],
    queryFn: async () => {
      let query = supabase
        .from('daily_sales')
        .select('id, date, restaurant_id, branch, branch_id, driver_id, driver_name, driver_cash, driver_network, drivers_json, restaurant_cash, restaurant_network, cash, network, credit, sales_sources_json, custom_sources_total')
        .eq('restaurant_id', restaurantId)
        .or('driver_id.not.is.null,drivers_json.not.is.null')
        .gte('date', range.startDate)
        .lte('date', range.endDate)
        .order('date', { ascending: false })
        .limit(10000);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurantId,
    staleTime: 0,
  });

  const drivers = asArray(driversData);
  const sales = asArray(salesData);
  const analytics = useMemo(() => buildDriverSalesAnalytics({
    drivers,
    sales,
    branchKey: selectedBranchKey,
    branchId,
  }), [drivers, sales, selectedBranchKey, branchId]);
  const branchRows = useMemo(() => buildBranchDriverAnalytics({
    drivers: selectedBranch === 'all' ? drivers : [],
    sales: selectedBranch === 'all' ? sales : [],
    branches: selectedBranch === 'all' ? branchList : [],
  }), [drivers, sales, branchList, selectedBranch]);

  const loading = driversLoading || salesLoading;
  const error = driversError || salesError;

  return (
    <section className="space-y-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40">
            <Truck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground leading-tight">{title}</h2>
            {description && <p className="text-[11px] text-muted-foreground leading-tight">{description}</p>}
          </div>
        </div>
        <span className="flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> LIVE
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {DRIVER_ANALYTICS_PERIODS.map((item) => (
          <button key={item.id} type="button" onClick={() => setPeriod(item.id)} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors ${period === item.id ? 'border-cyan-600 bg-cyan-600 text-white shadow-sm' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}>
            {item.label}
          </button>
        ))}
      </div>

      <Card className="border border-cyan-100 dark:border-cyan-900/60">
        <CardContent className="p-3 sm:p-4">
          {loading ? (
            <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-28 w-full" /></div>
          ) : error ? (
            <p className="text-xs text-red-600">Driver analytics could not be loaded.</p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2 border-b border-border/60 pb-3 sm:grid-cols-3 xl:grid-cols-6">
                <SummaryMetric label="Total Drivers" value={analytics.totals.drivers} icon={Users} color="text-cyan-600" />
                <SummaryMetric label="Active Drivers" value={analytics.totals.activeDrivers} icon={Truck} color="text-emerald-600" />
                <SummaryMetric label="Cash Sales" value={money(analytics.totals.cash, currency)} icon={DollarSign} color="text-amber-600" />
                <SummaryMetric label="Network / POS Sales" value={money(analytics.totals.network, currency)} icon={CreditCard} color="text-violet-600" />
                <SummaryMetric label="Credit Sales" value={money(analytics.totals.credit, currency)} icon={CreditCard} color="text-blue-600" />
                <SummaryMetric label="Total Revenue" value={money(analytics.totals.revenue, currency)} icon={BarChart3} color="text-emerald-600" />
              </div>

              {selectedBranch === 'all' && (
                <div className="mb-4 overflow-x-auto rounded-xl border border-border/70">
                  <table className="w-full min-w-[580px] text-left text-xs">
                    <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2 font-semibold">Branch</th><th className="px-3 py-2 font-semibold">Drivers</th><th className="px-3 py-2 font-semibold">Active</th><th className="px-3 py-2 font-semibold">Cash</th><th className="px-3 py-2 font-semibold">Network / POS</th><th className="px-3 py-2 font-semibold">Credit</th><th className="px-3 py-2 font-semibold">Total Revenue</th></tr></thead>
                    <tbody>{branchRows.map((row) => <tr key={row.branchId || row.branchKey} className="border-t border-border/60"><td className="px-3 py-2 font-semibold">{row.branchName}</td><td className="px-3 py-2">{row.drivers}</td><td className="px-3 py-2">{row.activeDrivers}</td><td className="px-3 py-2">{money(row.cash, currency)}</td><td className="px-3 py-2">{money(row.network, currency)}</td><td className="px-3 py-2">{money(row.credit, currency)}</td><td className="px-3 py-2 font-semibold">{money(row.revenue, currency)}</td></tr>)}</tbody>
                  </table>
                </div>
              )}

              <div className="mb-2 flex items-center gap-2"><Award className="h-4 w-4 text-amber-600" /><h3 className="text-sm font-bold">Top 10 Drivers</h3></div>
              {analytics.rankedDrivers.length === 0 ? (
                <div className="py-7 text-center"><Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground/35" /><p className="text-xs font-medium text-muted-foreground">No driver-linked sales for this period.</p></div>
              ) : (
                <div className="space-y-2">
                  {analytics.rankedDrivers.map((driver, index) => (
                    <div key={driver.driverId} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-start gap-2">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${index === 0 ? 'bg-amber-100 text-amber-700' : index === 1 ? 'bg-slate-200 text-slate-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>{index + 1}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-foreground">{driver.name}</p><span className="whitespace-nowrap text-[10px] font-bold text-cyan-700">{money(driver.revenue, currency)}</span></div>
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] sm:grid-cols-6">
                            <Metric label="Sales / orders" value={driver.orders} icon={Package} />
                            <Metric label="Cash sales" value={money(driver.cash, currency)} icon={DollarSign} />
                            <Metric label="Network / POS" value={money(driver.network, currency)} icon={CreditCard} />
                            <Metric label="Credit sales" value={money(driver.credit, currency)} icon={CreditCard} />
                            <Metric label="Total revenue" value={money(driver.revenue, currency)} icon={BarChart3} />
                            <Metric label="Avg. sale" value={money(driver.averageSale, currency)} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!loading && !error && (
        <DriverTrendAnalytics
          drivers={drivers}
          sales={sales}
          branches={branchList}
          branchKey={selectedBranchKey}
          branchId={branchId}
          dateFrom={range.startDate}
          dateTo={range.endDate}
          periodLabel={DRIVER_ANALYTICS_PERIODS.find((item) => item.id === period)?.label || 'Selected period'}
          currency={currency}
        />
      )}
    </section>
  );
});

function SummaryMetric({ label, value, icon: Icon, color }) {
  return <div className="min-w-0"><div className="mb-0.5 flex items-center gap-1 text-muted-foreground"><Icon className={`h-3 w-3 ${color}`} /><span className="text-[10px]">{label}</span></div><p className="truncate text-sm font-black text-foreground">{value}</p></div>;
}

function Metric({ label, value, icon: Icon }) {
  return <div className="min-w-0"><p className="leading-tight text-muted-foreground">{label}</p><p className="mt-0.5 truncate font-bold text-foreground">{Icon && <Icon className="mr-0.5 inline h-3 w-3" />}{value}</p></div>;
}

export default DriverPerformance;
