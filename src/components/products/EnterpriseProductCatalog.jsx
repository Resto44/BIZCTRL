import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Barcode,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Layers3,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  ScanBarcode,
  Search,
  Settings2,
  Store,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  EMPTY_COUNTS,
  getProductCatalogCounts,
  searchMasterProducts,
  setBranchProductAssortment,
} from '@/lib/productCatalogRepository';
import ProductBulkImportDialog from '@/components/products/ProductBulkImportDialog';

const PANEL = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_32px_rgba(15,23,42,0.055)] dark:border-slate-800 dark:bg-slate-950';

function resolveBranch(branches, selectedLocation) {
  if (!selectedLocation || selectedLocation === 'all') return null;
  return branches.find((branch) => [branch.id, branch.key, branch.branch_key, branch.name]
    .filter(Boolean).some((value) => String(value) === String(selectedLocation))) || null;
}

function CatalogMetric({ icon: Icon, label, value, helper, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',
  };
  return (
    <div className={cn(PANEL, 'min-w-0 p-3.5')}>
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}><Icon className="h-5 w-5" /></span>
        <span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-500">{label}</span><strong className="mt-0.5 block text-xl font-black tracking-tight text-slate-950 dark:text-white">{Number(value || 0).toLocaleString()}</strong><span className="block truncate text-[11px] text-slate-400">{helper}</span></span>
      </div>
    </div>
  );
}

function SelectionButton({ checked, label, onClick }) {
  return (
    <button type="button" aria-label={label} aria-pressed={checked} onClick={onClick} className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500', checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent dark:border-slate-700 dark:bg-slate-950')}>
      <Check className="h-4 w-4" />
    </button>
  );
}

function ProductIcon({ product }) {
  if (product.image_url) return <img src={product.image_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 object-cover dark:border-slate-800" />;
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Package className="h-5 w-5" /></span>;
}

function CatalogError({ message, onRetry }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-red-200 bg-red-50/50 p-6 text-center dark:border-red-900 dark:bg-red-950/20">
      <AlertTriangle className="h-9 w-9 text-red-500" />
      <h3 className="mt-3 font-black text-red-950 dark:text-red-100">Catalog service is unavailable</h3>
      <p className="mt-1 max-w-lg text-sm text-red-700 dark:text-red-300">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
    </div>
  );
}

