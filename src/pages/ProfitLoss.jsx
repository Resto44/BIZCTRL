import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { jsPDF } from 'jspdf';
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  LineChart as LineChartIcon,
  Printer,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

import { base44, supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { formatCurrency } from '@/lib/helpers';
import { useSalesSources } from '@/hooks/useSalesSources';
import {
  buildFinancialTrend,
  calculateBranchComparison,
  calculateFinancialReport,
  exportRows,
  formatFinancialPercentage,
  previousFinancialDateRange,
  resolveFinancialDateRange,
} from '@/services/analytics/financialAnalysis';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const DATE_PRESETS = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['thisWeek', 'This Week'],
  ['lastWeek', 'Last Week'],
  ['month', 'This Month'],
  ['lastMonth', 'Last Month'],
  ['quarter', 'Quarter'],
  ['year', 'Year'],
  ['custom', 'Custom Range'],
];

const TREND_OPTIONS = [
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['yearly', 'Yearly'],
  ['sixMonths', '6 Months'],
  ['twelveMonths', '12 Months'],
];

const FINANCIAL_TABLES = [
  'daily_sales',
  'purchases',
  'supplier_invoices',
  'expenses',
  'expense_categories',
  'products',
  'categories',
  'customers',
  'suppliers',
  'sales_sources',
];

const EMPTY_DATA = {
  sales: [],
  purchases: [],
  supplierInvoices: [],
  expenses: [],
  expenseCategories: [],
  products: [],
  categories: [],
  customers: [],
  suppliers: [],
};

const money = (value, currency) => formatCurrency(value || 0, currency);
const pct = (value) => formatFinancialPercentage(value || 0);
const titleCase = (value) => String(value || '')
  .replace(/([A-Z])/g, ' $1')
  .replace(/^./, (char) => char.toUpperCase())
  .trim();

function downloadBlob(contents, filename, mime) {
  const blob = new Blob([contents], { type: mime });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvFromRows(rows) {
  return rows.map((row) => row.map(csvValue).join(',')).join('\n');
}

function xlsFromRows(rows) {
  const cell = (value) => `<td>${String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</td>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body><table>${rows
    .map((row) => `<tr>${row.map(cell).join('')}</tr>`)
    .join('')}</table></body></html>`;
}

function printableTable(rows) {
  const cell = (value, tag = 'td') => `<${tag}>${String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</${tag}>`;
  return `<table>${rows.map((row, index) => `<tr>${row.map((value) => cell(value, index === 0 ? 'th' : 'td')).join('')}</tr>`).join('')}</table>`;
}

function MetricCard({ label, value, subtitle, tone = 'neutral', icon: Icon }) {
  const toneClasses = {
    positive: 'text-emerald-600',
    negative: 'text-red-500',
    warning: 'text-amber-600',
    neutral: 'text-foreground',
  };
  return (
    <Card className="p-4 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground leading-5">{label}</p>
        {Icon && <Icon className={`h-4 w-4 shrink-0 ${toneClasses[tone]}`} />}
      </div>
      <p className={`mt-1 truncate text-lg font-bold ${toneClasses[tone]}`}>{value}</p>
      {subtitle && <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>}
    </Card>
  );
}

function StatementRow({ label, value, currency, emphasis, negative, percent }) {
  const className = emphasis
    ? 'border-t border-border pt-2 mt-2 font-semibold'
    : 'text-muted-foreground';
  const valueClass = negative && value > 0
    ? 'text-red-500'
    : emphasis && value < 0
      ? 'text-red-500'
      : emphasis && value > 0
        ? 'text-emerald-600'
        : '';
  return (
    <div className={`flex items-center justify-between gap-4 py-1 text-sm ${className}`}>
      <span className="min-w-0 truncate">{label}</span>
      <span className={`shrink-0 font-medium ${valueClass}`}>
        {percent ? pct(value) : negative && value > 0 ? `(${money(value, currency)})` : money(value, currency)}
      </span>
    </div>
  );
}

function TrendLegend({ label, color }) {
  return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>;
}

function ListCard({ title, items, currency, inverse = false }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-muted-foreground"><span className="mr-2 text-foreground/70">{index + 1}.</span>{item.name}</span>
              <span className={`shrink-0 font-semibold ${inverse ? 'text-red-500' : ''}`}>{money(item.value, currency)}</span>
            </div>
          ))}
        </div>
      ) : <p className="text-xs text-muted-foreground">No live records for this period.</p>}
    </Card>
  );
}

