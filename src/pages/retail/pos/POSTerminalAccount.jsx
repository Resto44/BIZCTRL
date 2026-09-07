import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  CircleDollarSign,
  CloudCog,
  CreditCard,
  Archive,
  LockKeyhole,
  MonitorSmartphone,
  Printer,
  ReceiptText,
  ScanLine,
  UserRound,
  Wifi,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { deviceIsLive, paymentLabel, terminalCashDifference, terminalExpectedCash } from '@/lib/retailPosControl';
import { useRetailPOSControl } from '@/hooks/useRetailPOSControl';
import {
  POSDateStamp,
  POSMetricCard,
  POSPanel,
  POSStatus,
  RetailPOSEmpty,
  RetailPOSError,
  RetailPOSLoading,
  RetailPOSWorkspace,
} from '@/components/retail-pos/RetailPOSUI';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function HardwareState({ icon: Icon, label, value }) {
  const healthy = ['ready', 'online', 'connected', 'ok'].includes(String(value || '').toLowerCase());
  return <div className="rounded-xl border p-3"><div className="flex items-center justify-between gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${healthy ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950' : 'bg-amber-50 text-amber-700 dark:bg-amber-950'}`}><Icon className="h-4 w-4" /></span><span className={`h-2.5 w-2.5 rounded-full ${healthy ? 'bg-emerald-500' : 'bg-amber-500'}`} /></div><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-sm font-black capitalize">{value || 'unknown'}</p></div>;
}

