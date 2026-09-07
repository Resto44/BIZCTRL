import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote,
  Building2,
  CircleDollarSign,
  CloudCog,
  LockKeyhole,
  MonitorSmartphone,
  Printer,
  ScanLine,
  Search,
  Settings2,
  Signal,
  UserRound,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/LanguageContext';
import { deviceIsLive, terminalCashDifference } from '@/lib/retailPosControl';
import { useRetailPOSControl } from '@/hooks/useRetailPOSControl';
import {
  POSPanel,
  POSStatus,
  RetailPOSError,
  RetailPOSLoading,
  RetailPOSWorkspace,
} from '@/components/retail-pos/RetailPOSUI';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function HardwarePill({ icon: Icon, label, status }) {
  const healthy = ['ready', 'online', 'connected', 'ok'].includes(String(status || '').toLowerCase());
  return <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${healthy ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40'}`}><Icon className="h-3 w-3" />{label}: {status || 'unknown'}</span>;
}

export default function POSBranchDevices() {
  const { translateLiteral, formatMoney, formatNumber, formatDate } = useLanguage();
  const control = useRetailPOSControl({ period: 'today' });
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [pendingCommand, setPendingCommand] = useState(null);

  useEffect(() => {
    if (!selectedBranchId && control.snapshot.branches[0]?.id) setSelectedBranchId(control.snapshot.branches[0].id);
  }, [control.snapshot.branches, selectedBranchId]);

  const selectedBranch = control.snapshot.branches.find((branch) => branch.id === selectedBranchId) || control.snapshot.branches[0];
  const branchDevices = useMemo(() => control.snapshot.devices.filter((device) => device.branch_id === selectedBranch?.id), [control.snapshot.devices, selectedBranch?.id]);
  const filteredDevices = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return branchDevices.filter((device) => {
      const live = deviceIsLive(device);
      if (statusFilter === 'online' && !live) return false;
      if (statusFilter === 'offline' && live) return false;
      if (!normalized) return true;
      return [device.code, device.display_name, device.cashier_name, device.serial_number].some((value) => String(value || '').toLowerCase().includes(normalized));
    });
  }, [branchDevices, search, statusFilter]);

  const provision = async () => {
    if (!selectedBranch?.id) return;
    try {
      await control.seedDevices({ targetBranchId: selectedBranch.id, count: 10 });
      toast.success(translateLiteral('Ten independent POS devices are ready for this branch.'));
    } catch (error) {
      toast.error(error?.message || translateLiteral('Unable to configure POS devices'));
    }
  };

  const sendCommand = async () => {
    if (!pendingCommand) return;
    try {
      await control.requestCommand({ targetDeviceId: pendingCommand.device.id, commandType: pendingCommand.type });
      toast.success(translateLiteral('Remote command queued securely.'));
      setPendingCommand(null);
    } catch (error) {
      toast.error(error?.message || translateLiteral('Unable to send command'));
    }
  };

  const body = (() => {
    if (control.isLoading) return <RetailPOSLoading />;
    if (control.error) return <RetailPOSError error={control.error} onRetry={control.refetch} />;
    return (
      <>
        <POSPanel title={translateLiteral('Branch network')} description={translateLiteral('Select one branch to control every cashier lane independently')} action={selectedBranch && branchDevices.length < 10 ? <Button type="button" size="sm" onClick={provision} disabled={control.isSeedingDevices} className="rounded-xl"><Settings2 className="me-2 h-4 w-4" />{translateLiteral('Configure 10 POS')}</Button> : null}>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2">
            {control.snapshot.branches.map((branch) => {
              const active = branch.id === selectedBranch?.id;
              const allOnline = Number(branch.device_count) > 0 && Number(branch.device_count) === Number(branch.online_device_count);
              return <button key={branch.id} type="button" onClick={() => setSelectedBranchId(branch.id)} className={`min-w-[210px] snap-start rounded-2xl border p-3 text-start transition ${active ? 'border-primary bg-primary text-primary-foreground shadow-md' : 'bg-card hover:border-primary/40'}`}><div className="flex items-center justify-between gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><Building2 className="h-4 w-4" /></span><POSStatus compact live={allOnline} label={`${branch.online_device_count}/${branch.device_count}`} /></div><p className="mt-3 truncate text-sm font-black">{branch.name}</p><p className={`mt-1 text-xs ${active ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>{formatMoney(Number(branch.net_sales || 0))} · {formatNumber(branch.transaction_count, { maximumFractionDigits: 0 })} {translateLiteral('sales')}</p></button>;
            })}
          </div>
        </POSPanel>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{translateLiteral('Selected branch')}</p><p className="mt-1 truncate text-lg font-black">{selectedBranch?.name || '—'}</p></div>
          <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{translateLiteral('POS devices')}</p><p className="mt-1 text-lg font-black">{formatNumber(branchDevices.length, { maximumFractionDigits: 0 })}/10</p></div>
          <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{translateLiteral('Online now')}</p><p className="mt-1 text-lg font-black text-emerald-600">{formatNumber(branchDevices.filter((device) => deviceIsLive(device)).length, { maximumFractionDigits: 0 })}</p></div>
          <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{translateLiteral('Branch sales')}</p><p className="mt-1 text-lg font-black">{formatMoney(Number(selectedBranch?.net_sales || 0))}</p></div>
        </section>

        <POSPanel title={`${translateLiteral('Cashier devices')} · ${selectedBranch?.name || ''}`} description={translateLiteral('Every scanner and cashier account is measured separately')} action={<div className="flex gap-2"><label className="relative hidden sm:block"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 w-52 ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={translateLiteral('Search POS or cashier')} /></label><select className="h-9 rounded-lg border bg-background px-2 text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label={translateLiteral('Device status')}><option value="all">{translateLiteral('All')}</option><option value="online">{translateLiteral('Online')}</option><option value="offline">{translateLiteral('Offline')}</option></select></div>}>
          <div className="mb-3 sm:hidden"><label className="relative block"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={translateLiteral('Search POS or cashier')} /></label></div>
          {filteredDevices.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">{filteredDevices.map((device) => {
            const live = deviceIsLive(device);
            const cashDifference = terminalCashDifference(device);
            return <article key={device.id} className={`rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${live ? 'border-emerald-200 dark:border-emerald-900' : 'border-red-200 dark:border-red-900'}`}><div className="flex items-start justify-between gap-2"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${live ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950' : 'bg-red-50 text-red-700 dark:bg-red-950'}`}>{live ? <Signal className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}</span><POSStatus compact live={live} label={live ? translateLiteral('Online') : translateLiteral('Offline')} /></div><div className="mt-3 flex items-center justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-base font-black">{device.code}</h3><p className="truncate text-xs text-muted-foreground">{device.display_name || translateLiteral('Cashier lane')}</p></div><Badge variant="outline">{formatNumber(device.transaction_count, { maximumFractionDigits: 0 })}</Badge></div><div className="mt-3 space-y-2 rounded-xl bg-muted/50 p-3 text-xs"><p className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5 text-muted-foreground" /><span className="truncate">{device.cashier_name || translateLiteral('No open shift')}</span></p><p className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground" />{translateLiteral('Sales')}</span><strong>{formatMoney(Number(device.net_sales || 0))}</strong></p><p className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><Banknote className="h-3.5 w-3.5 text-muted-foreground" />{translateLiteral('Cash difference')}</span><strong className={Number(cashDifference || 0) ? 'text-red-600' : 'text-emerald-600'}>{cashDifference === null ? '—' : formatMoney(cashDifference)}</strong></p></div><div className="mt-3 flex flex-wrap gap-1"><HardwarePill icon={ScanLine} label={translateLiteral('Scanner')} status={device.scanner_status} /><HardwarePill icon={Printer} label={translateLiteral('Printer')} status={device.printer_status} /></div><p className="mt-3 truncate text-[10px] text-muted-foreground">{translateLiteral('Last sync')}: {device.last_seen_at ? formatDate(device.last_seen_at, { hour: '2-digit', minute: '2-digit' }) : '—'}</p><div className="mt-3 grid grid-cols-3 gap-1"><Button asChild size="sm" variant="outline" className="h-8 px-2" title={translateLiteral('Open device account')}><Link to={`/retail/pos-device?device=${device.id}`}><MonitorSmartphone className="h-3.5 w-3.5" /></Link></Button><Button type="button" size="sm" variant="outline" className="h-8 px-2" title={translateLiteral('Force sync')} disabled={control.isSendingCommand} onClick={() => setPendingCommand({ device, type: 'sync' })}><CloudCog className="h-3.5 w-3.5" /></Button><Button type="button" size="sm" variant="outline" className="h-8 px-2 text-red-600" title={translateLiteral('Remote lock')} disabled={control.isSendingCommand} onClick={() => setPendingCommand({ device, type: 'lock' })}><LockKeyhole className="h-3.5 w-3.5" /></Button></div></article>;
          })}</div> : <div className="flex min-h-52 flex-col items-center justify-center text-center"><MonitorSmartphone className="h-10 w-10 text-muted-foreground" /><p className="mt-3 text-sm font-bold">{branchDevices.length ? translateLiteral('No devices match this filter') : translateLiteral('This branch has no POS devices yet')}</p>{!branchDevices.length && <Button className="mt-3" onClick={provision} disabled={control.isSeedingDevices}>{translateLiteral('Configure 10 POS')}</Button>}</div>}
        </POSPanel>
      </>
    );
  })();

  return (
    <RetailPOSWorkspace activePage="branches" title={translateLiteral('Branches & Cashier Devices')} subtitle={translateLiteral('10 branches × 10 independent POS accounts with live status and remote control')} realtimeStatus={control.realtimeStatus} isFetching={control.isFetching} onRefresh={control.refetch}>
      {body}
      <AlertDialog open={Boolean(pendingCommand)} onOpenChange={(open) => !open && setPendingCommand(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{translateLiteral('Confirm remote command')}</AlertDialogTitle><AlertDialogDescription>{translateLiteral('This command will be queued for')} {pendingCommand?.device?.code}. {pendingCommand?.type === 'lock' ? translateLiteral('The cashier lane will be locked when it receives the command.') : translateLiteral('The device will synchronize its local queue with ERP.')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{translateLiteral('Cancel')}</AlertDialogCancel><AlertDialogAction onClick={sendCommand} className={pendingCommand?.type === 'lock' ? 'bg-red-600 hover:bg-red-700' : ''}>{pendingCommand?.type === 'lock' ? <LockKeyhole className="me-2 h-4 w-4" /> : <Wrench className="me-2 h-4 w-4" />}{translateLiteral('Send command')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RetailPOSWorkspace>
  );
}
