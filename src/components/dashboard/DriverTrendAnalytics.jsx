import React, { memo, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, BarChart3, CreditCard, DollarSign, ReceiptText, Truck, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildDriverTrendAnalytics } from '@/lib/driverAnalytics';

const COLORS = {
  cash: '#10b981',
  network: '#3b82f6',
  credit: '#f59e0b',
  revenue: '#6366f1',
  orders: '#8b5cf6',
};

const money = (value, currency) => `${currency || '$'}${(Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const compactMoney = (value, currency) => {
  const amount = Number(value) || 0;
  return amount >= 1000 ? `${currency || '$'}${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k` : money(amount, currency);
};

function Metric({ label, value, icon: Icon, tone = 'text-primary' }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/35 p-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground"><Icon className={`h-3.5 w-3.5 ${tone}`} /><span className="truncate text-[10px] font-medium">{label}</span></div>
      <p className="truncate text-sm font-black text-foreground">{value}</p>
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">{label}</div>;
}

function BranchMobileCards({ rows, currency }) {
  return (
    <div className="space-y-2 md:hidden">
      {rows.map((row) => (
        <div key={row.branchId || row.branchKey} className="rounded-xl border border-border/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2"><p className="truncate text-sm font-bold">{row.branchName}</p><p className="shrink-0 text-xs font-black text-primary">{money(row.revenue, currency)}</p></div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
            <span>Drivers <b className="text-foreground">{row.drivers}</b></span><span>Active <b className="text-foreground">{row.activeDrivers}</b></span>
            <span>Cash <b className="text-foreground">{money(row.cash, currency)}</b></span><span>POS <b className="text-foreground">{money(row.network, currency)}</b></span>
            <span>Credit <b className="text-foreground">{money(row.credit, currency)}</b></span><span>Revenue <b className="text-foreground">{money(row.revenue, currency)}</b></span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DriverMobileCards({ rows, currency }) {
  return (
    <div className="space-y-2 md:hidden">
      {rows.map((row) => (
        <div key={row.driverId} className="rounded-xl border border-border/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-bold">{row.name}</p><p className="truncate text-[11px] text-muted-foreground">{row.branchName}</p></div><p className="shrink-0 text-xs font-black text-primary">{money(row.revenue, currency)}</p></div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
            <span>Orders <b className="text-foreground">{row.orders}</b></span><span>Cash <b className="text-foreground">{money(row.cash, currency)}</b></span>
            <span>POS <b className="text-foreground">{money(row.network, currency)}</b></span><span>Credit <b className="text-foreground">{money(row.credit, currency)}</b></span>
            <span className="col-span-2">Total revenue <b className="text-foreground">{money(row.revenue, currency)}</b></span>
          </div>
        </div>
      ))}
    </div>
  );
}

const DriverTrendAnalytics = memo(function DriverTrendAnalytics({
  drivers = [],
  sales = [],
  driverEntries,
  branches = [],
  branchKey,
  branchId,
  dateFrom,
  dateTo,
  periodLabel = 'Selected period',
  currency,
}) {
  const trends = useMemo(() => buildDriverTrendAnalytics({
    drivers,
    sales,
    driverEntries,
    branches,
    branchKey,
    branchId,
    dateFrom,
    dateTo,
  }), [branches, branchId, branchKey, dateFrom, dateTo, driverEntries, drivers, sales]);
  const topDrivers = trends.driverRows.filter((row) => row.orders > 0).slice(0, 10);

  return (
    <section className="w-full min-w-0 max-w-full space-y-3">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-black text-foreground">Trend Analytics</h2>
          <p className="break-words text-xs text-muted-foreground">Branch and driver performance for {periodLabel.toLowerCase()}, calculated from canonical Driver Sales records.</p>
        </div>
        <span className="w-fit rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">LIVE CANONICAL DATA</span>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <Metric label="Total Drivers" value={trends.totals.drivers} icon={Users} tone="text-cyan-600" />
        <Metric label="Active Drivers" value={trends.totals.activeDrivers} icon={Truck} tone="text-emerald-600" />
        <Metric label="Driver Sales / Orders" value={trends.totals.orders} icon={ReceiptText} tone="text-violet-600" />
        <Metric label="Cash Sales" value={money(trends.totals.cash, currency)} icon={DollarSign} tone="text-emerald-600" />
        <Metric label="Network / POS" value={money(trends.totals.network, currency)} icon={Activity} tone="text-blue-600" />
        <Metric label="Credit Sales" value={money(trends.totals.credit, currency)} icon={CreditCard} tone="text-amber-600" />
        <Metric label="Total Driver Revenue" value={money(trends.totals.revenue, currency)} icon={BarChart3} tone="text-primary" />
      </div>

      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Driver Revenue Trend</CardTitle></CardHeader>
          <CardContent className="h-56 p-3 pt-0">
            {trends.trendRows.length === 0 ? <EmptyState label="No canonical Driver Sales were recorded for this period." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends.trendRows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => compactMoney(value, currency)} />
                  <Tooltip formatter={(value, name) => [money(value, currency), name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="revenue" name="Total Revenue" stroke={COLORS.revenue} strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="orders" name="Driver Sales / Orders" stroke={COLORS.orders} strokeWidth={1.5} dot={false} yAxisId="orders" />
                  <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Branch Revenue Comparison</CardTitle></CardHeader>
          <CardContent className="h-56 p-3 pt-0">
            {trends.branchRows.length === 0 ? <EmptyState label="No branch drivers are available in this scope." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.branchRows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="branchName" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => compactMoney(value, currency)} />
                  <Tooltip formatter={(value, name) => [money(value, currency), name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="cash" name="Cash" stackId="payments" fill={COLORS.cash} radius={[0, 0, 2, 2]} />
                  <Bar dataKey="network" name="Network / POS" stackId="payments" fill={COLORS.network} />
                  <Bar dataKey="credit" name="Credit" stackId="payments" fill={COLORS.credit} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Branch Breakdown</CardTitle></CardHeader>
        <CardContent className="p-3 pt-0">
          {trends.branchRows.length === 0 ? <EmptyState label="No branch data for this period." /> : <>
            <BranchMobileCards rows={trends.branchRows} currency={currency} />
            <div className="hidden w-full max-w-full overflow-x-auto rounded-lg border border-border/70 md:block">
              <table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Drivers</th><th className="px-3 py-2">Active</th><th className="px-3 py-2">Cash</th><th className="px-3 py-2">Network / POS</th><th className="px-3 py-2">Credit</th><th className="px-3 py-2">Total Revenue</th></tr></thead><tbody>{trends.branchRows.map((row) => <tr key={row.branchId || row.branchKey} className="border-t border-border/60"><td className="px-3 py-2 font-semibold">{row.branchName}</td><td className="px-3 py-2">{row.drivers}</td><td className="px-3 py-2">{row.activeDrivers}</td><td className="px-3 py-2">{money(row.cash, currency)}</td><td className="px-3 py-2">{money(row.network, currency)}</td><td className="px-3 py-2">{money(row.credit, currency)}</td><td className="px-3 py-2 font-bold text-primary">{money(row.revenue, currency)}</td></tr>)}</tbody></table>
            </div>
          </>}
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[1.05fr_.95fr]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Driver Breakdown</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            {trends.driverRows.length === 0 ? <EmptyState label="No drivers are available in this scope." /> : <>
              <DriverMobileCards rows={trends.driverRows} currency={currency} />
              <div className="hidden w-full max-w-full overflow-x-auto rounded-lg border border-border/70 md:block">
                <table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2">Driver</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Cash</th><th className="px-3 py-2">Network / POS</th><th className="px-3 py-2">Credit</th><th className="px-3 py-2">Total Revenue</th></tr></thead><tbody>{trends.driverRows.map((row) => <tr key={row.driverId} className="border-t border-border/60"><td className="px-3 py-2 font-semibold">{row.name}</td><td className="px-3 py-2">{row.branchName}</td><td className="px-3 py-2">{row.orders}</td><td className="px-3 py-2">{money(row.cash, currency)}</td><td className="px-3 py-2">{money(row.network, currency)}</td><td className="px-3 py-2">{money(row.credit, currency)}</td><td className="px-3 py-2 font-bold text-primary">{money(row.revenue, currency)}</td></tr>)}</tbody></table>
              </div>
            </>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Driver Comparison</CardTitle></CardHeader>
          <CardContent className="h-80 p-3 pt-0">
            {topDrivers.length === 0 ? <EmptyState label="No driver-linked sales for comparison." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topDrivers} layout="vertical" margin={{ top: 8, right: 10, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(value) => compactMoney(value, currency)} />
                  <YAxis dataKey="name" type="category" width={82} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => money(value, currency)} />
                  <Bar dataKey="revenue" name="Total Revenue" fill={COLORS.revenue} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
});

export default DriverTrendAnalytics;