export default function POSTerminalAccount() {
  const [params, setParams] = useSearchParams();
  const selectedDeviceId = params.get('device') || '';
  const [period, setPeriod] = useState('today');
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [notes, setNotes] = useState('');
  const { translateLiteral, formatMoney, formatNumber } = useLanguage();
  const control = useRetailPOSControl({ period, deviceId: selectedDeviceId || null });
  const directoryQuery = useQuery({
    queryKey: ['retail-pos-device-directory', control.restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('retail_pos_devices').select('id, code, display_name, branch_id, branches(name)').eq('restaurant_id', control.restaurantId).order('code');
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(control.restaurantId),
    staleTime: 30_000,
  });
  const directory = directoryQuery.data || [];

  useEffect(() => {
    if (directory[0]?.id && !directory.some((item) => item.id === selectedDeviceId)) {
      setParams({ device: directory[0].id }, { replace: true });
    }
  }, [directory, selectedDeviceId, setParams]);

  const device = control.snapshot.devices[0] || null;
  const cashDifference = terminalCashDifference(device);
  const expectedCash = terminalExpectedCash(device);
  const live = deviceIsLive(device);
  const paymentChart = useMemo(() => device ? [
    { name: 'Cash', value: Number(device.cash_total || 0), fill: '#16a34a' },
    { name: 'Mada', value: Number(device.mada_total || 0), fill: '#2563eb' },
    { name: 'Apple Pay', value: Number(device.apple_pay_total || 0), fill: '#7c3aed' },
    { name: 'Credit', value: Number(device.credit_total || 0), fill: '#f59e0b' },
  ] : [], [device]);

  const command = async (commandType) => {
    if (!device?.id) return;
    try {
      await control.requestCommand({ targetDeviceId: device.id, commandType });
      toast.success(translateLiteral('Remote command queued securely.'));
    } catch (error) {
      toast.error(error?.message || translateLiteral('Unable to send command'));
    }
  };

  const closeShift = async () => {
    const cash = Number(countedCash);
    if (!Number.isFinite(cash) || cash < 0) {
      toast.error(translateLiteral('Enter a valid counted cash amount.'));
      return;
    }
    try {
      await control.closeShift({ shiftId: device.shift_id, countedCash: cash, notes });
      toast.success(translateLiteral('Shift closed and cash difference recorded.'));
      setShowCloseShift(false);
      setCountedCash('');
      setNotes('');
    } catch (error) {
      toast.error(error?.message || translateLiteral('Unable to close shift'));
    }
  };

  const body = (() => {
    if (control.isLoading || directoryQuery.isLoading) return <RetailPOSLoading />;
    if (control.error || directoryQuery.error) return <RetailPOSError error={control.error || directoryQuery.error} onRetry={() => { control.refetch(); directoryQuery.refetch(); }} />;
    if (!directory.length) return <RetailPOSEmpty />;
    if (!device) return <RetailPOSLoading />;
    return (
      <>
        <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3"><span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${live ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950' : 'bg-red-50 text-red-700 dark:bg-red-950'}`}><MonitorSmartphone className="h-7 w-7" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-black">{device.code}</h2><POSStatus live={live} label={live ? translateLiteral('Online') : translateLiteral('Offline')} /></div><p className="truncate text-sm text-muted-foreground">{device.branch_name} · {device.display_name} · {device.serial_number || translateLiteral('No serial registered')}</p></div></div>
            <div className="flex flex-wrap items-center gap-2"><Select value={selectedDeviceId} onValueChange={(value) => setParams({ device: value })}><SelectTrigger className="h-10 w-full rounded-xl sm:w-64"><SelectValue placeholder={translateLiteral('Select POS device')} /></SelectTrigger><SelectContent>{directory.map((item) => <SelectItem key={item.id} value={item.id}>{item.branches?.name || ''} · {item.code}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" onClick={() => command('sync')} disabled={control.isSendingCommand}><CloudCog className="me-2 h-4 w-4" />{translateLiteral('Sync')}</Button><Button type="button" variant="outline" className="text-red-600" onClick={() => command('lock')} disabled={control.isSendingCommand}><LockKeyhole className="me-2 h-4 w-4" />{translateLiteral('Lock')}</Button></div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <POSMetricCard label={translateLiteral('Terminal sales')} value={formatMoney(Number(device.net_sales || 0))} hint={`${formatNumber(device.transaction_count, { maximumFractionDigits: 0 })} ${translateLiteral('transactions')}`} icon={CircleDollarSign} tone="green" />
          <POSMetricCard label={translateLiteral('Average receipt')} value={formatMoney(Number(device.transaction_count) ? Number(device.net_sales) / Number(device.transaction_count) : 0)} hint={translateLiteral('Net sales ÷ receipts')} icon={ReceiptText} tone="blue" />
          <POSMetricCard label={translateLiteral('Refunds & voids')} value={formatMoney(Number(device.refunds || 0) + Number(device.voids || 0))} hint={`${formatMoney(Number(device.refunds || 0))} ${translateLiteral('refunds')}`} icon={CreditCard} tone="amber" />
          <POSMetricCard label={translateLiteral('Cash difference')} value={cashDifference === null ? '—' : formatMoney(cashDifference)} hint={device.shift_status ? translateLiteral(`Shift ${device.shift_status}`) : translateLiteral('No open shift')} icon={Banknote} tone={Number(cashDifference || 0) ? 'red' : 'green'} />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <POSPanel className="xl:col-span-2" title={translateLiteral('Transaction ledger')} description={translateLiteral('Append-only receipts for this independent POS account')}>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-3 text-start">{translateLiteral('Receipt')}</th><th className="pb-3 text-start">{translateLiteral('Time')}</th><th className="pb-3 text-start">{translateLiteral('Cashier')}</th><th className="pb-3 text-start">{translateLiteral('Payment')}</th><th className="pb-3 text-end">{translateLiteral('Items')}</th><th className="pb-3 text-end">{translateLiteral('Amount')}</th></tr></thead><tbody>{control.snapshot.transactions.map((transaction) => <tr key={transaction.id} className="border-b last:border-0"><td className="py-3 font-bold">{transaction.receipt_number}</td><td className="py-3 text-xs text-muted-foreground"><POSDateStamp value={transaction.occurred_at} /></td><td className="py-3">{transaction.cashier_name || '—'}</td><td className="py-3"><span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">{paymentLabel(transaction.payments)}</span></td><td className="py-3 text-end">{formatNumber(transaction.item_count, { maximumFractionDigits: 0 })}</td><td className={`py-3 text-end font-black ${transaction.transaction_type !== 'sale' ? 'text-red-600' : ''}`}>{transaction.transaction_type === 'sale' ? '' : '−'}{formatMoney(Number(transaction.net_total || 0))}</td></tr>)}</tbody></table>{!control.snapshot.transactions.length && <p className="py-16 text-center text-sm text-muted-foreground">{translateLiteral('No transactions in this period')}</p>}</div>
          </POSPanel>
          <POSPanel title={translateLiteral('Shift & cash reconciliation')} description={translateLiteral('Physical cash is reconciled per cashier device')}>
            <div className="space-y-3"><div className="flex items-center gap-3 rounded-xl border p-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-sm font-black">{device.cashier_name || translateLiteral('No cashier signed in')}</p><p className="text-xs text-muted-foreground">{device.shift_name || translateLiteral('No open shift')}</p></div></div>{[['Opening cash', device.opening_cash], ['Cash sales', device.cash_total], ['Expected cash', expectedCash], ['Counted cash', device.counted_cash], ['Difference', cashDifference]].map(([label, value]) => <div key={label} className="flex items-center justify-between border-b pb-2 text-sm last:border-0"><span className="text-muted-foreground">{translateLiteral(label)}</span><strong className={label === 'Difference' && Number(value || 0) ? 'text-red-600' : ''}>{value === null || value === undefined ? '—' : formatMoney(Number(value))}</strong></div>)}{device.shift_id && <Button type="button" className="w-full" onClick={() => { setCountedCash(String(expectedCash)); setShowCloseShift(true); }}>{translateLiteral('Close shift & reconcile')}</Button>}</div>
          </POSPanel>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <POSPanel className="xl:col-span-2" title={translateLiteral('Payment settlement')} description={translateLiteral('Collection total by payment method')}>
            <ResponsiveContainer width="100%" height={230}><BarChart data={paymentChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="value" radius={[8, 8, 0, 0]}>{paymentChart.map((item) => <Cell key={item.name} fill={item.fill} />)}</Bar></BarChart></ResponsiveContainer>
          </POSPanel>
          <POSPanel title={translateLiteral('Hardware health')} description={`${translateLiteral('Latency')}: ${device.network_latency_ms ?? '—'} ms`}>
            <div className="grid grid-cols-2 gap-2"><HardwareState icon={ScanLine} label={translateLiteral('Scanner')} value={device.scanner_status} /><HardwareState icon={Printer} label={translateLiteral('Printer')} value={device.printer_status} /><HardwareState icon={Archive} label={translateLiteral('Cash drawer')} value={device.cash_drawer_status} /><HardwareState icon={Wifi} label={translateLiteral('Network')} value={live ? 'online' : 'offline'} /></div>
          </POSPanel>
        </section>

        <POSPanel title={translateLiteral('Device event log')} description={translateLiteral('Operational, hardware and security events for this POS')}>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{control.snapshot.events.slice(0, 12).map((event) => <div key={event.id} className="flex items-start gap-3 rounded-xl border p-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${event.severity === 'critical' ? 'bg-red-500' : event.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} /><div className="min-w-0"><p className="truncate text-sm font-bold">{event.title}</p><p className="mt-1 text-xs text-muted-foreground"><POSDateStamp value={event.occurred_at} /></p></div></div>)}{!control.snapshot.events.length && <p className="py-10 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">{translateLiteral('No device events in this period')}</p>}</div>
        </POSPanel>
      </>
    );
  })();

  return (
    <RetailPOSWorkspace activePage="device" title={translateLiteral('Independent POS Account')} subtitle={translateLiteral('Live ledger, shift, cash and hardware control for one cashier device')} period={period} onPeriodChange={setPeriod} realtimeStatus={control.realtimeStatus} isFetching={control.isFetching} onRefresh={control.refetch}>
      {body}
      <Dialog open={showCloseShift} onOpenChange={setShowCloseShift}><DialogContent><DialogHeader><DialogTitle>{translateLiteral('Close cashier shift')}</DialogTitle><DialogDescription>{translateLiteral('Count the physical drawer cash. ERP will calculate and preserve the difference in the audit trail.')}</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div><Label htmlFor="counted-cash">{translateLiteral('Counted cash')}</Label><Input id="counted-cash" type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} /></div><div><Label htmlFor="shift-notes">{translateLiteral('Notes')}</Label><Input id="shift-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => setShowCloseShift(false)}>{translateLiteral('Cancel')}</Button><Button type="button" onClick={closeShift} disabled={control.isClosingShift}>{translateLiteral('Close & reconcile')}</Button></DialogFooter></DialogContent></Dialog>
    </RetailPOSWorkspace>
  );
}
