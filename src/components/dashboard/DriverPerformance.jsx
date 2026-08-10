import React, { memo, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, startOfDay, startOfMonth, startOfYear, subDays } from 'date-fns';
import { Award, CheckCircle2, DollarSign, Package, Truck, XCircle } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
];

const COMPLETED_STATUSES = new Set(['delivered', 'completed', 'complete']);
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'failed']);

function getPeriodBounds(period) {
  const now = new Date();
  if (period === 'yesterday') {
    const start = startOfDay(subDays(now, 1));
    return { start, end: startOfDay(now) };
  }
  if (period === 'month') return { start: startOfMonth(now), end: addDays(startOfDay(now), 1) };
  if (period === 'year') return { start: startOfYear(now), end: addDays(startOfDay(now), 1) };
  return { start: startOfDay(now), end: addDays(startOfDay(now), 1) };
}

function isInSelectedBranch(order, selectedBranch, branches) {
  if (selectedBranch === 'all') return true;
  const branch = (branches || []).find((item) =>
    String(item?.id || '') === String(selectedBranch)
    || String(item?.key || item?.branch_key || '') === String(selectedBranch),
  );
  if (!branch) return false;

  const branchId = String(branch.id || '');
  const branchKey = String(branch.key || branch.branch_key || '');
  return String(order?.branch_id || '') === branchId
    || String(order?.branch || order?.branch_key || '') === branchKey;
}

