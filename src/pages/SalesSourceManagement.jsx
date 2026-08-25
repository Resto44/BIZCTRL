import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Activity, ArrowDown, ArrowUp, BarChart3, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign,
  Download, Edit3, Eye, EyeOff, FileText, Filter, Landmark, ListFilter, Loader2, Plus, ReceiptText, RotateCcw,
  Settings2, Trash2, Users,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useSalesClosingCustomization } from '@/lib/SalesClosingCustomizationContext';
import {
  SALES_SOURCE_HISTORY_PAGE_SIZE,
  salesSourceDateRange,
  sourceDisplayName,
  useSalesSourceManagement,
} from '@/hooks/useSalesSourceManagement';
import { newSalesClosingSource, SalesSourceDialog } from '@/components/sales/SalesClosingCustomizationDialogs';
import PageHeader from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadCSV, downloadPDF } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const COLORS = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#dc2626'];
const numeric = (value) => Number(value) || 0;
const money = (value, currency) => `${currency}${numeric(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function SourceMetric({ label, value, icon: Icon, currency, tone = 'text-primary' }) {
  return <Card className="min-w-0 p-3 sm:p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 truncate text-lg font-black tabular-nums sm:text-xl">{currency ? money(value, currency) : numeric(value).toLocaleString()}</p></div>{Icon && <Icon className={`h-4 w-4 shrink-0 ${tone}`} />}</div></Card>;
}

function SourceStatus({ active, t }) {
  return <Badge variant="outline" className={active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}>{active ? t('salesSourceManagement.active') : t('salesSourceManagement.inactive')}</Badge>;
}

function SourceTable({ sources, lang, t, currency, canManage, onEdit, onToggle, onDelete, onMove, onView }) {
  return <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-muted/60 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">{t('salesSourceManagement.source')}</th><th className="px-3 py-3">{t('salesSourceManagement.category')}</th><th className="px-3 py-3">{t('salesSourceManagement.paymentMethod')}</th><th className="px-3 py-3 text-right">{t('salesSourceManagement.today')}</th><th className="px-3 py-3 text-right">{t('salesSourceManagement.totalSales')}</th><th className="px-3 py-3 text-right">{t('salesSourceManagement.transactions')}</th><th className="px-3 py-3">{t('salesSourceManagement.status')}</th><th className="px-3 py-3 text-right">{t('salesSourceManagement.actions')}</th></tr></thead><tbody>{sources.map((source, index) => <tr key={source.id} className="border-t hover:bg-muted/30"><td className="max-w-56 px-3 py-3"><button type="button" className="block max-w-full text-left" onClick={() => onView(source)}><span className="block truncate font-semibold text-foreground">{sourceDisplayName(source, lang)}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{source.description || source.id}</span></button></td><td className="px-3 py-3"><Badge variant="secondary">{t(`salesSourceManagement.category.${source.category || 'other'}`)}</Badge></td><td className="px-3 py-3 capitalize">{String(source.default_payment_method || 'other').replaceAll('_', ' ')}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{money(source.analytics.today_sales, currency)}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{money(source.analytics.total_sales, currency)}</td><td className="px-3 py-3 text-right tabular-nums">{numeric(source.analytics.transaction_count).toLocaleString()}</td><td className="px-3 py-3"><SourceStatus active={source.is_active !== false} t={t} /></td><td className="px-3 py-3"><div className="flex justify-end gap-1">{canManage && <><Button type="button" variant="ghost" size="icon" aria-label={t('salesSourceManagement.moveUp')} disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={t('salesSourceManagement.moveDown')} disabled={index === sources.length - 1} onClick={() => onMove(index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={t('salesSourceManagement.edit')} onClick={() => onEdit(source)}><Edit3 className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={source.is_active !== false ? t('salesSourceManagement.deactivate') : t('salesSourceManagement.activate')} onClick={() => onToggle(source)}>{source.is_active !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>{!source.is_system && <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={t('salesSourceManagement.delete')} onClick={() => onDelete(source)}><Trash2 className="h-4 w-4" /></Button>}</>}</div></td></tr>)}</tbody></table>{!sources.length && <div className="p-8 text-center text-sm text-muted-foreground">{t('salesSourceManagement.noSources')}</div>}</div>;
}

function HistoryTable({ rows, lang, t, currency }) {
  return <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/60 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">{t('salesSourceManagement.date')}</th><th className="px-3 py-3">{t('salesSourceManagement.source')}</th><th className="px-3 py-3">{t('salesSourceManagement.branch')}</th><th className="px-3 py-3">{t('salesSourceManagement.user')}</th><th className="px-3 py-3">{t('salesSourceManagement.paymentMethod')}</th><th className="px-3 py-3">{t('salesSourceManagement.customer')}</th><th className="px-3 py-3 text-right">{t('salesSourceManagement.amount')}</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.closing_id}-${row.source_id}-${row.created_at}`} className="border-t"><td className="px-3 py-3 tabular-nums">{row.closing_date}</td><td className="max-w-52 px-3 py-3"><span className="block truncate font-medium">{row.source ? sourceDisplayName(row.source, lang) : row.source_key}</span><span className="block text-xs text-muted-foreground">{row.transaction_type}</span></td><td className="px-3 py-3">{row.branch || '—'}</td><td className="px-3 py-3">{row.cashier_name || row.created_by || '—'}</td><td className="px-3 py-3 capitalize">{String(row.payment_method || 'other').replaceAll('_', ' ')}</td><td className="px-3 py-3">{row.customer_name || '—'}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{money(row.amount, currency)}</td></tr>)}</tbody></table>{!rows.length && <div className="p-8 text-center text-sm text-muted-foreground">{t('salesSourceManagement.noHistory')}</div>}</div>;
}

