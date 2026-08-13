import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Bell, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useActiveAlerts } from '@/hooks/useActiveAlerts';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';

const severityStyle = {
  critical: { badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300', dot: 'bg-red-500' },
  high: { badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300', dot: 'bg-orange-500' },
  warning: { badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300', dot: 'bg-amber-500' },
  info: { badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300', dot: 'bg-blue-500' },
};

function formatType(value) {
  return String(value || 'alert').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function AlertRecordCard({ alert, branchName, onResolve, disabled }) {
  const style = severityStyle[alert.severity] || severityStyle.info;
  return (
    <Card className="border-border/80 overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground break-words">{alert.title}</p>
                {alert.message && <p className="mt-1 text-xs leading-relaxed text-muted-foreground break-words">{alert.message}</p>}
              </div>
              <Badge variant="outline" className={`w-fit shrink-0 capitalize ${style.badge}`}>{alert.severity}</Badge>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] sm:grid-cols-5">
              <div>
                <dt className="font-semibold uppercase tracking-wide text-muted-foreground">Type</dt>
                <dd className="mt-0.5 text-foreground break-words">{formatType(alert.type)}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-muted-foreground">Branch</dt>
                <dd className="mt-0.5 text-foreground break-words">{branchName || 'All branches'}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-muted-foreground">Date / time</dt>
                <dd className="mt-0.5 text-foreground">{alert.detected_at ? format(new Date(alert.detected_at), 'MMM d, yyyy HH:mm') : '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-muted-foreground">Severity</dt>
                <dd className="mt-0.5 capitalize text-foreground">{alert.severity}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
                <dd className="mt-0.5 font-semibold text-red-600 dark:text-red-400">Active</dd>
              </div>
            </dl>

            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onResolve(alert.id)}
                className="h-8 gap-1.5 text-xs"
              >
                <X className="h-3.5 w-3.5" /> Resolve alert
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SmartAlertCenter() {
  const { t } = useLanguage();
  const { branches } = useTenant();
  const {
    alerts,
    alertCount,
    isLoading,
    isError,
    error,
    resolveAlert,
    resolveAll,
    isResolving,
    refetch,
  } = useActiveAlerts();
  const [tab, setTab] = useState('all');

  const filteredAlerts = useMemo(() => {
    if (tab === 'inventory') return alerts.filter((alert) => ['low_stock', 'out_of_stock'].includes(alert.type));
    if (tab === 'financial') return alerts.filter((alert) => !['low_stock', 'out_of_stock'].includes(alert.type));
    return alerts;
  }, [alerts, tab]);

  const resolveOne = async (alertId) => {
    try { await resolveAlert(alertId); } catch (resolveError) { console.warn('[ActiveAlerts] resolve failed:', resolveError.message); }
  };
  const resolveVisible = async () => {
    try { await resolveAll(filteredAlerts); } catch (resolveError) { console.warn('[ActiveAlerts] resolve all failed:', resolveError.message); }
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative rounded-xl bg-red-50 p-2.5 dark:bg-red-950/30">
            <Bell className="h-5 w-5 text-red-600" />
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{alertCount}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{t('alerts_label')}</h1>
            <p className="text-xs text-muted-foreground">{alertCount} {alertCount === 1 ? 'Active Alert' : 'Active Alerts'} · persisted unresolved records only</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={resolveVisible} disabled={isResolving || filteredAlerts.length === 0}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Resolve visible
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-9 w-full grid-cols-3">
          <TabsTrigger value="all" className="text-xs">All <Badge className="ml-1 h-4 min-w-4 px-1 text-[9px]">{alertCount}</Badge></TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs">Inventory</TabsTrigger>
          <TabsTrigger value="financial" className="text-xs">Financial</TabsTrigger>
        </TabsList>

        {['all', 'inventory', 'financial'].map((tabName) => (
          <TabsContent key={tabName} value={tabName} className="mt-3 space-y-2">
            {isLoading ? (
              <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading active alerts…</CardContent></Card>
            ) : isError ? (
              <Card className="border-red-200"><CardContent className="p-6 text-sm text-red-700">Unable to load active alerts: {error?.message || 'Unknown error'}</CardContent></Card>
            ) : filteredAlerts.length === 0 ? (
              <Card className="border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20">
                <CardContent className="flex flex-col items-center p-8 text-center text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="mb-2 h-9 w-9" />
                  <p className="text-sm font-bold">0 Active Alerts</p>
                  <p className="mt-1 text-xs opacity-80">There are no unresolved persisted alerts in this scope.</p>
                </CardContent>
              </Card>
            ) : (
              filteredAlerts.map((alert) => {
                const branch = (branches || []).find((item) => item.id === alert.branch_id || item.key === alert.branch || item.branch_key === alert.branch);
                return <AlertRecordCard key={alert.id} alert={alert} branchName={branch?.name || branch?.label || alert.branch} onResolve={resolveOne} disabled={isResolving} />;
              })
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
