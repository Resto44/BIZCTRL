import React, { memo, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Calculator,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  FileText,
  MoreVertical,
  Pencil,
  PieChart,
  ReceiptText,
  Smartphone,
  Square,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { dailySalesNetworkBreakdown, parseDailySalesSourceSnapshots } from '@/lib/dailySalesPresentation';

const parseSalesSourceSnapshots = parseDailySalesSourceSnapshots;

const numberValue = (value) => Number(value) || 0;
const money = (currency, value) => `${currency} ${numberValue(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const recordTotal = (sale) => numberValue(sale?.restaurant_cash ?? sale?.cash)
  + numberValue(sale?.restaurant_network ?? sale?.network)
  + numberValue(sale?.credit)
  + Math.max(0, numberValue(sale?.custom_sources_total));
const recordProfit = (sale) => Number.isFinite(Number(sale?.operating_result))
  ? Number(sale.operating_result)
  : recordTotal(sale) - numberValue(sale?.approved_purchases_total) - numberValue(sale?.expenses_total);

const statePresentation = (state) => ({
  finalized: { label: 'Finalized', cls: 'bg-emerald-50 text-emerald-700' },
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-700' },
  ready: { label: 'Ready', cls: 'bg-blue-50 text-blue-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-700' },
}[state] || { label: 'Draft', cls: 'bg-slate-100 text-slate-700' });

const NetworkDetailRow = memo(function NetworkDetailRow({ icon: Icon, label, description, value, currency }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-background px-3 py-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-foreground">{label}</p>
        <p className="truncate text-[10px] text-muted-foreground" data-i18n-skip="true">{description}</p>
      </div>
      <p className="shrink-0 text-sm font-black tabular-nums text-blue-700">{money(currency, value)}</p>
    </div>
  );
});

export default function SalesListItem({
  sale,
  record = sale,
  expanded = false,
  onToggleExpanded = null,
  onEdit,
  onExport = null,
  onDelete,
  selected = false,
  onToggleSelect = null,
}) {
  const { currency } = useLanguage();
  const { branches } = useTenant();

  // Prefer restaurant_ fields (new schema); fall back to legacy cash/network.
  // restaurant_network already includes Counter, Driver and other Network sales.
  const rCash = Number(sale.restaurant_cash ?? sale.cash ?? 0);
  const rNet  = Number(sale.restaurant_network ?? sale.network ?? 0);
  const credit = Number(sale.credit) || 0;
  const customSourcesTotal = Math.max(0, Number(sale.custom_sources_total) || 0);
  const total = rCash + rNet + credit + customSourcesTotal;
  const sourceSnapshots = useMemo(() => parseSalesSourceSnapshots(sale.sales_sources_json), [sale.sales_sources_json]);
  const network = useMemo(() => dailySalesNetworkBreakdown({ restaurant_network: rNet }, sourceSnapshots), [rNet, sourceSnapshots]);
  const operatingResult = recordProfit(sale);
  const margin = total > 0 ? (operatingResult / total) * 100 : 0;
  const branchLabel = branches.find((branch) => branch.key === sale.branch)?.label || sale.branch || '—';
  const managerName = sale.manager_name || sale.manager_email || sale.created_by || '—';
  const cashierName = sale.cashier_name || managerName;
  const closingState = sale.closing_state || record?.closing_state || 'finalized';
  const state = statePresentation(closingState);
  const cashStatus = sale.cash_status || (numberValue(sale.cash_difference) === 0 ? 'Balanced' : numberValue(sale.cash_difference) < 0 ? 'Shortage' : 'Overage');
  const expectedCash = numberValue(sale.expected_cash ?? rCash);
  const actualCash = numberValue(sale.actual_cash ?? sale.closing_cash ?? rCash);
  const date = sale.date ? new Date(`${sale.date}T12:00:00`) : null;
  const percentages = {
    cash: total > 0 ? (rCash / total) * 100 : 0,
    network: total > 0 ? (rNet / total) * 100 : 0,
    credit: total > 0 ? (credit / total) * 100 : 0,
    other: total > 0 ? (customSourcesTotal / total) * 100 : 0,
  };

  return (
    <Card className={`w-full max-w-full overflow-hidden rounded-2xl border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md ${selected ? 'ring-2 ring-primary/50' : ''}`} style={{ contentVisibility: 'auto', containIntrinsicSize: expanded ? '650px' : '260px' }}>
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {onToggleSelect && (
            <button type="button" onClick={() => onToggleSelect(sale.id)} className="mt-2 shrink-0 text-muted-foreground hover:text-primary" aria-label={selected ? 'Deselect Closing' : 'Select Closing'}>
              {selected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
            </button>
          )}

          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-center leading-none">
            <span className="text-xl font-black text-blue-700">{date ? date.getDate() : '—'}</span>
            <span className="text-[10px] font-bold uppercase text-slate-600">{date ? new Intl.DateTimeFormat('en', { month: 'short' }).format(date) : ''}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-black text-foreground sm:text-base" data-i18n-skip="true">{branchLabel}</h3>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${state.cls}`}>{state.label}</span>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground sm:text-xs">
              <span className="flex min-w-0 items-center gap-1"><UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="shrink-0">Cashier:</span><span className="truncate font-semibold text-foreground">{cashierName}</span></span>
              {cashierName !== managerName && <span className="min-w-0 truncate"><span className="font-medium text-foreground">Manager:</span> {managerName}</span>}
              {sale.shift && <span>• <span className="font-medium text-foreground">Shift:</span> {sale.shift}</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <Button type="button" variant="outline" size="sm" className="hidden h-9 rounded-lg border-primary px-3 text-xs text-primary sm:inline-flex" aria-label="Edit Closing" onClick={() => onEdit?.(record)}>{closingState === 'draft' ? 'Continue' : 'Open Closing'}</Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Closing actions" onClick={onToggleExpanded}><MoreVertical className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={expanded ? 'Collapse Closing details' : 'Expand Closing details'} onClick={onToggleExpanded}>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 border-t border-border/70 pt-3">
          <div><p className="text-[10px] text-muted-foreground">Sales</p><p className="text-base font-black tabular-nums text-primary sm:text-lg">{money(currency, total)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Operating result</p><p className={`text-base font-black tabular-nums sm:text-lg ${operatingResult >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{operatingResult >= 0 ? '+' : '−'}{money(currency, Math.abs(operatingResult))}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Margin</p><p className={`text-base font-black tabular-nums sm:text-lg ${margin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{margin.toFixed(1)}%</p></div>
        </div>

        <div className="mt-3 flex h-4 overflow-hidden rounded-md bg-muted" aria-label="Payment mix">
          {percentages.cash > 0 && <span className="grid h-full place-items-center bg-blue-600 text-[8px] font-bold text-white" style={{ width: `${percentages.cash}%` }}>{percentages.cash >= 14 ? `${percentages.cash.toFixed(0)}%` : ''}</span>}
          {percentages.network > 0 && <span className="grid h-full place-items-center bg-emerald-600 text-[8px] font-bold text-white" style={{ width: `${percentages.network}%` }}>{percentages.network >= 14 ? `${percentages.network.toFixed(0)}%` : ''}</span>}
          {percentages.credit > 0 && <span className="grid h-full place-items-center bg-violet-600 text-[8px] font-bold text-white" style={{ width: `${percentages.credit}%` }}>{percentages.credit >= 14 ? `${percentages.credit.toFixed(0)}%` : ''}</span>}
          {percentages.other > 0 && <span className="grid h-full place-items-center bg-amber-500 text-[8px] font-bold text-white" style={{ width: `${percentages.other}%` }}>{percentages.other >= 14 ? `${percentages.other.toFixed(0)}%` : ''}</span>}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground sm:text-xs">
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-blue-600" />Cash {money(currency, rCash)} ({percentages.cash.toFixed(0)}%)</span>
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-600" />Network Total {money(currency, rNet)} ({percentages.network.toFixed(0)}%)</span>
          <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-violet-600" />Credit {money(currency, credit)} ({percentages.credit.toFixed(0)}%)</span>
          {customSourcesTotal > 0 && <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" />Other {money(currency, customSourcesTotal)} ({percentages.other.toFixed(0)}%)</span>}
        </div>

        <div className="mt-3 grid grid-cols-3 items-center gap-2 border-t border-dashed border-border/70 pt-3 text-[10px] sm:text-xs">
          <span className={`flex items-center gap-1.5 font-semibold ${cashStatus === 'Balanced' ? 'text-emerald-700' : cashStatus === 'Shortage' ? 'text-red-700' : 'text-amber-700'}`}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{cashStatus}</span>
          <span className="text-center text-muted-foreground">Expected <strong className="ml-1 text-foreground">{money(currency, expectedCash)}</strong></span>
          <span className="text-right text-muted-foreground">Actual <strong className="ml-1 text-foreground">{money(currency, actualCash)}</strong></span>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
            <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3" aria-label="Network Sales Details">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-black text-blue-950"><Calculator className="h-4 w-4" aria-hidden="true" />Network Sales Details</h4>
                  <p className="mt-0.5 text-[10px] text-blue-800/70">Counter + Driver + Other Network</p>
                </div>
                <p className="text-base font-black tabular-nums text-blue-700">{money(currency, network.total)}</p>
              </div>
              <div className="space-y-2">
                <NetworkDetailRow icon={Smartphone} label="Counter Network" description="POS and counter card sales" value={network.counter} currency={currency} />
                <NetworkDetailRow icon={UsersRound} label="Driver Network" description="Network portion from all driver entries" value={network.driver} currency={currency} />
                <NetworkDetailRow icon={Building2} label="Other Network" description={network.otherSourceNames.length > 0 ? network.otherSourceNames.join(' • ') : 'Other network-classified Sales Sources'} value={network.other} currency={currency} />
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-blue-700 px-3 py-2.5 text-white">
                <span className="text-xs font-bold">Network Total</span>
                <span className="text-sm font-black tabular-nums">{money(currency, network.counter + network.driver + network.other)}</span>
              </div>
            </section>

            {sourceSnapshots.length > 0 && (
              <section className="rounded-2xl border border-border/70 p-3" aria-label="Sales Sources Details">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground"><PieChart className="h-4 w-4" aria-hidden="true" />Sales Sources (Today)</h4>
                <div className="space-y-1.5">
                  {sourceSnapshots.map((source) => {
                    const sourceAmount = Math.max(0, numberValue(source.amount ?? source.today_amount));
                    return <div key={source.source_id || source.source_key || source.name_en} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-xs"><span className="min-w-0 truncate text-muted-foreground" data-i18n-skip="true">{source.name_en || source.name_ar || source.source_key || 'Sales source'}</span><strong className="shrink-0 tabular-nums text-foreground">{money(currency, sourceAmount)}</strong></div>;
                  })}
                </div>
              </section>
            )}

            <div className="grid grid-cols-3 divide-x divide-border/70 overflow-hidden rounded-xl border border-border/70">
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 rounded-none text-primary" onClick={onToggleExpanded}><ReceiptText className="h-4 w-4" />Details</Button>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 rounded-none text-primary" onClick={() => onExport?.(record)}><FileText className="h-4 w-4" />PDF</Button>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 rounded-none text-primary" aria-label="Edit Closing" onClick={() => onEdit?.(record)}><Pencil className="h-4 w-4" />Edit</Button>
            </div>
          </div>
        )}
      </div>

      {onDelete && <span className="sr-only">Delete is available from the record menu.</span>}
    </Card>
  );
}
