import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, ShieldCheck, Clock, CheckCircle2, Store, Square, CheckSquare, UserRound } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';

const SETTLE_BADGE = {
  pending:  { label: 'Pending', icon: Clock, cls: 'text-amber-600 bg-amber-50' },
  verified: { label: 'Verified', icon: ShieldCheck, cls: 'text-blue-600 bg-blue-50' },
  approved: { label: 'Settled', icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-50' },
  rejected: { label: 'Rejected', icon: null, cls: 'text-red-600 bg-red-50' },
};

const parseSalesSourceSnapshots = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

export default function SalesListItem({ sale, record = sale, onEdit, onDelete, selected = false, onToggleSelect = null }) {
  const { t, currency } = useLanguage();
  const { branches } = useTenant();

  // Prefer restaurant_ fields (new schema); fall back to legacy cash/network
  const rCash = Number(sale.restaurant_cash ?? sale.cash ?? 0);
  const rNet  = Number(sale.restaurant_network ?? sale.network ?? 0);
  const credit = Number(sale.credit) || 0;

  // Source snapshots describe the amounts already classified into cash,
  // network, credit, or the explicit Other bucket on this saved closing. Never
  // add the snapshot again to the record total.
  const customSourcesTotal = Math.max(0, Number(sale.custom_sources_total) || 0);

  const total = rCash + rNet + credit + customSourcesTotal;
  const branchLabel = branches.find(b => b.key === sale.branch)?.label || sale.branch;
  const managerName = sale.manager_name || sale.manager_email || sale.created_by || '—';
  const cashierName = sale.cashier_name || managerName;
  const sourceSnapshots = parseSalesSourceSnapshots(sale.sales_sources_json);
  const hasOperatingResult = sale.operating_result !== null && sale.operating_result !== undefined && Number.isFinite(Number(sale.operating_result));
  const operatingResult = hasOperatingResult ? Number(sale.operating_result) : 0;
  const hasNetwork = rNet > 0;
  const closingState = sale.closing_state || record?.closing_state || 'finalized';
  const closingStateLabel = {
    draft: 'Draft',
    ready: 'Ready',
    finalized: 'Finalized',
    cancelled: 'Cancelled',
  }[closingState] || 'Draft';
  const closingStateClass = closingState === 'draft'
    ? 'bg-amber-50 text-amber-800'
    : closingState === 'ready'
      ? 'bg-blue-50 text-blue-800'
      : closingState === 'cancelled'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-emerald-50 text-emerald-800';

  const { data: settlements = [] } = useQuery({
    queryKey: ['settlement_for_sale', sale.id],
    queryFn: () => base44.entities.SettlementRecord.filter({ reference_id: sale.id, flow_type: 'MANAGER_TO_SPONSOR' }),
    enabled: hasNetwork,
    staleTime: 30000,
  });
  const settlement = settlements[0];
  const badge = settlement ? SETTLE_BADGE[settlement.status] || SETTLE_BADGE.pending : null;

  return (
    <Card className={`p-3 mb-2 bg-card w-full max-w-full overflow-hidden ${selected ? 'ring-2 ring-primary/50' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {onToggleSelect && (
            <button type="button" onClick={() => onToggleSelect(sale.id)} className="text-muted-foreground hover:text-primary flex-shrink-0">
              {selected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
            </button>
          )}
          <span className="text-xs font-medium text-muted-foreground">{sale.date}</span>
          <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-secondary-foreground">{branchLabel}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${closingStateClass}`}>{closingStateLabel}</span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit Closing" onClick={() => onEdit(record)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {onDelete && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(record)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5"><UserRound className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span className="shrink-0 font-medium text-foreground">Cashier:</span><span className="truncate font-medium text-foreground">{cashierName}</span></span>
        {cashierName !== managerName && <span className="min-w-0 truncate"><span className="font-medium text-foreground">Manager:</span> {managerName}</span>}
        {sale.shift && <span className="shrink-0"><span className="font-medium text-foreground">Shift:</span> {sale.shift}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-secondary/40 rounded-lg px-2 py-1.5 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Store className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate">
            {t('cash')}: <span className="font-semibold text-foreground">{currency}{rCash.toLocaleString()}</span>
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Net: <span className="font-semibold text-foreground">{currency}{rNet.toLocaleString()}</span>
        </span>
        {credit > 0 && (
          <span className="text-[10px] text-muted-foreground">
            Cred: <span className="font-semibold text-foreground">{currency}{credit.toLocaleString()}</span>
          </span>
        )}
        {customSourcesTotal > 0 && (
          <span className="text-[10px] text-muted-foreground">
            Other: <span className="font-semibold text-foreground">{currency}{customSourcesTotal.toLocaleString()}</span>
          </span>
        )}
        <div className="flex-1 flex justify-end">
          <span className="text-xs font-bold text-primary whitespace-nowrap">
            {currency}{total.toLocaleString()}
          </span>
        </div>
      </div>

      {(hasOperatingResult || sourceSnapshots.length > 0) && <div className="mb-2 space-y-1.5 rounded-lg border border-border/70 bg-muted/20 px-2 py-1.5 text-[10px]">
        {hasOperatingResult && <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Operating result</span><span className={`font-bold tabular-nums ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{operatingResult >= 0 ? '+' : '−'}{currency}{Math.abs(operatingResult).toLocaleString()}</span></div>}
        {sourceSnapshots.map((source) => {
          const todayAmount = Math.max(0, Number(source.amount ?? source.today_amount) || 0);
          const hasHistoricalContext = source.previous_amount !== null && source.previous_amount !== undefined && source.total_amount !== null && source.total_amount !== undefined;
          const previousAmount = Math.max(0, Number(source.previous_amount) || 0);
          const totalAmount = hasHistoricalContext ? Math.max(0, Number(source.total_amount) || 0) : todayAmount;
          return <div key={source.source_id || source.source_key || source.name_en} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-muted-foreground" data-i18n-skip="true">{source.name_en || source.name_ar || source.source_key || 'Sales source'}</span><span className="shrink-0 text-right font-medium tabular-nums text-foreground">{t('salesClosing.sources.today')} {currency}{todayAmount.toLocaleString()}{hasHistoricalContext && <> · {t('salesClosing.sources.previous')} {currency}{previousAmount.toLocaleString()} · {t('salesClosing.sources.total')} {currency}{totalAmount.toLocaleString()}</>}</span></div>;
        })}
      </div>}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
              {badge.icon && <badge.icon className="w-3 h-3" />}
              Network {badge.label}
              {settlement?.proof_url && <span className="ml-0.5">📎</span>}
            </span>
          )}
        </div>

      </div>
    </Card>
  );
}
