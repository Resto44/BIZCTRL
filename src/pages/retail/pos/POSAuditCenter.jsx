import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Download,
  FileSearch,
  MonitorX,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/LanguageContext';
import { buildRetailPosAuditRows, deviceIsLive } from '@/lib/retailPosControl';
import { useRetailPOSControl } from '@/hooks/useRetailPOSControl';
import {
  POSDateStamp,
  POSMetricCard,
  POSPanel,
  RetailPOSError,
  RetailPOSLoading,
  RetailPOSWorkspace,
} from '@/components/retail-pos/RetailPOSUI';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

function exportAuditCsv(rows) {
  const columns = ['occurredAt', 'severity', 'branchName', 'deviceCode', 'cashierName', 'type', 'title', 'amount', 'status'];
  const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `retail-pos-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function POSAuditCenter() {
  const [period, setPeriod] = useState('today');
  const [severity, setSeverity] = useState('all');
  const [branchId, setBranchId] = useState('all');
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState(null);
  const { translateLiteral, formatMoney } = useLanguage();
  const control = useRetailPOSControl({ period });
  const allRows = useMemo(() => buildRetailPosAuditRows(control.snapshot.events, control.snapshot.approvals), [control.snapshot.approvals, control.snapshot.events]);
  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (severity !== 'all' && row.severity !== severity) return false;
      if (branchId !== 'all' && row.raw?.branch_id !== branchId) return false;
      if (!normalized) return true;
      return [row.branchName, row.deviceCode, row.cashierName, row.type, row.title, row.status].some((value) => String(value || '').toLowerCase().includes(normalized));
    });
  }, [allRows, branchId, search, severity]);
  const offlineDevices = useMemo(() => control.snapshot.devices.filter((device) => !deviceIsLive(device)), [control.snapshot.devices]);
  const cashVarianceCount = useMemo(() => control.snapshot.devices.filter((device) => Math.abs(Number(device.cash_difference || 0)) > 0.01).length, [control.snapshot.devices]);
  const pendingApprovals = useMemo(() => control.snapshot.approvals.filter((request) => request.status === 'pending'), [control.snapshot.approvals]);
  const branchRisk = useMemo(() => control.snapshot.branches.map((branch) => {
    const branchRows = allRows.filter((row) => row.raw?.branch_id === branch.id);
    return { name: branch.name, alerts: branchRows.length, critical: branchRows.filter((row) => row.severity === 'critical').length };
  }).filter((branch) => branch.alerts > 0).sort((a, b) => b.alerts - a.alerts).slice(0, 10), [allRows, control.snapshot.branches]);

  const review = async () => {
    if (!decision) return;
    try {
      await control.reviewApproval({ requestId: decision.request.id, decision: decision.value });
      toast.success(translateLiteral(`Request ${decision.value}.`));
      setDecision(null);
    } catch (error) {
      toast.error(error?.message || translateLiteral('Unable to review request'));
    }
  };

  const body = (() => {
    if (control.isLoading) return <RetailPOSLoading />;
    if (control.error) return <RetailPOSError error={control.error} onRetry={control.refetch} />;
    return (
      <>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <POSMetricCard label={translateLiteral('Offline devices')} value={offlineDevices.length} hint={translateLiteral('No heartbeat in 5 minutes')} icon={MonitorX} tone={offlineDevices.length ? 'red' : 'green'} />
          <POSMetricCard label={translateLiteral('Cash variances')} value={cashVarianceCount} hint={translateLiteral('Closed shifts with difference')} icon={Banknote} tone={cashVarianceCount ? 'amber' : 'green'} />
          <POSMetricCard label={translateLiteral('Pending approvals')} value={pendingApprovals.length} hint={translateLiteral('Refund or void requests')} icon={ShieldAlert} tone={pendingApprovals.length ? 'amber' : 'green'} />
          <POSMetricCard label={translateLiteral('Refunds')} value={formatMoney(Number(control.snapshot.summary.refunds || 0))} hint={translateLiteral('Selected period')} icon={RotateCcw} tone="violet" />
          <POSMetricCard label={translateLiteral('Critical alerts')} value={Number(control.snapshot.summary.critical_alerts || 0)} hint={translateLiteral('Requires immediate action')} icon={AlertOctagon} tone={Number(control.snapshot.summary.critical_alerts) ? 'red' : 'green'} />
        </section>

        {pendingApprovals.length ? <POSPanel title={translateLiteral('Owner approval queue')} description={translateLiteral('Refunds and voids stay blocked until an authorized review')} action={<Badge className="bg-amber-100 text-amber-800">{pendingApprovals.length}</Badge>}>
          <div className="grid gap-3 lg:grid-cols-2">{pendingApprovals.map((request) => <article key={request.id} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black">{translateLiteral(request.request_type)} · {request.device_code}</p><p className="mt-1 truncate text-xs text-muted-foreground">{request.branch_name} · {request.cashier_name || '—'}</p></div><strong className="text-base">{formatMoney(Number(request.amount || 0))}</strong></div><p className="mt-3 rounded-xl bg-background/80 p-3 text-sm">{request.reason}</p><div className="mt-3 flex gap-2"><Button type="button" size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={control.isReviewingApproval} onClick={() => setDecision({ request, value: 'approved' })}><CheckCircle2 className="me-2 h-4 w-4" />{translateLiteral('Approve')}</Button><Button type="button" size="sm" variant="outline" className="text-red-600" disabled={control.isReviewingApproval} onClick={() => setDecision({ request, value: 'rejected' })}><XCircle className="me-2 h-4 w-4" />{translateLiteral('Reject')}</Button></div></article>)}</div>
        </POSPanel> : null}

        <section className="grid gap-4 xl:grid-cols-3">
          <POSPanel className="xl:col-span-2" title={translateLiteral('Risk by branch')} description={translateLiteral('All POS events and approvals grouped by supermarket branch')}>
            {branchRisk.length ? <ResponsiveContainer width="100%" height={245}><BarChart data={branchRisk} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="alerts" radius={[7, 7, 0, 0]}>{branchRisk.map((branch) => <Cell key={branch.name} fill={branch.critical ? '#dc2626' : '#f59e0b'} />)}</Bar></BarChart></ResponsiveContainer> : <div className="flex h-[245px] flex-col items-center justify-center"><CheckCircle2 className="h-10 w-10 text-emerald-500" /><p className="mt-2 text-sm font-bold">{translateLiteral('No audit exceptions in this period')}</p></div>}
          </POSPanel>
          <POSPanel title={translateLiteral('Audit controls')} description={translateLiteral('Filter and export the authorized view only')}>
            <div className="space-y-3"><label className="relative block"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={translateLiteral('Search audit log')} className="ps-9" /></label><Select value={branchId} onValueChange={setBranchId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{translateLiteral('All branches')}</SelectItem>{control.snapshot.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select><Select value={severity} onValueChange={setSeverity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{translateLiteral('All severity levels')}</SelectItem><SelectItem value="critical">{translateLiteral('Critical')}</SelectItem><SelectItem value="warning">{translateLiteral('Warning')}</SelectItem><SelectItem value="info">{translateLiteral('Information')}</SelectItem></SelectContent></Select><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={() => exportAuditCsv(filteredRows)} disabled={!filteredRows.length}><Download className="me-2 h-4 w-4" />CSV</Button><Button type="button" variant="outline" onClick={() => window.print()}><Printer className="me-2 h-4 w-4" />PDF</Button></div><p className="text-xs text-muted-foreground">{filteredRows.length} {translateLiteral('authorized records')}</p></div>
          </POSPanel>
        </section>

        <POSPanel title={translateLiteral('Immutable audit ledger')} description={translateLiteral('Financial and device events are retained; corrections use approval and reversal records')} action={<Badge variant="outline"><FileSearch className="me-1 h-3.5 w-3.5" />{filteredRows.length}</Badge>}>
          <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-3 text-start">{translateLiteral('Time')}</th><th className="pb-3 text-start">{translateLiteral('Severity')}</th><th className="pb-3 text-start">{translateLiteral('Branch / POS')}</th><th className="pb-3 text-start">{translateLiteral('Cashier')}</th><th className="pb-3 text-start">{translateLiteral('Event')}</th><th className="pb-3 text-end">{translateLiteral('Amount')}</th><th className="pb-3 text-end">{translateLiteral('Status')}</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="py-3 text-xs"><POSDateStamp value={row.occurredAt} /></td><td className="py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black uppercase ${row.severity === 'critical' ? 'bg-red-100 text-red-700' : row.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{translateLiteral(row.severity)}</span></td><td className="py-3"><p className="font-bold">{row.branchName || '—'}</p><p className="text-xs text-muted-foreground">{row.deviceCode || '—'}</p></td><td className="py-3">{row.cashierName || '—'}</td><td className="max-w-xs py-3"><p className="truncate font-semibold">{translateLiteral(row.type)}</p><p className="truncate text-xs text-muted-foreground">{row.title || '—'}</p></td><td className="py-3 text-end font-bold">{row.amount ? formatMoney(row.amount) : '—'}</td><td className="py-3 text-end"><Badge variant="outline" className="capitalize">{translateLiteral(row.status)}</Badge></td></tr>)}</tbody></table>{!filteredRows.length && <div className="flex flex-col items-center py-16"><AlertTriangle className="h-9 w-9 text-muted-foreground" /><p className="mt-2 text-sm font-bold">{translateLiteral('No records match these filters')}</p></div>}</div>
        </POSPanel>
      </>
    );
  })();

  return (
    <RetailPOSWorkspace activePage="audit" title={translateLiteral('POS Audit & Alert Center')} subtitle={translateLiteral('One review queue for security, cash, hardware, refunds and voids')} period={period} onPeriodChange={setPeriod} realtimeStatus={control.realtimeStatus} isFetching={control.isFetching} onRefresh={control.refetch} actions={<div className="hidden items-center gap-1 rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 sm:flex"><CheckCircle2 className="h-4 w-4" />{translateLiteral('Append-only ledger')}</div>}>
      {body}
      <AlertDialog open={Boolean(decision)} onOpenChange={(open) => !open && setDecision(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{translateLiteral(decision?.value === 'approved' ? 'Approve this request?' : 'Reject this request?')}</AlertDialogTitle><AlertDialogDescription>{translateLiteral('This decision is recorded with your authenticated user ID and cannot be silently overwritten.')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{translateLiteral('Cancel')}</AlertDialogCancel><AlertDialogAction onClick={review} className={decision?.value === 'rejected' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}>{translateLiteral(decision?.value === 'approved' ? 'Approve' : 'Reject')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </RetailPOSWorkspace>
  );
}
