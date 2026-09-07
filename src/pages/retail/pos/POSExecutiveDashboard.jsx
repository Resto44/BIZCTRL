import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CircleDollarSign,
  CreditCard,
  MonitorSmartphone,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLanguage } from '@/lib/LanguageContext';
import { calculateRetailPosExecutive, deviceIsLive, paymentLabel } from '@/lib/retailPosControl';
import { useRetailPOSControl } from '@/hooks/useRetailPOSControl';
import {
  POSMetricCard,
  POSPanel,
  POSStatus,
  RetailPOSEmpty,
  RetailPOSError,
  RetailPOSLoading,
  RetailPOSWorkspace,
} from '@/components/retail-pos/RetailPOSUI';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const PIE_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#f59e0b'];

function NumericTooltip({ active, payload, formatMoney }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-white px-3 py-2 text-xs shadow-xl dark:bg-slate-950">
      <p className="font-bold">{payload[0]?.payload?.label || payload[0]?.payload?.name || 'Sales'}</p>
      <p className="mt-1 text-primary">{formatMoney(Number(payload[0]?.value || 0))}</p>
    </div>
  );
}

export default function POSExecutiveDashboard() {
  const [period, setPeriod] = useState('today');
  const { translateLiteral, formatMoney, formatNumber, formatDate } = useLanguage();
  const control = useRetailPOSControl({ period });
  const { snapshot } = control;
  const executive = useMemo(() => calculateRetailPosExecutive(snapshot.summary), [snapshot.summary]);
  const paymentMix = useMemo(() => [
    { name: 'Cash', value: Number(snapshot.summary.cash_total || 0) },
    { name: 'Mada', value: Number(snapshot.summary.mada_total || 0) },
    { name: 'Apple Pay', value: Number(snapshot.summary.apple_pay_total || 0) },
    { name: 'Credit', value: Number(snapshot.summary.credit_total || 0) },
  ].filter((item) => item.value > 0), [snapshot.summary]);
  const salesSeries = useMemo(() => snapshot.salesSeries.map((row) => ({
    ...row,
    label: new Date(row.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    net_sales: Number(row.net_sales || 0),
  })), [snapshot.salesSeries]);
  const branchChart = useMemo(() => snapshot.branches.slice(0, 10).map((branch) => ({
    ...branch,
    label: branch.name,
    net_sales: Number(branch.net_sales || 0),
  })), [snapshot.branches]);
  const liveDevices = useMemo(() => snapshot.devices.filter((device) => deviceIsLive(device)), [snapshot.devices]);

  const body = (() => {
    if (control.isLoading) return <RetailPOSLoading />;
    if (control.error) return <RetailPOSError error={control.error} onRetry={control.refetch} />;
    if (!snapshot.devices.length) {
      return <RetailPOSEmpty action={<Button asChild><Link to="/retail/pos-branches">{translateLiteral('Open branch setup')}</Link></Button>} />;
    }
    return (
      <>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
          <POSMetricCard label={translateLiteral('Net sales')} value={formatMoney(executive.sales, { maximumFractionDigits: 0 })} hint={`${formatNumber(executive.transactionCount)} ${translateLiteral('transactions')}`} icon={TrendingUp} tone="green" />
          <POSMetricCard label={translateLiteral('Purchases')} value={formatMoney(executive.purchases, { maximumFractionDigits: 0 })} hint={translateLiteral('Selected period')} icon={ShoppingCart} tone="blue" />
          <POSMetricCard label={translateLiteral('Expenses')} value={formatMoney(executive.expenses, { maximumFractionDigits: 0 })} hint={translateLiteral('Selected period')} icon={ReceiptText} tone="amber" />
          <POSMetricCard label={translateLiteral('Operating result')} value={formatMoney(executive.netProfit, { maximumFractionDigits: 0 })} hint={translateLiteral('Sales − purchases − expenses')} icon={CircleDollarSign} tone={executive.netProfit >= 0 ? 'green' : 'red'} />
          <POSMetricCard label={translateLiteral('Branches')} value={formatNumber(executive.branchCount, { maximumFractionDigits: 0 })} hint={translateLiteral('Live network scope')} icon={Building2} tone="violet" />
          <POSMetricCard label={translateLiteral('POS online')} value={`${formatNumber(liveDevices.length, { maximumFractionDigits: 0 })}/${formatNumber(executive.deviceCount, { maximumFractionDigits: 0 })}`} hint={`${formatNumber(executive.offlineDeviceCount, { maximumFractionDigits: 0 })} ${translateLiteral('offline')}`} icon={MonitorSmartphone} tone={executive.offlineDeviceCount ? 'red' : 'green'} />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <POSPanel className="xl:col-span-2" title={translateLiteral('Live sales trend')} description={translateLiteral('Posted sales, refunds and void reversals by hour')}>
            {salesSeries.length ? (
              <ResponsiveContainer width="100%" height={270}>
                <AreaChart data={salesSeries} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="pos-sales-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<NumericTooltip formatMoney={formatMoney} />} />
                  <Area type="monotone" dataKey="net_sales" stroke="#2563eb" strokeWidth={3} fill="url(#pos-sales-gradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="flex h-[270px] items-center justify-center text-sm text-muted-foreground">{translateLiteral('No transactions in this period')}</div>}
          </POSPanel>
          <POSPanel title={translateLiteral('Payment mix')} description={translateLiteral('Net settlement by method')}>
            {paymentMix.length ? (
              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart><Pie data={paymentMix} dataKey="value" nameKey="name" innerRadius={55} outerRadius={84} paddingAngle={3}>{paymentMix.map((entry, index) => <Cell key={entry.name} fill={PIE_COLORS[index]} />)}</Pie><Tooltip content={<NumericTooltip formatMoney={formatMoney} />} /></PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">{paymentMix.map((item, index) => <div key={item.name} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index] }} /><span>{item.name}</span></div>)}</div>
              </div>
            ) : <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">{translateLiteral('No payment data')}</div>}
          </POSPanel>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <POSPanel title={translateLiteral('Branch performance')} description={translateLiteral('Sales across every active supermarket branch')} action={<Button asChild variant="ghost" size="sm"><Link to="/retail/pos-branches">{translateLiteral('Manage')}</Link></Button>}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={branchChart} layout="vertical" margin={{ left: 5, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis dataKey="label" type="category" width={90} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<NumericTooltip formatMoney={formatMoney} />} />
                <Bar dataKey="net_sales" fill="#16a34a" radius={[0, 8, 8, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </POSPanel>
          <POSPanel title={translateLiteral('Live transaction feed')} description={translateLiteral('Latest receipts from all connected cashier devices')} action={<Badge variant="outline">{snapshot.transactions.length}</Badge>}>
            <div className="max-h-[250px] space-y-2 overflow-y-auto pe-1">
              {snapshot.transactions.slice(0, 8).map((transaction) => (
                <div key={transaction.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950"><CreditCard className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{transaction.receipt_number}</p><p className="truncate text-xs text-muted-foreground">{transaction.branch_name} · {transaction.device_code} · {paymentLabel(transaction.payments)}</p></div>
                  <div className="text-end"><p className="text-sm font-black">{formatMoney(Number(transaction.net_total || 0))}</p><p className="text-[10px] text-muted-foreground">{formatDate(transaction.occurred_at, { hour: '2-digit', minute: '2-digit' })}</p></div>
                </div>
              ))}
              {!snapshot.transactions.length && <p className="py-14 text-center text-sm text-muted-foreground">{translateLiteral('No transactions in this period')}</p>}
            </div>
          </POSPanel>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <POSPanel className="xl:col-span-2" title={translateLiteral('All branches live')} description={translateLiteral('Independent control for every branch and cashier device')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b text-start text-xs text-muted-foreground"><th className="pb-3 text-start font-semibold">{translateLiteral('Branch')}</th><th className="pb-3 text-start font-semibold">POS</th><th className="pb-3 text-start font-semibold">{translateLiteral('Online')}</th><th className="pb-3 text-end font-semibold">{translateLiteral('Transactions')}</th><th className="pb-3 text-end font-semibold">{translateLiteral('Net sales')}</th><th className="pb-3 text-end font-semibold">{translateLiteral('Refunds')}</th></tr></thead>
                <tbody>{snapshot.branches.map((branch) => <tr key={branch.id} className="border-b last:border-0"><td className="py-3 font-bold">{branch.name}</td><td className="py-3">{formatNumber(branch.device_count, { maximumFractionDigits: 0 })}</td><td className="py-3"><POSStatus compact live={Number(branch.online_device_count) === Number(branch.device_count) && Number(branch.device_count) > 0} label={`${branch.online_device_count}/${branch.device_count}`} /></td><td className="py-3 text-end">{formatNumber(branch.transaction_count, { maximumFractionDigits: 0 })}</td><td className="py-3 text-end font-black">{formatMoney(Number(branch.net_sales || 0))}</td><td className="py-3 text-end text-red-600">{formatMoney(Number(branch.refunds || 0))}</td></tr>)}</tbody>
              </table>
            </div>
          </POSPanel>
          <POSPanel title={translateLiteral('Priority alerts')} description={translateLiteral('Critical items requiring action')} action={<Button asChild variant="ghost" size="sm"><Link to="/retail/pos-audit">{translateLiteral('Open audit')}</Link></Button>}>
            <div className="space-y-2">
              {snapshot.events.filter((event) => event.severity === 'critical').slice(0, 6).map((event) => <div key={event.id} className="rounded-xl border border-red-100 bg-red-50/70 p-3 dark:border-red-900 dark:bg-red-950/20"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /><div className="min-w-0"><p className="truncate text-sm font-bold">{event.title}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{event.branch_name} · {event.device_code}</p></div></div></div>)}
              {!snapshot.events.some((event) => event.severity === 'critical') && <div className="flex flex-col items-center py-10 text-center"><PackageCheck className="h-9 w-9 text-emerald-500" /><p className="mt-2 text-sm font-bold">{translateLiteral('No critical alerts')}</p></div>}
            </div>
          </POSPanel>
        </section>
      </>
    );
  })();

  return (
    <RetailPOSWorkspace activePage="executive" title={translateLiteral('Supermarket Live Control')} subtitle={translateLiteral('Live sales, purchases, expenses and cashier devices across every branch')} period={period} onPeriodChange={setPeriod} realtimeStatus={control.realtimeStatus} isFetching={control.isFetching} onRefresh={control.refetch}>
      {body}
    </RetailPOSWorkspace>
  );
}