const EnterpriseProductCatalog = memo(function EnterpriseProductCatalog({
  restaurantId,
  branches,
  selectedLocation,
  categories,
  money,
  onAdd,
  onEdit,
  onDelete,
  onNavigate,
  onManageCategories,
  onManageUnits,
  onDataChanged,
  openImportSignal = 0,
}) {
  const queryClient = useQueryClient();
  const selectedBranch = useMemo(() => resolveBranch(branches, selectedLocation), [branches, selectedLocation]);
  const branchId = selectedBranch?.id || null;
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [category, setCategory] = useState('all');
  const [scope, setScope] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('name_asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState(() => new Set());
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [branchId, category, deferredSearch, pageSize, scope, sort, status]);

  useEffect(() => {
    if (!selectedBranch && scope !== 'all') setScope('all');
  }, [scope, selectedBranch]);

  useEffect(() => {
    if (openImportSignal > 0) setShowImport(true);
  }, [openImportSignal]);

  const catalogQuery = useQuery({
    queryKey: ['erp-master-catalog', restaurantId, branchId, deferredSearch, category, scope, status, sort, page, pageSize],
    queryFn: () => searchMasterProducts({ restaurantId, branchId, query: deferredSearch, category, scope, status, sort, page, pageSize }),
    enabled: Boolean(restaurantId),
    staleTime: 20_000,
    placeholderData: (previous) => previous,
  });
  const countsQuery = useQuery({
    queryKey: ['erp-master-catalog-counts', restaurantId, branchId],
    queryFn: () => getProductCatalogCounts({ restaurantId, branchId }),
    enabled: Boolean(restaurantId),
    staleTime: 20_000,
  });

  const rows = catalogQuery.data?.rows || [];
  const total = Number(catalogQuery.data?.total || 0);
  const counts = countsQuery.data || EMPTY_COUNTS;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allPageSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['erp-master-catalog'] }),
      queryClient.invalidateQueries({ queryKey: ['erp-master-catalog-counts'] }),
    ]);
    await onDataChanged?.();
  };

  const assortmentMutation = useMutation({
    mutationFn: ({ productIds, active }) => setBranchProductAssortment({ restaurantId, branchId, productIds, active }),
    onSuccess: async (changed, variables) => {
      setSelected(new Set());
      await refresh();
      toast.success(`${changed.toLocaleString()} products ${variables.active ? 'added to' : 'removed from'} ${selectedBranch?.name || 'the branch'}.`);
    },
    onError: (error) => toast.error(error?.message || 'Unable to update branch products.'),
  });

  const toggleSelected = (id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allPageSelected) rows.forEach((row) => next.delete(row.id));
      else rows.forEach((row) => next.add(row.id));
      return next;
    });
  };

  const editProduct = (row) => onEdit(row.product_data || row);
  const deleteProduct = (row) => onDelete(row.product_data || row);
  const effectivePrice = (row) => row.branch_selling_price ?? row.selling_price ?? 0;
  const effectiveCost = (row) => row.branch_purchase_cost ?? row.purchase_cost ?? 0;
  const selectedIds = [...selected];

  return (
    <div className="min-w-0 space-y-4">
      <section className="overflow-hidden rounded-2xl border border-blue-200 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.14),transparent_46%)] p-4 dark:border-blue-900 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2"><Badge className="rounded-full bg-blue-600 hover:bg-blue-600"><Database className="mr-1 h-3.5 w-3.5" />100K+ Ready</Badge><Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />No product duplication</Badge></div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Organization Master Catalog</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Import once, govern centrally, then activate only the products each branch needs.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" className="h-11 rounded-xl bg-white dark:bg-slate-950" onClick={() => setShowImport(true)}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel Import</Button>
            <Button className="h-11 rounded-xl shadow-lg shadow-blue-600/20" onClick={onAdd}><Plus className="mr-2 h-4 w-4" />New Product</Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CatalogMetric icon={Database} label="Master Catalog" value={counts.master_total} helper="One source of truth" />
        <CatalogMetric icon={CheckCircle2} label="Active Masters" value={counts.active_total} helper="Organization-wide" tone="green" />
        <CatalogMetric icon={Store} label={selectedBranch ? 'In This Branch' : 'Used by Branches'} value={counts.branch_assigned} helper={selectedBranch?.name || 'Unique products'} tone="violet" />
        <CatalogMetric icon={Package} label={selectedBranch ? 'Available to Add' : 'Unassigned'} value={counts.branch_unassigned} helper={selectedBranch ? 'Not yet activated' : 'Not used by a branch'} tone="amber" />
      </div>

      <section className={cn(PANEL, 'p-3 sm:p-4')} aria-label="Master catalog controls">
        <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_190px_170px_150px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 rounded-xl pl-10 pr-10" placeholder="Search product, SKU, barcode or brand" />
            {search ? <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button> : null}
          </div>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="All categories" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name || item.name_en || item.name_ar || 'Category'}</SelectItem>)}</SelectContent></Select>
          <Select value={sort} onValueChange={setSort}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name_asc">Name A–Z</SelectItem><SelectItem value="name_desc">Name Z–A</SelectItem><SelectItem value="newest">Newest first</SelectItem><SelectItem value="price_desc">Highest price</SelectItem><SelectItem value="price_asc">Lowest price</SelectItem></SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ['all', 'All master', Database],
            ['in_branch', 'In branch', Store],
            ['not_in_branch', 'Available', Plus],
          ].map(([value, label, Icon]) => <button key={value} type="button" disabled={!selectedBranch && value !== 'all'} aria-pressed={scope === value} onClick={() => setScope(value)} className={cn('flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-bold transition sm:text-sm', scope === value ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/15' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300', !selectedBranch && value !== 'all' && 'cursor-not-allowed opacity-45')}><Icon className="h-4 w-4" />{label}</button>)}
        </div>
        {!selectedBranch ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Select a branch in the header to view its assortment and add products.</p> : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <SelectionButton checked={allPageSelected} label={allPageSelected ? 'Deselect this page' : 'Select this page'} onClick={togglePage} />
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{total.toLocaleString()} matching products</span>
        <span className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="rounded-lg" onClick={onManageCategories}><Tag className="mr-1.5 h-4 w-4" />Categories</Button>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={onManageUnits}><Settings2 className="mr-1.5 h-4 w-4" />Units</Button>
          <Button variant="outline" size="sm" className="hidden rounded-lg sm:inline-flex" onClick={() => onNavigate('/retail/barcode')}><ScanBarcode className="mr-1.5 h-4 w-4" />Scanner</Button>
        </span>
      </div>

      {catalogQuery.isError ? <CatalogError message={catalogQuery.error?.message} onRetry={() => catalogQuery.refetch()} /> : catalogQuery.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />)}</div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40"><Package className="h-9 w-9 text-blue-600" /><h3 className="mt-3 font-black">No matching master products</h3><p className="mt-1 text-sm text-slate-500">Change the filters, import an Excel catalog, or create a product.</p><div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => setShowImport(true)}><FileSpreadsheet className="mr-2 h-4 w-4" />Import Excel</Button><Button onClick={onAdd}><Plus className="mr-2 h-4 w-4" />Create Product</Button></div></div>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {rows.map((row) => {
              const price = effectivePrice(row);
              const cost = effectiveCost(row);
              const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
              return <article key={row.id} className={cn(PANEL, 'p-4', selected.has(row.id) && 'border-blue-500 ring-2 ring-blue-500/10')}><div className="flex items-start gap-3"><SelectionButton checked={selected.has(row.id)} label={`Select ${row.name}`} onClick={() => toggleSelected(row.id)} /><ProductIcon product={row} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><span className="min-w-0"><h3 className="truncate font-black text-slate-950 dark:text-white">{row.name}</h3><p className="truncate font-mono text-xs text-slate-500">{row.sku || row.barcode || 'No code'}</p></span>{row.assigned_to_branch ? <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">In branch</Badge> : <Badge variant="outline" className="rounded-full">Master</Badge>}</div><div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="secondary" className="rounded-full">{row.category || 'Uncategorized'}</Badge>{row.brand ? <Badge variant="outline" className="rounded-full">{row.brand}</Badge> : null}</div></div></div><div className="mt-4 grid grid-cols-3 divide-x divide-slate-200 rounded-xl bg-slate-50 p-3 dark:divide-slate-800 dark:bg-slate-900"><span className="px-2 first:pl-0"><small className="block text-[10px] uppercase text-slate-400">Price</small><strong className="mt-1 block truncate text-sm">{money(price)}</strong></span><span className="px-2"><small className="block text-[10px] uppercase text-slate-400">Cost</small><strong className="mt-1 block truncate text-sm">{money(cost)}</strong></span><span className="px-2 pr-0"><small className="block text-[10px] uppercase text-slate-400">Margin</small><strong className={cn('mt-1 block text-sm', margin >= 25 ? 'text-emerald-600' : 'text-amber-600')}>{margin.toFixed(1)}%</strong></span></div><div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"><Button variant="ghost" size="sm" className="flex-1" onClick={() => editProduct(row)}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>{selectedBranch && !row.assigned_to_branch ? <Button size="sm" className="flex-1" disabled={assortmentMutation.isPending} onClick={() => assortmentMutation.mutate({ productIds: [row.id], active: true })}><Plus className="mr-1.5 h-4 w-4" />Add to branch</Button> : <Button variant="ghost" size="sm" className="flex-1" onClick={() => onNavigate(`/retail/variants?product=${encodeURIComponent(row.id)}`)}><Layers3 className="mr-1.5 h-4 w-4" />Variants</Button>}</div></article>;
            })}
          </div>

          <section className={cn(PANEL, 'hidden overflow-hidden md:block')}>
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900"><tr><th className="w-12 px-4 py-3"><SelectionButton checked={allPageSelected} label="Select this page" onClick={togglePage} /></th><th className="px-4 py-3">Master product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Branch use</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Price</th><th className="w-40 px-4 py-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((row) => <tr key={row.id} className={cn('transition hover:bg-slate-50/80 dark:hover:bg-slate-900/60', selected.has(row.id) && 'bg-blue-50/60 dark:bg-blue-950/20')}><td className="px-4 py-3"><SelectionButton checked={selected.has(row.id)} label={`Select ${row.name}`} onClick={() => toggleSelected(row.id)} /></td><td className="px-4 py-3"><div className="flex items-center gap-3"><ProductIcon product={row} /><span className="min-w-0"><strong className="block max-w-72 truncate text-slate-950 dark:text-white">{row.name}</strong><span className="mt-0.5 flex items-center gap-1 font-mono text-xs text-slate-500"><Barcode className="h-3.5 w-3.5" />{row.sku || row.barcode || 'No code'}</span></span></div></td><td className="px-4 py-3"><span className="block font-semibold">{row.category || 'Uncategorized'}</span><span className="text-xs text-slate-500">{row.brand || row.unit || '—'}</span></td><td className="px-4 py-3">{row.assigned_to_branch ? <span><Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Active</Badge><small className="ml-2 text-slate-500">{row.branch_count} branch{Number(row.branch_count) === 1 ? '' : 'es'}</small></span> : <Badge variant="outline" className="rounded-full">Not assigned</Badge>}</td><td className="px-4 py-3 text-right tabular-nums">{money(effectiveCost(row))}</td><td className="px-4 py-3 text-right font-black tabular-nums">{money(effectivePrice(row))}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => editProduct(row)} aria-label={`Edit ${row.name}`}><Pencil className="h-4 w-4" /></Button>{selectedBranch && !row.assigned_to_branch ? <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-600" disabled={assortmentMutation.isPending} onClick={() => assortmentMutation.mutate({ productIds: [row.id], active: true })} aria-label={`Add ${row.name} to branch`}><Plus className="h-4 w-4" /></Button> : <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onNavigate(`/retail/variants?product=${encodeURIComponent(row.id)}`)} aria-label={`Open variants for ${row.name}`}><Layers3 className="h-4 w-4" /></Button>}<Button variant="ghost" size="icon" className="h-9 w-9 text-red-600" onClick={() => deleteProduct(row)} aria-label={`Delete ${row.name}`}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!catalogQuery.isError && total > 0 ? <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center"><div className="flex items-center gap-2 text-sm text-slate-500"><span>Rows</span><Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}><SelectTrigger className="h-9 w-20 rounded-lg"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent></Select><span>· {(Math.min((page - 1) * pageSize + 1, total)).toLocaleString()}–{Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()}</span></div><div className="ml-auto flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || catalogQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><span className="min-w-20 text-center text-sm font-bold">{page} / {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages || catalogQuery.isFetching} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div> : null}

      {selectedIds.length ? <div className="sticky bottom-20 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-blue-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-blue-900 dark:bg-slate-950/95 md:bottom-4"><span className="mr-auto rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white">{selectedIds.length.toLocaleString()} selected</span>{!selectedBranch ? <span className="text-xs font-semibold text-amber-700">Select a branch to activate products</span> : <><Button size="sm" disabled={assortmentMutation.isPending} onClick={() => assortmentMutation.mutate({ productIds: selectedIds, active: true })}>{assortmentMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Building2 className="mr-1.5 h-4 w-4" />}Add to {selectedBranch.name || 'Branch'}</Button><Button variant="outline" size="sm" disabled={assortmentMutation.isPending} onClick={() => assortmentMutation.mutate({ productIds: selectedIds, active: false })}>Remove from branch</Button></>}<Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button></div> : null}

      <ProductBulkImportDialog open={showImport} onOpenChange={setShowImport} restaurantId={restaurantId} selectedBranch={selectedBranch} onImported={refresh} />
    </div>
  );
});

export default EnterpriseProductCatalog;
