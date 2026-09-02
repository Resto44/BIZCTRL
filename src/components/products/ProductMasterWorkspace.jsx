import { memo, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Barcode,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileClock,
  History,
  Import,
  Layers3,
  MapPin,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  ScanBarcode,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  Truck,
  Warehouse,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { productIdentity } from '@/lib/productControlCenter';
import EnterpriseProductCatalog from '@/components/products/EnterpriseProductCatalog';

const MAIN_PAGES = [
  { id: 'overview', label: 'Overview', icon: SlidersHorizontal },
  { id: 'catalog', label: 'Catalog', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Warehouse },
  { id: 'pricing', label: 'Pricing', icon: Tag },
];

const PANEL_CLASS = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_32px_rgba(15,23,42,0.055)] dark:border-slate-800 dark:bg-slate-950';
const SOFT_PANEL_CLASS = 'rounded-xl border border-slate-200/80 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60';

function getRowKey(row) {
  return productIdentity(row.product);
}

function ProductThumbnail({ row, size = 'md' }) {
  const classes = size === 'lg' ? 'h-16 w-16 rounded-xl' : 'h-12 w-12 rounded-xl';
  if (row.product?.image_url) {
    return (
      <img
        src={row.product.image_url}
        alt=""
        loading="lazy"
        className={cn(classes, 'shrink-0 border border-slate-200 bg-white object-cover dark:border-slate-800')}
      />
    );
  }
  const Icon = row.tracksInventory ? Package : Clock3;
  return (
    <div className={cn(classes, 'flex shrink-0 items-center justify-center bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300')}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </div>
  );
}

function StatusPill({ status }) {
  const styles = {
    healthy: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    compliant: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    low: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
    review: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
    out: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300',
    blocked: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300',
    inactive: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    untracked: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300',
  };
  const label = {
    healthy: 'Healthy', compliant: 'Compliant', active: 'Active', low: 'Low stock', review: 'Review',
    out: 'Out of stock', blocked: 'Blocked', inactive: 'Inactive', untracked: 'Service',
  }[status] || status;
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold', styles[status] || styles.inactive)}>{label}</span>;
}

function MetricCard({ icon: Icon, label, value, helper, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300',
    red: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300',
  };
  return (
    <Card className="min-w-0 rounded-2xl border-slate-200/80 p-3.5 shadow-sm dark:border-slate-800 sm:p-4">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 break-words text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-2xl">{value}</p>
          {helper ? <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{helper}</p> : null}
        </div>
      </div>
    </Card>
  );
}

