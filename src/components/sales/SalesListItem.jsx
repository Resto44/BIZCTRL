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

export default function SalesListItem({ sale, record = sale, onEdit, onDelete, selected = false, onToggleSelect = null }) {
  const { t, currency } = useLanguage();
  const { branches } = useTenant();

  // Prefer restaurant_ fields (new schema); fall back to legacy cash/network
  const rCash = Number(sale.restaurant_cash ?? sale.cash ?? 0);
  const rNet  = Number(sale.restaurant_network ?? sale.network ?? 0);
  const credit = Number(sale.credit) || 0;

  // Include additional sales sources in the grand total
  const customSourcesTotal = (() => {
    // Prefer the pre-computed column when available
    if (Number(sale.custom_sources_total) > 0) return Number(sale.custom_sources_total);
    // Otherwise parse the JSON snapshot
    if (sale.sales_sources_json) {
      try {
        const entries = JSON.parse(sale.sales_sources_json);
        if (Array.isArray(entries)) {
          return entries.reduce((s, e) => s + (Number(e?.amount) || 0), 0);
        }
      } catch { /* ignore */ }
    }
    return 0;
  })();

  const total = rCash + rNet + credit + customSourcesTotal;
  const branchLabel = branches.find(b => b.key === sale.branch)?.label || sale.branch;
  const managerName = sale.manager_name || sale.manager_email || sale.created_by || '—';
  const hasNetwork = rNet > 0;

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
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(record)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {onDelete && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(record)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="mb-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <UserRound className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="shrink-0 font-medium text-foreground">Manager:</span>
        <span className="truncate font-medium text-foreground">{managerName}</span>
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