export default function SalesSourceManagement() {
  const { t, lang, currency } = useLanguage();
  const navigate = useNavigate();
  const { branches } = useTenant();
  const { selectedBranchId, isAllBranches, setSelectedBranchId } = useBranchScope();
  const { canCustomize, paymentMethods, saveSalesSource, deleteSalesSource, isSavingSalesSource, isDeletingSalesSource } = useSalesClosingCustomization();
  const [tab, setTab] = useState('overview');
  const [rangePreset, setRangePreset] = useState('month');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('order');
  const [sourceEditor, setSourceEditor] = useState(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ sourceId: 'all', paymentMethod: 'all', cashier: '' });
  const range = salesSourceDateRange(rangePreset, customRange);
  const managementFilters = {
    ...range,
    sourceId: filters.sourceId === 'all' ? null : filters.sourceId,
    paymentMethod: filters.paymentMethod === 'all' ? null : filters.paymentMethod,
    cashier: filters.cashier.trim() || null,
  };
  const {
    sources,
    history,
    paymentOptions,
    isLoading,
    isHistoryLoading,
    error,
    hasNextPage,
    refetch,
  } = useSalesSourceManagement({ filters: managementFilters, page });
  const canManage = canCustomize;

  const filteredSources = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = sources.filter((source) => (status === 'all' || (status === 'active' ? source.is_active !== false : source.is_active === false))
      && (!q || [sourceDisplayName(source, lang), source.description, source.default_payment_method, source.category].filter(Boolean).join(' ').toLowerCase().includes(q)));
    return [...filtered].sort((a, b) => {
      if (sort === 'revenue') return numeric(b.analytics.total_sales) - numeric(a.analytics.total_sales);
      if (sort === 'today') return numeric(b.analytics.today_sales) - numeric(a.analytics.today_sales);
      if (sort === 'transactions') return numeric(b.analytics.transaction_count) - numeric(a.analytics.transaction_count);
      if (sort === 'average') return numeric(b.analytics.average_transaction) - numeric(a.analytics.average_transaction);
      if (sort === 'outstanding') return numeric(b.analytics.outstanding_amount) - numeric(a.analytics.outstanding_amount);
      if (sort === 'contribution') return numeric(b.analytics.contribution_percent) - numeric(a.analytics.contribution_percent);
      return numeric(a.sort_order) - numeric(b.sort_order);
    });
  }, [lang, query, sort, sources, status]);

  const totals = useMemo(() => sources.reduce((summary, source) => ({
    today: summary.today + numeric(source.analytics.today_sales),
    previous: summary.previous + numeric(source.analytics.previous_sales),
    total: summary.total + numeric(source.analytics.total_sales),
    transactions: summary.transactions + numeric(source.analytics.transaction_count),
    outstanding: summary.outstanding + numeric(source.analytics.outstanding_amount),
    collected: summary.collected + numeric(source.analytics.collected_amount),
    credit: summary.credit + numeric(source.analytics.credit_amount),
    cash: summary.cash + numeric(source.analytics.cash_amount),
    digital: summary.digital + numeric(source.analytics.digital_amount),
  }), { today: 0, previous: 0, total: 0, transactions: 0, outstanding: 0, collected: 0, credit: 0, cash: 0, digital: 0 }), [sources]);

  const bySource = useMemo(() => filteredSources.map((source) => ({ name: sourceDisplayName(source, lang), value: numeric(source.analytics.total_sales) })), [filteredSources, lang]);
  const paymentMix = useMemo(() => [{ name: t('salesSourceManagement.cashAmount'), value: totals.cash }, { name: t('salesSourceManagement.digitalAmount'), value: totals.digital }, { name: t('salesSourceManagement.creditAmount'), value: totals.credit }].filter((entry) => entry.value > 0), [t, totals]);
  const trend = useMemo(() => Object.values(history.reduce((rows, row) => {
    const date = row.closing_date;
    rows[date] = rows[date] || { date, amount: 0 };
    rows[date].amount += numeric(row.amount);
    return rows;
  }, {})).sort((a, b) => a.date.localeCompare(b.date)), [history]);

  const saveSource = async (source) => {
    try {
      await saveSalesSource(source);
      setSourceEditor(null);
      toast.success(t('salesSourceManagement.saved'));
    } catch (saveError) {
      toast.error(saveError?.message || t('salesSourceManagement.saveError'));
    }
  };
  const toggleSource = async (source) => {
    try {
      await saveSalesSource({ ...source, is_active: source.is_active === false });
      toast.success(source.is_active === false ? t('salesSourceManagement.activated') : t('salesSourceManagement.deactivated'));
    } catch (saveError) {
      toast.error(saveError?.message || t('salesSourceManagement.saveError'));
    }
  };
  const deleteSource = async (source) => {
    if (!window.confirm(t('salesSourceManagement.deleteConfirm'))) return;
    try {
      await deleteSalesSource(source);
      toast.success(t('salesSourceManagement.deleted'));
    } catch (deleteError) {
      toast.error(deleteError?.message === 'SALES_SOURCE_IN_USE' ? t('salesSourceManagement.archiveInstead') : (deleteError?.message || t('salesSourceManagement.deleteError')));
    }
  };
  const moveSource = async (index, direction) => {
    const other = filteredSources[index + direction];
    const source = filteredSources[index];
    if (!source || !other) return;
    try {
      await saveSalesSource({ ...source, sort_order: other.sort_order });
      await saveSalesSource({ ...other, sort_order: source.sort_order });
    } catch (saveError) {
      toast.error(saveError?.message || t('salesSourceManagement.saveError'));
    }
  };
  const exportSummary = () => {
    const headers = [t('salesSourceManagement.source'), t('salesSourceManagement.category'), t('salesSourceManagement.today'), t('salesSourceManagement.previous'), t('salesSourceManagement.totalSales'), t('salesSourceManagement.transactions'), t('salesSourceManagement.averageTransaction'), t('salesSourceManagement.outstanding')];
    const rows = filteredSources.map((source) => [sourceDisplayName(source, lang), t(`salesSourceManagement.category.${source.category || 'other'}`), numeric(source.analytics.today_sales), numeric(source.analytics.previous_sales), numeric(source.analytics.total_sales), numeric(source.analytics.transaction_count), numeric(source.analytics.average_transaction), numeric(source.analytics.outstanding_amount)]);
    downloadCSV(`sales-source-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, rows);
  };
  const exportHistory = () => {
    const headers = [t('salesSourceManagement.date'), t('salesSourceManagement.source'), t('salesSourceManagement.branch'), t('salesSourceManagement.user'), t('salesSourceManagement.paymentMethod'), t('salesSourceManagement.customer'), t('salesSourceManagement.amount')];
    const rows = history.map((row) => [row.closing_date, row.source ? sourceDisplayName(row.source, lang) : row.source_key, row.branch || '', row.cashier_name || row.created_by || '', row.payment_method || '', row.customer_name || '', money(row.amount, currency)]);
    downloadPDF({ filename: `sales-source-history-${format(new Date(), 'yyyy-MM-dd')}.pdf`, title: t('salesSourceManagement.history'), subtitle: `${range.from || '—'} – ${range.to || '—'}`, headers, rows, lang, dir: lang === 'en' ? 'ltr' : 'rtl' });
  };
  const updateFilters = (patch) => { setFilters((current) => ({ ...current, ...patch })); setPage(0); };
  const clearFilters = () => { setRangePreset('month'); setCustomRange({ from: '', to: '' }); setFilters({ sourceId: 'all', paymentMethod: 'all', cashier: '' }); setQuery(''); setStatus('all'); setPage(0); };

  if (isLoading && !sources.length) return <main className="flex min-h-[60vh] items-center justify-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{t('salesSourceManagement.loading')}</div></main>;

  return <main className="mx-auto w-full max-w-[1600px] space-y-4 p-4 pb-28 sm:p-6 lg:p-8"><PageHeader title={t('salesSourceManagement.title')} subtitle={t('salesSourceManagement.subtitle')} icon={CircleDollarSign} actions={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => navigate('/sales-closing-customization')}><Settings2 className="mr-2 h-4 w-4" />{t('salesSourceManagement.customizeClosing')}</Button>{canManage && <Button type="button" onClick={() => setSourceEditor({ mode: 'create', source: newSalesClosingSource((sources.length + 1) * 10) })}><Plus className="mr-2 h-4 w-4" />{t('salesSourceManagement.addSource')}</Button>}</div>} />
    {error && <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><div className="flex items-center justify-between gap-3"><span>{error.message || t('salesSourceManagement.loadError')}</span><Button type="button" size="sm" variant="outline" onClick={refetch}><RotateCcw className="mr-2 h-4 w-4" />{t('salesSourceManagement.retry')}</Button></div></Card>}
    <Card className="p-3 sm:p-4"><div className="grid gap-3 lg:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]"><div><Label>{t('salesSourceManagement.branch')}</Label><Select value={isAllBranches ? 'all' : String(selectedBranchId)} onValueChange={setSelectedBranchId}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('salesSourceManagement.allBranches')}</SelectItem>{asArray(branches).map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name || branch.label || branch.branch_key || branch.key}</SelectItem>)}</SelectContent></Select></div><div><Label>{t('salesSourceManagement.range')}</Label><Select value={rangePreset} onValueChange={(value) => { setRangePreset(value); setPage(0); }}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{['today', 'yesterday', 'week', 'month', 'custom'].map((value) => <SelectItem key={value} value={value}>{t(`salesSourceManagement.range.${value}`)}</SelectItem>)}</SelectContent></Select></div>{rangePreset === 'custom' && <><div><Label>{t('salesSourceManagement.from')}</Label><Input className="mt-1" type="date" value={customRange.from} onChange={(event) => { setCustomRange((current) => ({ ...current, from: event.target.value })); setPage(0); }} /></div><div><Label>{t('salesSourceManagement.to')}</Label><Input className="mt-1" type="date" value={customRange.to} onChange={(event) => { setCustomRange((current) => ({ ...current, to: event.target.value })); setPage(0); }} /></div></>}<div className={rangePreset === 'custom' ? '' : 'lg:col-span-2'}><Label>{t('salesSourceManagement.search')}</Label><Input className="mt-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('salesSourceManagement.searchPlaceholder')} /></div></div></Card>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><SourceMetric label={t('salesSourceManagement.today')} value={totals.today} icon={CalendarDays} currency={currency} /><SourceMetric label={t('salesSourceManagement.previous')} value={totals.previous} icon={Activity} currency={currency} tone="text-violet-600" /><SourceMetric label={t('salesSourceManagement.totalSales')} value={totals.total} icon={BarChart3} currency={currency} tone="text-emerald-600" /><SourceMetric label={t('salesSourceManagement.transactions')} value={totals.transactions} icon={ReceiptText} /><SourceMetric label={t('salesSourceManagement.outstanding')} value={totals.outstanding} icon={Landmark} currency={currency} tone="text-amber-600" /><SourceMetric label={t('salesSourceManagement.collected')} value={totals.collected} icon={Users} currency={currency} tone="text-cyan-600" /></div>
    <Tabs value={tab} onValueChange={setTab} className="space-y-4"><TabsList className="h-auto w-full justify-start overflow-x-auto"><TabsTrigger value="overview">{t('salesSourceManagement.overview')}</TabsTrigger><TabsTrigger value="sources">{t('salesSourceManagement.sources')}</TabsTrigger><TabsTrigger value="history">{t('salesSourceManagement.history')}</TabsTrigger><TabsTrigger value="analytics">{t('salesSourceManagement.analytics')}</TabsTrigger><TabsTrigger value="reconciliation">{t('salesSourceManagement.reconciliation')}</TabsTrigger></TabsList>
      <TabsContent value="overview" className="space-y-4"><div className="grid gap-4 lg:grid-cols-2"><Card className="p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">{t('salesSourceManagement.salesBySource')}</h2><p className="text-xs text-muted-foreground">{t('salesSourceManagement.sourceContribution')}</p></div><Button type="button" size="sm" variant="outline" onClick={exportSummary}><Download className="mr-2 h-4 w-4" />{t('salesSourceManagement.exportSummary')}</Button></div><div className="h-72">{bySource.some((row) => row.value > 0) ? <ResponsiveContainer width="100%" height="100%"><BarChart data={bySource}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-22} textAnchor="end" height={72} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => money(value, currency)} /><Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#2563eb" /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('salesSourceManagement.noChartData')}</div>}</div></Card><Card className="p-4"><div className="mb-3"><h2 className="font-semibold">{t('salesSourceManagement.paymentMix')}</h2><p className="text-xs text-muted-foreground">{t('salesSourceManagement.cashVsCredit')}</p></div><div className="h-72">{paymentMix.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={paymentMix} dataKey="value" nameKey="name" innerRadius={54} outerRadius={88} paddingAngle={4}>{paymentMix.map((entry, index) => <Cell key={entry.name} fill={COLORS[index]} />)}</Pie><Tooltip formatter={(value) => money(value, currency)} /></PieChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('salesSourceManagement.noChartData')}</div>}</div></Card></div><Card className="p-4"><div className="mb-3"><h2 className="font-semibold">{t('salesSourceManagement.sourcePerformance')}</h2><p className="text-xs text-muted-foreground">{t('salesSourceManagement.rankings')}</p></div><SourceTable sources={filteredSources.slice(0, 8)} lang={lang} t={t} currency={currency} canManage={canManage} onEdit={(source) => setSourceEditor({ mode: 'edit', source })} onToggle={toggleSource} onDelete={deleteSource} onMove={moveSource} onView={(source) => { updateFilters({ sourceId: source.id }); setTab('history'); }} /></Card></TabsContent>
      <TabsContent value="sources" className="space-y-4"><Card className="p-3 sm:p-4"><div className="grid gap-3 md:grid-cols-3"><div><Label>{t('salesSourceManagement.status')}</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('salesSourceManagement.status.all')}</SelectItem><SelectItem value="active">{t('salesSourceManagement.active')}</SelectItem><SelectItem value="inactive">{t('salesSourceManagement.inactive')}</SelectItem></SelectContent></Select></div><div><Label>{t('salesSourceManagement.sort')}</Label><Select value={sort} onValueChange={setSort}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{['order', 'revenue', 'today', 'transactions', 'average', 'outstanding', 'contribution'].map((value) => <SelectItem key={value} value={value}>{t(`salesSourceManagement.sort.${value}`)}</SelectItem>)}</SelectContent></Select></div><div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={clearFilters}><Filter className="mr-2 h-4 w-4" />{t('salesSourceManagement.clearFilters')}</Button></div></div></Card><SourceTable sources={filteredSources} lang={lang} t={t} currency={currency} canManage={canManage} onEdit={(source) => setSourceEditor({ mode: 'edit', source })} onToggle={toggleSource} onDelete={deleteSource} onMove={moveSource} onView={(source) => { updateFilters({ sourceId: source.id }); setTab('history'); }} /></TabsContent>
      <TabsContent value="history" className="space-y-4"><Card className="p-3 sm:p-4"><div className="grid gap-3 md:grid-cols-4"><div><Label>{t('salesSourceManagement.source')}</Label><Select value={filters.sourceId} onValueChange={(sourceId) => updateFilters({ sourceId })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('salesSourceManagement.allSources')}</SelectItem>{sources.map((source) => <SelectItem key={source.id} value={source.id}>{sourceDisplayName(source, lang)}</SelectItem>)}</SelectContent></Select></div><div><Label>{t('salesSourceManagement.paymentMethod')}</Label><Select value={filters.paymentMethod} onValueChange={(paymentMethod) => updateFilters({ paymentMethod })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('salesSourceManagement.allPaymentMethods')}</SelectItem>{paymentOptions.map((method) => <SelectItem key={method} value={method}>{method.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div><div><Label>{t('salesSourceManagement.user')}</Label><Input className="mt-1" value={filters.cashier} onChange={(event) => updateFilters({ cashier: event.target.value })} placeholder={t('salesSourceManagement.userPlaceholder')} /></div><div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={exportHistory}><Download className="mr-2 h-4 w-4" />{t('salesSourceManagement.exportHistory')}</Button></div></div></Card>{isHistoryLoading ? <Card className="flex min-h-48 items-center justify-center p-4 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('salesSourceManagement.loading')}</Card> : <HistoryTable rows={history} lang={lang} t={t} currency={currency} />}<div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{t('salesSourceManagement.pageSize', { count: SALES_SOURCE_HISTORY_PAGE_SIZE })}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" />{t('salesSourceManagement.previousPage')}</Button><Button type="button" variant="outline" size="sm" disabled={!hasNextPage} onClick={() => setPage((current) => current + 1)}>{t('salesSourceManagement.nextPage')}<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div></TabsContent>
      <TabsContent value="analytics" className="space-y-4"><div className="grid gap-4 lg:grid-cols-2"><Card className="p-4"><h2 className="font-semibold">{t('salesSourceManagement.sourceTrend')}</h2><p className="mb-3 text-xs text-muted-foreground">{t('salesSourceManagement.filteredTrend')}</p><div className="h-72">{trend.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><defs><linearGradient id="sourceTrend" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => money(value, currency)} /><Area type="monotone" dataKey="amount" stroke="#2563eb" fill="url(#sourceTrend)" /></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('salesSourceManagement.noChartData')}</div>}</div></Card><Card className="p-4"><h2 className="font-semibold">{t('salesSourceManagement.performanceRank')}</h2><p className="mb-3 text-xs text-muted-foreground">{t('salesSourceManagement.growthNote')}</p><div className="space-y-2">{filteredSources.slice(0, 8).map((source, index) => <div key={source.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="truncate font-semibold"><span className="mr-2 text-muted-foreground">#{index + 1}</span>{sourceDisplayName(source, lang)}</p><p className="mt-0.5 text-xs text-muted-foreground">{numeric(source.analytics.contribution_percent).toFixed(2)}% {t('salesSourceManagement.contribution')}</p></div><p className="shrink-0 font-black tabular-nums">{money(source.analytics.total_sales, currency)}</p></div>)}</div></Card></div></TabsContent>
      <TabsContent value="reconciliation" className="space-y-4"><Card className="p-4"><div className="mb-4 flex items-start gap-3"><ListFilter className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-semibold">{t('salesSourceManagement.financialReconciliation')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('salesSourceManagement.reconciliationHelp')}</p></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SourceMetric label={t('salesSourceManagement.expectedSales')} value={totals.total} currency={currency} icon={FileText} /><SourceMetric label={t('salesSourceManagement.collected')} value={totals.collected} currency={currency} icon={ReceiptText} tone="text-emerald-600" /><SourceMetric label={t('salesSourceManagement.outstanding')} value={totals.outstanding} currency={currency} icon={Landmark} tone="text-amber-600" /><SourceMetric label={t('salesSourceManagement.creditAmount')} value={totals.credit} currency={currency} icon={Users} tone="text-violet-600" /></div><div className="mt-4 overflow-x-auto rounded-xl border"><table className="w-full min-w-[680px] text-sm"><thead className="bg-muted/60 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">{t('salesSourceManagement.source')}</th><th className="px-3 py-3 text-right">{t('salesSourceManagement.expectedSales')}</th><th className="px-3 py-3 text-right">{t('salesSourceManagement.collected')}</th><th className="px-3 py-3 text-right">{t('salesSourceManagement.outstanding')}</th><th className="px-3 py-3 text-right">{t('salesSourceManagement.difference')}</th></tr></thead><tbody>{filteredSources.map((source) => { const expected = numeric(source.analytics.total_sales); const collected = numeric(source.analytics.collected_amount); const difference = collected - expected; return <tr key={source.id} className="border-t"><td className="px-3 py-3 font-medium">{sourceDisplayName(source, lang)}</td><td className="px-3 py-3 text-right tabular-nums">{money(expected, currency)}</td><td className="px-3 py-3 text-right tabular-nums">{money(collected, currency)}</td><td className="px-3 py-3 text-right tabular-nums">{money(source.analytics.outstanding_amount, currency)}</td><td className={`px-3 py-3 text-right font-semibold tabular-nums ${difference < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{difference >= 0 ? '+' : ''}{money(difference, currency)}</td></tr>; })}</tbody></table></div></Card></TabsContent>
    </Tabs>
    <SalesSourceDialog editor={sourceEditor} onClose={() => setSourceEditor(null)} onSave={saveSource} isSaving={isSavingSalesSource || isDeletingSalesSource} paymentMethods={paymentMethods} branches={branches} />
  </main>;
}