function formatMoney(value, currency) {
  return `${currency || '$'}${(Number(value) || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

const DriverPerformance = memo(function DriverPerformance({
  restaurantId,
  branches,
  selectedBranch,
  currency,
}) {
  const [period, setPeriod] = useState('today');
  const { start, end } = useMemo(() => getPeriodBounds(period), [period]);
  const dataStart = useMemo(() => {
    const yearStart = startOfYear(new Date());
    const yesterdayStart = startOfDay(subDays(new Date(), 1));
    return (yesterdayStart < yearStart ? yesterdayStart : yearStart).toISOString();
  }, []);

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ['driver-performance', restaurantId, selectedBranch, dataStart],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('delivery_orders')
        .select('id, restaurant_id, branch, branch_key, branch_id, driver_id, driver_name, status, total_amount, delivery_fee, created_date, updated_date')
        .eq('restaurant_id', restaurantId)
        .gte('created_date', dataStart)
        .order('created_date', { ascending: false })
        .limit(10000);
      if (queryError) throw queryError;
      return data || [];
    },
    enabled: !!restaurantId,
    staleTime: 30000,
  });

  const ranking = useMemo(() => {
    const byDriver = new Map();
    const startTime = start.getTime();
    const endTime = end.getTime();

    orders.forEach((order) => {
      if (!isInSelectedBranch(order, selectedBranch, branches)) return;
      const createdAt = new Date(order.created_date).getTime();
      if (!Number.isFinite(createdAt) || createdAt < startTime || createdAt >= endTime) return;

      const driverId = order.driver_id || `legacy:${order.driver_name || 'unassigned'}`;
      const current = byDriver.get(driverId) || {
        driverId,
        name: order.driver_name || 'Unassigned driver',
        orders: 0,
        completed: 0,
        cancelled: 0,
        revenue: 0,
        earnings: 0,
      };
      const status = String(order.status || '').toLowerCase();
      current.orders += 1;
      if (COMPLETED_STATUSES.has(status)) {
        current.completed += 1;
        current.revenue += Number(order.total_amount) || 0;
        current.earnings += Number(order.delivery_fee) || 0;
      }
      if (CANCELLED_STATUSES.has(status)) current.cancelled += 1;
      byDriver.set(driverId, current);
    });

    return Array.from(byDriver.values())
      .map((driver) => {
        const completionRate = driver.orders > 0 ? (driver.completed / driver.orders) * 100 : 0;
        const averageOrderValue = driver.completed > 0 ? driver.revenue / driver.completed : 0;
        // Rank by completed deliveries first, then reliability, then revenue.
        const performanceScore = (driver.completed * 1000000) + (completionRate * 1000) + driver.revenue;
        return { ...driver, completionRate, averageOrderValue, performanceScore };
      })
      .sort((left, right) => right.performanceScore - left.performanceScore)
      .slice(0, 10);
  }, [branches, end, orders, selectedBranch, start]);

  const summary = useMemo(() => ranking.reduce((total, driver) => ({
    orders: total.orders + driver.orders,
    completed: total.completed + driver.completed,
    revenue: total.revenue + driver.revenue,
    earnings: total.earnings + driver.earnings,
  }), { orders: 0, completed: 0, revenue: 0, earnings: 0 }), [ranking]);

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 flex items-center justify-center shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground leading-tight">Driver Performance</h2>
            <p className="text-[11px] text-muted-foreground leading-tight">Top 10 drivers, updated live from delivery records</p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {PERIODS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPeriod(item.id)}
            className={`rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors border ${
              period === item.id
                ? 'bg-cyan-600 border-cyan-600 text-white shadow-sm'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="border border-cyan-100 dark:border-cyan-900/60">
        <CardContent className="p-3 sm:p-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-600">Driver performance data could not be loaded.</p>
          ) : ranking.length === 0 ? (
            <div className="py-7 text-center">
              <Truck className="w-8 h-8 text-muted-foreground/35 mx-auto mb-2" />
              <p className="text-xs font-medium text-muted-foreground">No driver deliveries for this period.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3 pb-3 border-b border-border/60">
                <SummaryMetric label="Orders" value={summary.orders} icon={Package} color="text-cyan-600" />
                <SummaryMetric label="Completed" value={summary.completed} icon={CheckCircle2} color="text-emerald-600" />
                <SummaryMetric label="Revenue" value={formatMoney(summary.revenue, currency)} icon={DollarSign} color="text-blue-600" />
                <SummaryMetric label="Earnings" value={formatMoney(summary.earnings, currency)} icon={Award} color="text-amber-600" />
              </div>
              <div className="space-y-2">
                {ranking.map((driver, index) => (
                  <div key={driver.driverId} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-start gap-2">
                      <div className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-black ${
                        index === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : index === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                            : index === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                              : 'bg-muted text-muted-foreground'
                      }`}>{index + 1}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-foreground truncate">{driver.name}</p>
                          <span className="text-[10px] font-bold text-cyan-700 dark:text-cyan-300 whitespace-nowrap">{Math.round(driver.completionRate)}% completion</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 mt-2 text-[10px]">
                          <Metric label="Orders / deliveries" value={`${driver.orders} / ${driver.completed}`} />
                          <Metric label="Cancelled" value={driver.cancelled} icon={XCircle} valueClass={driver.cancelled > 0 ? 'text-red-600' : undefined} />
                          <Metric label="Revenue" value={formatMoney(driver.revenue, currency)} />
                          <Metric label="Driver earnings" value={formatMoney(driver.earnings, currency)} />
                          <Metric label="Average performance" value={formatMoney(driver.averageOrderValue, currency)} />
                          <Metric label="Completion rate" value={`${driver.completionRate.toFixed(1)}%`} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
});

function SummaryMetric({ label, value, icon: Icon, color }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-muted-foreground mb-0.5"><Icon className={`w-3 h-3 ${color}`} /><span className="text-[10px]">{label}</span></div>
      <p className="text-sm font-black text-foreground truncate">{value}</p>
    </div>
  );
}

function Metric({ label, value, icon: Icon, valueClass = '' }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground leading-tight">{label}</p>
      <p className={`font-bold text-foreground truncate mt-0.5 ${valueClass}`}>{Icon && <Icon className="w-3 h-3 inline mr-0.5" />}{value}</p>
    </div>
  );
}

export default DriverPerformance;