function EmptyPanel({ icon: Icon = Package, title, description, action }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="font-bold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const OverviewPage = memo(function OverviewPage({ snapshot, money, onAdd, onImport, onNavigate, onChangePage }) {
  const tracked = Math.max(1, snapshot.trackedProducts || 0);
  const health = Math.round((snapshot.healthy / tracked) * 100);
  const lowPercent = Math.round((snapshot.lowStock / tracked) * 100);
  const outPercent = Math.max(0, 100 - health - lowPercent);
  const insightRows = [
    {
      icon: TrendingDown,
      tone: 'red',
      title: `${snapshot.lowStock + snapshot.outOfStock} items need replenishment`,
      detail: snapshot.outOfStock ? `${snapshot.outOfStock} products are already out of stock.` : 'Reorder suggestions are ready.',
      action: () => onChangePage('inventory'),
    },
    {
      icon: TrendingUp,
      tone: 'amber',
      title: `${snapshot.priceApprovalQueue.length} pricing decisions need review`,
      detail: `Minimum margin guard is monitoring ${snapshot.totalProducts} products.`,
      action: () => onChangePage('pricing'),
    },
    {
      icon: Layers3,
      tone: 'blue',
      title: snapshot.duplicateSkus ? `${snapshot.duplicateSkus} duplicate SKU records detected` : 'Master data quality is healthy',
      detail: snapshot.duplicateSkus ? 'Merge duplicates to protect inventory accuracy.' : 'No duplicate product codes detected.',
      action: () => onChangePage('catalog'),
    },
  ];
  const insightTones = {
    red: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300',
  };

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricCard icon={Package} label="Total Products" value={snapshot.totalProducts.toLocaleString()} helper="Master records" />
        <MetricCard icon={PackageCheck} label="Active" value={snapshot.activeProducts.toLocaleString()} helper={`${snapshot.totalProducts ? Math.round((snapshot.activeProducts / snapshot.totalProducts) * 100) : 0}% of catalog`} tone="green" />
        <MetricCard icon={CircleDollarSign} label="Stock Value" value={money(snapshot.inventoryValue)} helper="At current cost" tone="violet" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={AlertTriangle} label="Low Stock" value={snapshot.lowStock} helper="Needs action" tone="amber" />
        <MetricCard icon={XCircle} label="Out of Stock" value={snapshot.outOfStock} helper="Urgent" tone="red" />
        <MetricCard icon={ClipboardCheck} label="Price Review" value={snapshot.priceApprovalQueue.length} helper="Awaiting decision" tone="blue" />
        <MetricCard icon={Tag} label="Price Alerts" value={snapshot.priceControlStatus.review + snapshot.priceControlStatus.blocked} helper="Margin guard" tone="amber" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className={cn(PANEL_CLASS, 'p-4 sm:p-5')} aria-labelledby="product-insights-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <h2 id="product-insights-title" className="font-black text-slate-950 dark:text-white">AI Insights</h2>
            </div>
            <Badge variant="secondary" className="rounded-full">Live ERP</Badge>
          </div>
          <div className="space-y-2">
            {insightRows.map(({ icon: Icon, tone, title, detail, action }) => (
              <button key={title} type="button" onClick={action} className="group flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-800 dark:hover:border-blue-900 dark:hover:bg-blue-950/30">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', insightTones[tone])}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">{title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{detail}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <section className={cn(PANEL_CLASS, 'p-4 sm:p-5')} aria-labelledby="inventory-health-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="inventory-health-title" className="font-black text-slate-950 dark:text-white">Inventory Health</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tracked master products</p>
            </div>
            <span className="text-2xl font-black text-emerald-600">{health}%</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-label={`Inventory health ${health}%`}>
            <span className="bg-emerald-500" style={{ width: `${health}%` }} />
            <span className="bg-amber-400" style={{ width: `${lowPercent}%` }} />
            <span className="bg-red-500" style={{ width: `${outPercent}%` }} />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            {[
              ['Healthy', snapshot.healthy, 'text-emerald-600'],
              ['At risk', snapshot.lowStock, 'text-amber-600'],
              ['Critical', snapshot.outOfStock, 'text-red-600'],
            ].map(([label, value, color]) => (
              <div key={label} className={cn(SOFT_PANEL_CLASS, 'p-2.5')}>
                <p className={cn('text-lg font-black', color)}>{value}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
              </div>
            ))}
          </div>
          <Button variant="outline" className="mt-4 w-full rounded-xl" onClick={() => onChangePage('inventory')}>View inventory details</Button>
        </section>
      </div>

      <section className={cn(PANEL_CLASS, 'p-4 sm:p-5')} aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="mb-3 flex items-center gap-2 font-black text-slate-950 dark:text-white">
          <Settings2 className="h-5 w-5 text-blue-600" aria-hidden="true" /> Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            [Plus, 'New Product', onAdd],
            [Import, 'Import Excel', onImport],
            [Package, 'Master Catalog', () => onChangePage('catalog')],
            [ScanBarcode, 'Scan', () => onNavigate('/retail/barcode')],
            [ArrowLeftRight, 'Transfer', () => onNavigate('/inventory-transfers')],
            [ShoppingCart, 'Purchase Order', () => onNavigate('/purchase-orders')],
          ].map(([Icon, label, action]) => (
            <button key={label} type="button" onClick={action} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/40">
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
});

const InventoryPage = memo(function InventoryPage({ snapshot, transactions, branches, selectedLocation, money, onAdjust, onNavigate }) {
  const selectedBranch = branches.find((branch) => String(branch.id || branch.key) === String(selectedLocation));
  const selectedBranchValues = selectedBranch
    ? [selectedBranch.id, selectedBranch.key, selectedBranch.branch_key, selectedBranch.name, selectedBranch.label]
      .filter(Boolean)
      .map(String)
    : [];
  const productMap = useMemo(() => {
    const map = new Map();
    snapshot.productRows.forEach((row) => {
      [row.product?.id, row.product?.product_id].filter(Boolean).forEach((key) => map.set(String(key), row));
    });
    return map;
  }, [snapshot.productRows]);
  const recent = transactions
    .filter((item) => selectedLocation === 'all'
      || selectedBranchValues.includes(String(item.branch_id || ''))
      || selectedBranchValues.includes(String(item.branch || '')))
    .slice(0, 8);
  const reserved = snapshot.productRows.reduce((sum, row) => sum + row.inventoryRows.reduce((itemSum, item) => itemSum + Number(item.reserved_quantity || 0) * row.cost, 0), 0);
  const availableValue = Math.max(0, snapshot.inventoryValue - reserved);
  const tracked = Math.max(1, snapshot.trackedProducts || 0);
  const health = Math.round((snapshot.healthy / tracked) * 100);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Inventory Control</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Live stock across warehouses and branches</p>
        </div>
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => onAdjust()}><ClipboardCheck className="mr-2 h-4 w-4" />Stock Count</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Stock', Warehouse, null],
          ['Transfers', ArrowLeftRight, '/inventory-transfers'],
          ['Batches', Boxes, '/retail/batches'],
          ['Serial Numbers', Barcode, '/retail/serials'],
        ].map(([label, Icon, route]) => (
          <button key={label} type="button" onClick={() => route && onNavigate(route)} className={cn('flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-bold sm:text-sm', route ? 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300' : 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/15')}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <MetricCard icon={Package} label="On Hand" value={money(snapshot.inventoryValue)} tone="blue" />
        <MetricCard icon={Archive} label="Reserved" value={money(reserved)} tone="amber" />
        <MetricCard icon={CheckCircle2} label="Available" value={money(availableValue)} tone="green" />
      </div>

      <section className={cn(PANEL_CLASS, 'p-4 sm:p-5')}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-black text-slate-950 dark:text-white">Stock Health</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{selectedBranch?.name || selectedBranch?.label || 'All locations'}</p>
          </div>
          <span className="text-xl font-black text-emerald-600">{health}%</span>
        </div>
        <div className="space-y-3">
          {[
            ['Healthy', snapshot.healthy, 'bg-emerald-500', 'text-emerald-600'],
            ['Low', snapshot.lowStock, 'bg-amber-400', 'text-amber-600'],
            ['Critical', snapshot.outOfStock, 'bg-red-500', 'text-red-600'],
          ].map(([label, value, bar, text]) => {
            const percentage = Math.round((value / tracked) * 100);
            return (
              <div key={label} className="grid grid-cols-[60px_minmax(0,1fr)_48px] items-center gap-3 text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-300">{label}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={cn('h-full rounded-full', bar)} style={{ width: `${percentage}%` }} /></div>
                <span className={cn('text-right font-black', text)}>{percentage}%</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className={cn(PANEL_CLASS, 'overflow-hidden')}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
            <div><h3 className="font-black text-slate-950 dark:text-white">Needs Attention</h3><p className="text-xs text-slate-500 dark:text-slate-400">Replenishment queue</p></div>
            <Badge variant="secondary" className="rounded-full">{snapshot.replenishmentQueue.length}</Badge>
          </div>
          {snapshot.replenishmentQueue.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {snapshot.replenishmentQueue.slice(0, 8).map((row, index) => (
                <div key={`${getRowKey(row)}-${row.branch?.id || index}`} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductThumbnail row={row} />
                    <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900 dark:text-white">{row.label}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{row.branch?.name || row.branch?.label || 'Master stock'} · Reorder {row.reorderPoint}</p></div>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <div className="text-right"><p className={cn('font-black', row.quantity <= 0 ? 'text-red-600' : 'text-amber-600')}>{row.quantity} left</p><p className="text-[10px] text-slate-400">Suggest {row.recommendedQuantity}</p></div>
                    <Button size="sm" variant="outline" className="rounded-lg" onClick={() => onNavigate('/purchase-orders')}><ShoppingCart className="mr-1 h-3.5 w-3.5" />Create PO</Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Adjust ${row.label}`} onClick={() => onAdjust(row.product)}><Settings2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="p-4"><EmptyPanel icon={PackageCheck} title="Stock levels are healthy" description="No product is currently below its reorder point." /></div>}
        </section>

        <section className={cn(PANEL_CLASS, 'overflow-hidden')}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
            <div><h3 className="font-black text-slate-950 dark:text-white">Recent Movements</h3><p className="text-xs text-slate-500 dark:text-slate-400">Latest inventory ledger entries</p></div>
            <History className="h-5 w-5 text-blue-600" aria-hidden="true" />
          </div>
          {recent.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((transaction) => {
                const row = productMap.get(String(transaction.product_id || ''));
                const qty = Number(transaction.quantity || 0);
                const isOut = ['stock_out', 'sale', 'waste', 'recipe_consumption', 'transfer_out'].includes(transaction.transaction_type);
                const signed = isOut ? -Math.abs(qty) : Math.abs(qty);
                return (
                  <div key={transaction.id} className="flex items-center gap-3 p-3.5">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', signed < 0 ? 'bg-red-50 text-red-600 dark:bg-red-950/60' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60')}>
                      {signed < 0 ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900 dark:text-white">{row?.label || transaction.product_name || 'Inventory item'}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{String(transaction.transaction_type || 'movement').replaceAll('_', ' ')}</p></div>
                    <span className={cn('font-black', signed < 0 ? 'text-red-600' : 'text-emerald-600')}>{signed > 0 ? '+' : ''}{signed}</span>
                  </div>
                );
              })}
            </div>
          ) : <div className="p-4"><EmptyPanel icon={FileClock} title="No recent movements" description="Stock receipts, sales, transfers and adjustments will appear here." /></div>}
        </section>
      </div>

      <button type="button" onClick={() => onNavigate('/retail/barcode')} aria-label="Open barcode scanner" className="fixed bottom-24 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-2xl shadow-blue-600/30 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:bottom-8 md:right-8">
        <ScanBarcode className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  );
});

const PricingPage = memo(function PricingPage({ snapshot, suppliers, transactions, rules, setRules, saveRules, savingRules, money, onReview, onNavigate }) {
  const [subTab, setSubTab] = useState('rules');
  const supplierContracts = suppliers.filter((supplier) => supplier.contract_end_date || supplier.contract_expiry || supplier.expiry_date);
  const pricingRows = snapshot.productRows.filter((row) => row.price > 0).sort((a, b) => a.margin - b.margin);
  const subTabs = [
    ['rules', 'Price Rules', Tag],
    ['suppliers', 'Suppliers', Truck],
    ['approvals', 'Approvals', ShieldCheck],
    ['audit', 'Audit', FileClock],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-black text-slate-950 dark:text-white">Pricing & Governance</h2><p className="text-sm text-slate-500 dark:text-slate-400">Margin protection, suppliers, approvals and audit</p></div>
        {subTab === 'rules' ? <Button onClick={saveRules} disabled={savingRules} className="h-11 rounded-xl px-5"><ShieldCheck className="mr-2 h-4 w-4" />{savingRules ? 'Saving…' : 'Save Rules'}</Button> : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {subTabs.map(([id, label, Icon]) => (
          <button key={id} type="button" aria-pressed={subTab === id} onClick={() => setSubTab(id)} className={cn('flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-bold sm:text-sm', subTab === id ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/15' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300')}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <MetricCard icon={TrendingUp} label="Avg Margin" value={`${snapshot.averageMargin.toFixed(1)}%`} tone="green" />
        <MetricCard icon={AlertTriangle} label="Price Alerts" value={snapshot.priceControlStatus.review + snapshot.priceControlStatus.blocked} tone="amber" />
        <MetricCard icon={Clock3} label="Pending" value={snapshot.priceApprovalQueue.length} tone="blue" />
      </div>

      {subTab === 'rules' ? (
        <>
          <section className={cn(PANEL_CLASS, 'p-4 sm:p-5')}>
            <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600" /><h3 className="font-black text-slate-950 dark:text-white">Smart Price Control</h3></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className={cn(SOFT_PANEL_CLASS, 'flex items-center justify-between gap-3 p-3.5')}><span><span className="block text-sm font-bold text-slate-900 dark:text-white">VAT Inclusive</span><span className="text-xs text-slate-500">Display tax in selling prices</span></span><Switch checked={Boolean(rules.price_includes_vat)} onCheckedChange={(checked) => setRules((current) => ({ ...current, price_includes_vat: checked }))} /></label>
              <label className={cn(SOFT_PANEL_CLASS, 'flex items-center justify-between gap-3 p-3.5')}><span><span className="block text-sm font-bold text-slate-900 dark:text-white">Approval Guard</span><span className="text-xs text-slate-500">Protect branch price overrides</span></span><Switch checked={Boolean(rules.branch_override_requires_approval)} onCheckedChange={(checked) => setRules((current) => ({ ...current, branch_override_requires_approval: checked }))} /></label>
              <label className={cn(SOFT_PANEL_CLASS, 'p-3.5')}><span className="mb-2 block text-sm font-bold text-slate-900 dark:text-white">Minimum Margin</span><div className="relative"><Input type="number" min="0" max="99" value={rules.minimum_margin} onChange={(event) => setRules((current) => ({ ...current, minimum_margin: Number(event.target.value) }))} className="h-10 rounded-lg pr-8" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span></div></label>
              <label className={cn(SOFT_PANEL_CLASS, 'p-3.5')}><span className="mb-2 block text-sm font-bold text-slate-900 dark:text-white">Maximum Discount</span><div className="relative"><Input type="number" min="0" max="100" value={rules.max_discount} onChange={(event) => setRules((current) => ({ ...current, max_discount: Number(event.target.value) }))} className="h-10 rounded-lg pr-8" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span></div></label>
              <label className={cn(SOFT_PANEL_CLASS, 'p-3.5')}><span className="mb-2 block text-sm font-bold text-slate-900 dark:text-white">Cost Change Review</span><div className="relative"><Input type="number" min="0" value={rules.cost_change_review_percent} onChange={(event) => setRules((current) => ({ ...current, cost_change_review_percent: Number(event.target.value) }))} className="h-10 rounded-lg pr-8" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span></div></label>
              <label className={cn(SOFT_PANEL_CLASS, 'p-3.5')}><span className="mb-2 block text-sm font-bold text-slate-900 dark:text-white">VAT Rate</span><div className="relative"><Input type="number" min="0" max="100" value={rules.vat_rate} onChange={(event) => setRules((current) => ({ ...current, vat_rate: Number(event.target.value) }))} className="h-10 rounded-lg pr-8" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span></div></label>
            </div>
          </section>

          <section className={cn(PANEL_CLASS, 'overflow-hidden')}>
            <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800"><div><h3 className="font-black text-slate-950 dark:text-white">Pricing Overview</h3><p className="text-xs text-slate-500 dark:text-slate-400">Lowest margins first</p></div><Badge variant="secondary">{pricingRows.length} priced</Badge></div>
            {pricingRows.length ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {pricingRows.slice(0, 12).map((row) => (
                  <button key={getRowKey(row)} type="button" onClick={() => onReview(row.product)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(90px,0.5fr))_auto]">
                    <div className="flex min-w-0 items-center gap-3"><ProductThumbnail row={row} /><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900 dark:text-white">{row.label}</p><p className="truncate text-xs text-slate-500">{row.product?.sku || row.product?.product_id || 'No SKU'}</p></div></div>
                    <div className="hidden sm:block"><p className="text-[10px] uppercase text-slate-400">Cost</p><p className="text-sm font-bold text-slate-700 dark:text-slate-200">{money(row.cost)}</p></div>
                    <div className="hidden sm:block"><p className="text-[10px] uppercase text-slate-400">Sell</p><p className="text-sm font-bold text-slate-700 dark:text-slate-200">{money(row.price)}</p></div>
                    <div className="text-right sm:text-left"><p className="text-[10px] uppercase text-slate-400">Margin</p><p className={cn('text-sm font-black', row.margin >= Number(rules.minimum_margin) ? 'text-emerald-600' : 'text-amber-600')}>{row.margin.toFixed(1)}%</p></div>
                    <StatusPill status={row.pricingStatus} />
                  </button>
                ))}
              </div>
            ) : <div className="p-4"><EmptyPanel icon={CircleDollarSign} title="No pricing data" description="Add purchase cost and selling price to product records." /></div>}
          </section>
        </>
      ) : null}

      {subTab === 'suppliers' ? (
        <section className={cn(PANEL_CLASS, 'overflow-hidden')}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800"><div><h3 className="font-black text-slate-950 dark:text-white">Supplier Intelligence</h3><p className="text-xs text-slate-500 dark:text-slate-400">Linked supply partners and contract visibility</p></div><Button size="sm" variant="outline" onClick={() => onNavigate('/suppliers')}>Open Suppliers</Button></div>
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3"><MetricCard icon={Truck} label="Suppliers" value={suppliers.length} tone="blue" /><MetricCard icon={FileClock} label="Contracts" value={supplierContracts.length} tone="amber" /><MetricCard icon={CheckCircle2} label="Active" value={suppliers.filter((supplier) => supplier.is_active !== false).length} tone="green" /></div>
          {suppliers.length ? <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">{suppliers.slice(0, 10).map((supplier) => <button key={supplier.id} type="button" onClick={() => onNavigate('/suppliers')} className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60"><Truck className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-900 dark:text-white">{supplier.name || supplier.supplier_name || 'Supplier'}</span><span className="block truncate text-xs text-slate-500">{supplier.contact_name || supplier.phone || 'Supply partner'}</span></span><StatusPill status={supplier.is_active === false ? 'inactive' : 'active'} /><ChevronRight className="h-4 w-4 text-slate-400" /></button>)}</div> : <div className="p-4"><EmptyPanel icon={Truck} title="No suppliers connected" description="Add suppliers and link them to master products." /></div>}
        </section>
      ) : null}

      {subTab === 'approvals' ? (
        <section className={cn(PANEL_CLASS, 'overflow-hidden')}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800"><div><h3 className="font-black text-slate-950 dark:text-white">Approval Queue</h3><p className="text-xs text-slate-500 dark:text-slate-400">Price and margin exceptions</p></div><Badge className="rounded-full bg-amber-100 text-amber-700 hover:bg-amber-100">{snapshot.priceApprovalQueue.length} pending</Badge></div>
          {snapshot.priceApprovalQueue.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{snapshot.priceApprovalQueue.map((row) => <div key={getRowKey(row)} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="flex min-w-0 items-center gap-3"><ProductThumbnail row={row} /><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900 dark:text-white">{row.label}</p><p className="text-xs text-amber-600">{row.issue}</p><p className="text-xs text-slate-500">Current {money(row.price)} · Suggested {money(row.suggestedPrice)}</p></div></div><Button size="sm" variant="outline" className="rounded-lg" onClick={() => onReview(row.product)}><Pencil className="mr-1.5 h-4 w-4" />Review</Button></div>)}</div> : <div className="p-4"><EmptyPanel icon={ShieldCheck} title="All prices are compliant" description="No margin or minimum-price exceptions need approval." /></div>}
        </section>
      ) : null}

      {subTab === 'audit' ? (
        <section className={cn(PANEL_CLASS, 'overflow-hidden')}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800"><div><h3 className="font-black text-slate-950 dark:text-white">Product Audit Trail</h3><p className="text-xs text-slate-500 dark:text-slate-400">Recent stock and product-governance events</p></div><History className="h-5 w-5 text-blue-600" /></div>
          {transactions.length ? <div className="divide-y divide-slate-100 dark:divide-slate-800">{transactions.slice(0, 20).map((item) => <div key={item.id} className="flex items-center gap-3 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"><FileClock className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{String(item.transaction_type || 'Product update').replaceAll('_', ' ')}</span><span className="block truncate text-xs text-slate-500">{item.notes || item.product_name || item.product_id || 'ERP activity'}</span></span><span className="text-xs text-slate-400">{item.created_date ? new Date(item.created_date).toLocaleDateString() : ''}</span></div>)}</div> : <div className="p-4"><EmptyPanel icon={History} title="No audit events yet" description="Inventory and pricing events will appear here." /></div>}
        </section>
      ) : null}
    </div>
  );
});

export default function ProductMasterWorkspace({
  restaurantId,
  snapshot,
  categories,
  transactions,
  suppliers,
  branches,
  selectedLocation,
  onSelectedLocationChange,
  money,
  priceRules,
  setPriceRules,
  savePriceRules,
  savingPriceRules,
  onAdd,
  onEdit,
  onDelete,
  onAdjust,
  onRefresh,
  onNavigate,
  onManageCategories,
  onManageUnits,
  onDataChanged,
}) {
  const [activePage, setActivePage] = useState('overview');
  const [catalogImportSignal, setCatalogImportSignal] = useState(0);

  const openCatalogImport = () => {
    setActivePage('catalog');
    setCatalogImportSignal((current) => current + 1);
  };

  return (
    <div className="min-w-0 space-y-4 pb-6">
      <header className={cn(PANEL_CLASS, 'overflow-hidden')}>
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.13),transparent_42%)] p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-600/25">
                <PackageCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-2xl">Master Product Management</h1>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">Universal product, service, inventory and pricing control</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={onRefresh} aria-label="Refresh product data"><RefreshCw className="h-4 w-4" /></Button>
              <Button type="button" className="h-11 flex-1 rounded-xl px-5 shadow-lg shadow-blue-600/15 lg:flex-none" onClick={onAdd}><Plus className="mr-2 h-4 w-4" />New Product</Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"><Building2 className="h-4 w-4 text-blue-600" /><span className="truncate">All Business Types</span></div>
            <Select value={selectedLocation} onValueChange={onSelectedLocationChange}>
              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white px-3 text-sm font-semibold shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex min-w-0 items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-blue-600" /><SelectValue placeholder="All Locations" /></div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {branches.map((branch) => {
                  const value = String(branch.id || branch.key || branch.branch_key || '');
                  return value ? <SelectItem key={value} value={value}>{branch.name || branch.label || value}</SelectItem> : null;
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        <nav className="grid grid-cols-2 border-t border-slate-100 sm:grid-cols-4 dark:border-slate-800" aria-label="Master product pages">
          {MAIN_PAGES.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-current={activePage === id ? 'page' : undefined} onClick={() => setActivePage(id)} className={cn('relative flex min-h-14 items-center justify-center gap-2 border-b-2 px-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500', activePage === id ? 'border-blue-600 bg-blue-50/70 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white')}>
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </button>
          ))}
        </nav>
      </header>

      {activePage === 'overview' ? <OverviewPage snapshot={snapshot} money={money} onAdd={onAdd} onImport={openCatalogImport} onNavigate={onNavigate} onChangePage={setActivePage} /> : null}
      {activePage === 'catalog' ? <EnterpriseProductCatalog restaurantId={restaurantId} branches={branches} selectedLocation={selectedLocation} categories={categories} money={money} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} onNavigate={onNavigate} onManageCategories={onManageCategories} onManageUnits={onManageUnits} onDataChanged={onDataChanged} openImportSignal={catalogImportSignal} /> : null}
      {activePage === 'inventory' ? <InventoryPage snapshot={snapshot} transactions={transactions} branches={branches} selectedLocation={selectedLocation} money={money} onAdjust={onAdjust} onNavigate={onNavigate} /> : null}
      {activePage === 'pricing' ? <PricingPage snapshot={snapshot} suppliers={suppliers} transactions={transactions} rules={priceRules} setRules={setPriceRules} saveRules={savePriceRules} savingRules={savingPriceRules} money={money} onReview={onEdit} onNavigate={onNavigate} /> : null}
    </div>
  );
}