function BranchSelector({
  branches,
  isManager,
  scopeMode,
  setScopeMode,
  selectedBranchKeys,
  setSelectedBranchKeys,
}) {
  const selectable = branches.filter((branch) => branch?.key || branch?.branch_key);
  const currentKey = selectedBranchKeys[0] || selectable[0]?.key || selectable[0]?.branch_key || '';
  const toggleBranch = (key) => {
    setSelectedBranchKeys((previous) => {
      const selected = previous.includes(key);
      if (selected && previous.length === 1) return previous;
      return selected ? previous.filter((value) => value !== key) : [...previous, key];
    });
  };

  if (isManager) {
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        Assigned branch access only
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Financial reporting scope"
        value={scopeMode}
        onChange={(event) => setScopeMode(event.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="organization">Organization Total</option>
        <option value="all">All Branches</option>
        <option value="single">Single Branch</option>
        <option value="multi">Multi Branch</option>
      </select>
      {scopeMode === 'single' && (
        <select
          aria-label="Select branch"
          value={currentKey}
          onChange={(event) => setSelectedBranchKeys([event.target.value])}
          className="h-9 max-w-[220px] rounded-md border border-input bg-background px-3 text-sm"
        >
          {selectable.map((branch) => {
            const key = branch.key || branch.branch_key;
            return <option key={key} value={key}>{branch.label || branch.name || key}</option>;
          })}
        </select>
      )}
      {scopeMode === 'multi' && (
        <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-input bg-background px-3 py-2">
          {selectable.map((branch) => {
            const key = branch.key || branch.branch_key;
            return (
              <label key={key} className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input type="checkbox" checked={selectedBranchKeys.includes(key)} onChange={() => toggleBranch(key)} />
                <span>{branch.label || branch.name || key}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProfitLoss() {
  const { currency } = useLanguage();
  const {
    activeRestaurant,
    branches = [],
    managerBranch,
    isManager,
  } = useTenant();
  const queryClient = useQueryClient();
  const { allSources: salesSources = [] } = useSalesSources();

  const [datePreset, setDatePreset] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [scopeMode, setScopeMode] = useState('organization');
  const [selectedBranchKeys, setSelectedBranchKeys] = useState([]);
  const [trendMode, setTrendMode] = useState('monthly');
  const [exportOpen, setExportOpen] = useState(false);

  const availableBranches = useMemo(
    () => branches.filter((branch) => branch?.key || branch?.branch_key),
    [branches],
  );
  const branchKeys = useMemo(
    () => availableBranches.map((branch) => String(branch.key || branch.branch_key)).filter(Boolean),
    [availableBranches],
  );

  useEffect(() => {
    if (isManager) {
      setScopeMode('single');
      const assigned = managerBranch || branchKeys[0] || '';
      if (assigned) setSelectedBranchKeys([assigned]);
      return;
    }
    setSelectedBranchKeys((previous) => {
      const retained = previous.filter((key) => branchKeys.includes(key));
      return retained.length ? retained : branchKeys.slice(0, 1);
    });
  }, [branchKeys.join('|'), isManager, managerBranch]);

  const restaurantId = activeRestaurant?.id;
  const { data: financialData = EMPTY_DATA, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['financial-analysis', restaurantId],
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!restaurantId) return EMPTY_DATA;
      const scope = { restaurant_id: restaurantId };
      const [
        sales,
        purchases,
        supplierInvoices,
        expenses,
        expenseCategories,
        products,
        categories,
        customers,
        suppliers,
      ] = await Promise.all([
        base44.entities.DailySales.filter(scope, '-date', 5000),
        base44.entities.Purchase.filter(scope, '-date', 5000),
        base44.entities.SupplierInvoice.filter(scope, '-date', 5000),
        base44.entities.Expense.filter(scope, '-date', 5000),
        base44.entities.ExpenseCategory.filter(scope, 'sort_order', 500),
        base44.entities.Product.filter(scope, 'name', 5000),
        base44.entities.Category.filter(scope, 'name_en', 1000),
        base44.entities.Customer.filter(scope, 'name', 5000),
        base44.entities.Supplier.filter(scope, 'name', 5000),
      ]);
      return {
        sales,
        purchases,
        supplierInvoices,
        expenses,
        expenseCategories,
        products,
        categories,
        customers,
        suppliers,
      };
    },
  });

  useEffect(() => {
    if (!restaurantId) return undefined;
    const channel = supabase
      .channel(`financial-analysis-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: FINANCIAL_TABLES[0], filter: `restaurant_id=eq.${restaurantId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['financial-analysis', restaurantId] });
      });
    FINANCIAL_TABLES.slice(1).forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `restaurant_id=eq.${restaurantId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['financial-analysis', restaurantId] });
      });
    });
    channel.subscribe();
    return () => supabase.removeChannel(channel);
  }, [queryClient, restaurantId]);

  const range = useMemo(
    () => resolveFinancialDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  );
  const previousRange = useMemo(() => previousFinancialDateRange(range), [range]);
  const effectiveScope = useMemo(() => {
    if (isManager) {
      return { mode: 'single', branchKeys: [managerBranch || selectedBranchKeys[0]].filter(Boolean), includeGlobal: false };
    }
    return {
      mode: scopeMode,
      branchKeys: selectedBranchKeys,
      includeGlobal: !['single', 'multi'].includes(scopeMode),
    };
  }, [isManager, managerBranch, scopeMode, selectedBranchKeys]);

  const reportInput = useMemo(() => ({ ...financialData, salesSources }), [financialData, salesSources]);
  const report = useMemo(
    () => calculateFinancialReport({ ...reportInput, range, scope: effectiveScope, branches: availableBranches }),
    [availableBranches, effectiveScope, range, reportInput],
  );
  const trendData = useMemo(
    () => buildFinancialTrend({ trend: trendMode, range, scope: effectiveScope, branches: availableBranches, data: reportInput }),
    [availableBranches, effectiveScope, range, reportInput, trendMode],
  );
  const branchComparison = useMemo(
    () => calculateBranchComparison({
      branches: availableBranches,
      range,
      previousRange,
      data: reportInput,
      accessibleBranchKeys: isManager ? [managerBranch].filter(Boolean) : [],
    }),
    [availableBranches, isManager, managerBranch, previousRange, range, reportInput],
  );

  const topBranches = branchComparison.slice(0, 5).map((entry) => ({
    name: entry.branch?.label || entry.branch?.name || entry.key,
    value: entry.netProfit,
  }));
  const worstBranches = [...branchComparison]
    .sort((a, b) => a.netProfit - b.netProfit)
    .slice(0, 5)
    .map((entry) => ({ name: entry.branch?.label || entry.branch?.name || entry.key, value: entry.netProfit }));
  const exportData = useMemo(() => exportRows(report, branchComparison), [branchComparison, report]);

  const downloadCSV = () => downloadBlob(csvFromRows(exportData), `financial-analysis_${range.from}_${range.to}.csv`, 'text/csv;charset=utf-8');
  const downloadExcel = () => downloadBlob(xlsFromRows(exportData), `financial-analysis_${range.from}_${range.to}.xls`, 'application/vnd.ms-excel');
  const downloadPDF = () => {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const lines = [
      'ERP Financial Analysis',
      `Period: ${range.from} to ${range.to}`,
      '',
      ...exportData.map((row) => row.filter((value) => value !== undefined && value !== null && value !== '').join('   |   ')),
    ];
    const pageHeight = pdf.internal.pageSize.getHeight();
    let y = 42;
    lines.forEach((line) => {
      const wrapped = pdf.splitTextToSize(line, 510);
      wrapped.forEach((part) => {
        if (y > pageHeight - 42) {
          pdf.addPage();
          y = 42;
        }
        pdf.text(part, 42, y);
        y += 14;
      });
    });
    pdf.save(`financial-analysis_${range.from}_${range.to}.pdf`);
  };
  const printReport = () => {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>ERP Financial Analysis</title><style>body{font-family:Arial,sans-serif;color:#111827;padding:28px}h1{font-size:20px;margin:0 0 6px}p{color:#4b5563;font-size:12px;margin:0 0 18px}table{border-collapse:collapse;width:100%;font-size:11px;margin-bottom:20px}th,td{border:1px solid #d1d5db;padding:6px;text-align:left}th{background:#f3f4f6}</style></head><body><h1>ERP Financial Analysis</h1><p>${range.from} to ${range.to}</p>${printableTable(exportData)}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const scopeLabel = isManager
    ? availableBranches.find((branch) => (branch.key || branch.branch_key) === managerBranch)?.label || 'Assigned Branch'
    : scopeMode === 'single'
      ? availableBranches.find((branch) => (branch.key || branch.branch_key) === selectedBranchKeys[0])?.label || 'Selected Branch'
      : scopeMode === 'multi'
        ? `${selectedBranchKeys.length} Branches`
        : scopeMode === 'all'
          ? 'All Branches'
          : 'Organization Total';

  return (
    <div>
      <PageHeader
        title="Profit & Loss"
        action={
          <div className="relative flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['financial-analysis', restaurantId] })} disabled={!restaurantId}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={() => setExportOpen((open) => !open)}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
            {exportOpen && (
              <div className="absolute right-0 top-10 z-30 w-44 rounded-md border border-border bg-popover p-1 shadow-lg">
                <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { downloadPDF(); setExportOpen(false); }}><FileText className="h-4 w-4" /> PDF</button>
                <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { downloadExcel(); setExportOpen(false); }}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
                <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { downloadCSV(); setExportOpen(false); }}><Download className="h-4 w-4" /> CSV</button>
                <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { printReport(); setExportOpen(false); }}><Printer className="h-4 w-4" /> Print</button>
              </div>
            )}
          </div>
        }
      />

      <Card className="mb-5 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <select
              aria-label="Date range"
              value={datePreset}
              onChange={(event) => setDatePreset(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {DATE_PRESETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {datePreset === 'custom' && (
              <>
                <input aria-label="Custom range start" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
                <input aria-label="Custom range end" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              </>
            )}
          </div>
          <BranchSelector
            branches={availableBranches}
            isManager={isManager}
            scopeMode={scopeMode}
            setScopeMode={setScopeMode}
            selectedBranchKeys={selectedBranchKeys}
            setSelectedBranchKeys={setSelectedBranchKeys}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span><Building2 className="mr-1 inline h-3.5 w-3.5" />{scopeLabel} · {range.from} to {range.to}</span>
          <span>{dataUpdatedAt ? `Live data refreshed ${new Date(dataUpdatedAt).toLocaleTimeString()}` : 'Loading live ERP data…'}</span>
        </div>
      </Card>

      {!restaurantId ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Select an organization to view its financial analysis.</Card>
      ) : (
        <>
          <section className="mb-5">
            <div className="mb-3 flex items-center gap-2"><WalletCards className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Financial KPIs</h2></div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <MetricCard label="Revenue" value={money(report.revenue.netRevenue, currency)} tone="neutral" icon={TrendingUp} />
              <MetricCard label="Purchases" value={money(report.purchases.netPurchaseCost, currency)} tone="warning" icon={WalletCards} />
              <MetricCard label="COGS" value={money(report.purchases.cogs, currency)} tone="warning" icon={WalletCards} />
              <MetricCard label="Gross Profit" value={money(report.profit.grossProfit, currency)} tone={report.profit.grossProfit >= 0 ? 'positive' : 'negative'} icon={report.profit.grossProfit >= 0 ? TrendingUp : TrendingDown} />
              <MetricCard label="Operating Expense" value={money(report.expenses.operating, currency)} tone="warning" icon={WalletCards} />
              <MetricCard label="Fixed Expense" value={money(report.expenses.fixed, currency)} tone="warning" icon={WalletCards} />
              <MetricCard label="Variable Expense" value={money(report.expenses.variable, currency)} tone="warning" icon={WalletCards} />
              <MetricCard label="Operating Profit" value={money(report.profit.operatingProfit, currency)} tone={report.profit.operatingProfit >= 0 ? 'positive' : 'negative'} icon={report.profit.operatingProfit >= 0 ? TrendingUp : TrendingDown} />
              <MetricCard label="Net Profit" value={money(report.profit.netProfit, currency)} tone={report.profit.netProfit >= 0 ? 'positive' : 'negative'} icon={report.profit.netProfit >= 0 ? TrendingUp : TrendingDown} />
              <MetricCard label="Profit Margin" value={pct(report.profit.netMargin)} tone={report.profit.netMargin >= 0 ? 'positive' : 'negative'} />
              <MetricCard label="Expense Ratio" value={pct(report.profit.expenseRatio)} tone="neutral" />
              <MetricCard label="Purchase Ratio" value={pct(report.profit.purchaseRatio)} tone="neutral" />
              <MetricCard label="Average Daily Revenue" value={money(report.profit.averageDailyRevenue, currency)} tone="neutral" />
              <MetricCard label="Average Daily Profit" value={money(report.profit.averageDailyProfit, currency)} tone={report.profit.averageDailyProfit >= 0 ? 'positive' : 'negative'} />
            </div>
          </section>

          <div className="mb-5 grid gap-5 xl:grid-cols-2">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Revenue</h2>
              <StatementRow label="Cash Sales" value={report.revenue.cash} currency={currency} />
              <StatementRow label="POS / Network Sales" value={report.revenue.network} currency={currency} />
              <StatementRow label="Credit Sales" value={report.revenue.credit} currency={currency} />
              <StatementRow label="Delivery Sales" value={report.revenue.delivery} currency={currency} />
              <StatementRow label="Online Orders" value={report.revenue.online} currency={currency} />
              <StatementRow label="Wallet Payments" value={report.revenue.wallet} currency={currency} />
              <StatementRow label="Other Revenue" value={report.revenue.other} currency={currency} />
              <StatementRow label="Discounts" value={report.revenue.discounts} currency={currency} negative />
              <StatementRow label="Returns" value={report.revenue.returns} currency={currency} negative />
              <StatementRow label="Net Revenue" value={report.revenue.netRevenue} currency={currency} emphasis />
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Purchase Analysis</h2>
              <StatementRow label="Raw Material Purchases" value={report.purchases.rawMaterial} currency={currency} />
              <StatementRow label="Packaging Purchases" value={report.purchases.packaging} currency={currency} />
              <StatementRow label="Other Purchases" value={report.purchases.other} currency={currency} />
              <StatementRow label="Purchase Returns" value={report.purchases.returns} currency={currency} negative />
              <StatementRow label="Net Purchase Cost" value={report.purchases.netPurchaseCost} currency={currency} emphasis />
              <StatementRow label="COGS" value={report.purchases.cogs} currency={currency} emphasis />
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Purchase Trend</p>
                <div className="h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(value) => money(value, currency)} />
                      <Bar dataKey="purchases" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          </div>

          <div className="mb-5 grid gap-5 xl:grid-cols-3">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Fixed Expenses</h2>
              {Object.entries(report.expenses.fixedBreakdown).length ? Object.entries(report.expenses.fixedBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([label, value]) => <StatementRow key={label} label={label} value={value} currency={currency} negative />)
                : <p className="text-xs text-muted-foreground">No fixed expenses recorded for this period.</p>}
              <StatementRow label="Total Fixed Expenses" value={report.expenses.fixed} currency={currency} emphasis negative />
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Variable Expenses</h2>
              {Object.entries(report.expenses.variableBreakdown).length ? Object.entries(report.expenses.variableBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([label, value]) => <StatementRow key={label} label={label} value={value} currency={currency} negative />)
                : <p className="text-xs text-muted-foreground">No variable expenses recorded for this period.</p>}
              <StatementRow label="Total Variable Expenses" value={report.expenses.variable} currency={currency} emphasis negative />
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Expense Cadence</h2>
              <StatementRow label="Daily Variable" value={report.expenses.variableCadence.daily} currency={currency} negative />
              <StatementRow label="Monthly Variable" value={report.expenses.variableCadence.monthly} currency={currency} negative />
              <StatementRow label="Yearly Variable" value={report.expenses.variableCadence.yearly} currency={currency} negative />
              <StatementRow label="Operating Expenses" value={report.expenses.operating} currency={currency} emphasis negative />
            </Card>
          </div>

          <Card className="mb-5 p-4">
            <h2 className="mb-3 text-sm font-semibold">Profit</h2>
            <div className="grid gap-x-8 lg:grid-cols-2">
              <div>
                <StatementRow label="Net Revenue" value={report.revenue.netRevenue} currency={currency} />
                <StatementRow label="Less: COGS" value={report.purchases.cogs} currency={currency} negative />
                <StatementRow label="Gross Profit" value={report.profit.grossProfit} currency={currency} emphasis />
                <StatementRow label="Less: Operating Expenses" value={report.expenses.operating} currency={currency} negative />
                <StatementRow label="Operating Profit" value={report.profit.operatingProfit} currency={currency} emphasis />
                <StatementRow label="Net Profit" value={report.profit.netProfit} currency={currency} emphasis />
              </div>
              <div>
                <StatementRow label="Gross Margin %" value={report.profit.grossMargin} percent />
                <StatementRow label="Operating Margin %" value={report.profit.operatingMargin} percent />
                <StatementRow label="Net Margin %" value={report.profit.netMargin} percent />
                <StatementRow label="Expense Ratio" value={report.profit.expenseRatio} percent />
                <StatementRow label="Purchase Ratio" value={report.profit.purchaseRatio} percent />
              </div>
            </div>
          </Card>

          <Card className="mb-5 p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2"><LineChartIcon className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Trend Analytics</h2></div>
              <div className="flex flex-wrap gap-1">
                {TREND_OPTIONS.map(([value, label]) => <Button key={value} size="sm" variant={trendMode === value ? 'default' : 'outline'} onClick={() => setTrendMode(value)}>{label}</Button>)}
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-3"><TrendLegend label="Revenue" color="#2563eb" /><TrendLegend label="Purchases" color="#f59e0b" /><TrendLegend label="Fixed Expenses" color="#ec4899" /><TrendLegend label="Variable Expenses" color="#f97316" /><TrendLegend label="Gross Profit" color="#10b981" /><TrendLegend label="Net Profit" color="#8b5cf6" /></div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => money(value, currency)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="purchases" name="Purchases" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="fixedExpenses" name="Fixed Expenses" stroke="#ec4899" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="variableExpenses" name="Variable Expenses" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="grossProfit" name="Gross Profit" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="mb-5 p-4">
            <div className="mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Branch Comparison</h2></div>
            {branchComparison.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead><tr className="border-b border-border text-muted-foreground"><th className="pb-2 text-left">Rank</th><th className="pb-2 text-left">Branch</th><th className="pb-2 text-right">Sales</th><th className="pb-2 text-right">Purchases</th><th className="pb-2 text-right">Expenses</th><th className="pb-2 text-right">Gross Profit</th><th className="pb-2 text-right">Net Profit</th><th className="pb-2 text-right">Profit Margin</th><th className="pb-2 text-right">Growth</th></tr></thead>
                  <tbody>{branchComparison.map((branch) => <tr key={branch.key} className="border-b border-border/60 last:border-0"><td className="py-2 font-semibold">#{branch.rank}</td><td className="py-2 font-medium">{branch.branch?.label || branch.branch?.name || branch.key}</td><td className="py-2 text-right">{money(branch.sales, currency)}</td><td className="py-2 text-right text-amber-600">{money(branch.purchases, currency)}</td><td className="py-2 text-right text-red-500">{money(branch.expenses, currency)}</td><td className={`py-2 text-right font-semibold ${branch.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{money(branch.grossProfit, currency)}</td><td className={`py-2 text-right font-semibold ${branch.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{money(branch.netProfit, currency)}</td><td className="py-2 text-right">{pct(branch.profitMargin)}</td><td className={`py-2 text-right ${branch.growth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{pct(branch.growth)}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted-foreground">No branch data is available for this scope and period.</p>}
          </Card>

          <section className="mb-5">
            <h2 className="mb-3 text-sm font-semibold">Top Lists</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ListCard title="Top 10 Products" items={report.topLists.products} currency={currency} />
              <ListCard title="Top Categories" items={report.topLists.categories} currency={currency} />
              <ListCard title="Top Customers" items={report.topLists.customers} currency={currency} />
              <ListCard title="Top Suppliers" items={report.topLists.suppliers} currency={currency} />
              <ListCard title="Top Expense Categories" items={report.topLists.expenseCategories} currency={currency} inverse />
              <ListCard title="Top Performing Branches" items={topBranches} currency={currency} />
              <ListCard title="Worst Performing Branches" items={worstBranches} currency={currency} inverse />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
