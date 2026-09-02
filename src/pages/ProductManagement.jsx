import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Package, Ruler } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import ProductMasterWorkspace from '@/components/products/ProductMasterWorkspace';
import ProductMasterForm from '@/components/products/ProductMasterForm';
import ProductUnitManager from '@/components/products/ProductUnitManager';
import InventoryTransactionForm from '@/components/products/InventoryTransactionForm';
import EnterpriseCategoryManager from '@/components/categories/CategoryManager';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildProductControlSnapshot, productIdentity } from '@/lib/productControlCenter';
import useProductPriceRules from '@/hooks/useProductPriceRules';

const PRODUCT_QUERY_LIMIT = 2_000;
const CSV_FIELDS = ['name', 'sku', 'barcode', 'category', 'unit', 'purchase_cost', 'selling_price', 'current_stock', 'status'];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.toLowerCase().trim().replaceAll(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function csvCell(value) {
  const stringValue = String(value ?? '');
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function createCsv(products) {
  const lines = [CSV_FIELDS.join(',')];
  products.forEach((product) => {
    lines.push(CSV_FIELDS.map((field) => csvCell(
      field === 'selling_price' ? (product.selling_price ?? product.default_price ?? 0)
        : field === 'purchase_cost' ? (product.purchase_cost ?? product.default_cost ?? 0)
          : product[field] ?? '',
    )).join(','));
  });
  return lines.join('\n');
}

function downloadCsv(contents, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function matchesLocation(row, branch) {
  if (!branch) return true;
  const branchValues = [branch.id, branch.key, branch.branch_key, branch.name, branch.label].filter(Boolean).map(String);
  return branchValues.includes(String(row?.branch_id || '')) || branchValues.includes(String(row?.branch || ''));
}

function ProductDialog({ open, onOpenChange, title, children }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-0 p-0 [&>button]:hidden sm:left-1/2 sm:top-1/2 sm:h-[min(94dvh,940px)] sm:max-h-[94dvh] sm:w-[min(96vw,1040px)] sm:max-w-[1040px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
        <DialogHeader className="sr-only"><DialogTitle>{title}</DialogTitle></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export default function ProductManagement() {
  const { activeRestaurant, branches = [] } = useTenant();
  const { user } = useAuth();
  const { formatMoney } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const restaurantId = activeRestaurant?.id || null;

  const [selectedLocation, setSelectedLocation] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showUnits, setShowUnits] = useState(false);
  const [importing, setImporting] = useState(false);

  const productsQuery = useQuery({
    queryKey: ['products', restaurantId],
    queryFn: () => base44.entities.Product.filter({ restaurant_id: restaurantId }, '-created_date', PRODUCT_QUERY_LIMIT),
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
  });
  const categoriesQuery = useQuery({
    queryKey: ['product_categories', restaurantId],
    queryFn: () => base44.entities.ProductCategory.filter({ restaurant_id: restaurantId }, 'sort_order', 500),
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });
  const inventoryQuery = useQuery({
    queryKey: ['inventory', restaurantId],
    queryFn: () => base44.entities.Inventory.filter({ restaurant_id: restaurantId }, '-created_date', 5_000),
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
  });
  const transactionQuery = useQuery({
    queryKey: ['inventory_transactions', restaurantId],
    queryFn: () => base44.entities.InventoryTransaction.filter({ restaurant_id: restaurantId }, '-created_date', 500),
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
  });
  const analyticsQuery = useQuery({
    queryKey: ['product_analytics', restaurantId],
    queryFn: () => base44.entities.ProductAnalytics.filter({ restaurant_id: restaurantId }, '-period_date', 2_000),
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', restaurantId],
    queryFn: () => base44.entities.Supplier.filter({ restaurant_id: restaurantId }, 'name', 1_000),
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });
  const priceHistoryQuery = useQuery({
    queryKey: ['product_price_history', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_price_history')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(5_000);
      if (error) {
        console.warn('[ProductManagement] price history unavailable:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
  });

  const products = productsQuery.data || [];
  const categories = categoriesQuery.data || [];
  const inventory = inventoryQuery.data || [];
  const transactions = transactionQuery.data || [];
  const analytics = analyticsQuery.data || [];
  const suppliers = suppliersQuery.data || [];
  const priceHistory = priceHistoryQuery.data || [];
  const selectedBranch = selectedLocation === 'all'
    ? null
    : branches.find((branch) => String(branch.id || branch.key || branch.branch_key) === selectedLocation) || null;
  const scopedInventory = selectedBranch ? inventory.filter((row) => matchesLocation(row, selectedBranch)) : inventory;
  const scopedAnalytics = selectedBranch ? analytics.filter((row) => matchesLocation(row, selectedBranch)) : analytics;
  const scopedPriceHistory = selectedBranch ? priceHistory.filter((row) => matchesLocation(row, selectedBranch)) : priceHistory;
  const scopedBranches = selectedBranch ? [selectedBranch] : branches;

  const priceControl = useProductPriceRules();
  const snapshot = useMemo(() => buildProductControlSnapshot({
    products,
    inventory: scopedInventory,
    branches: scopedBranches,
    analytics: scopedAnalytics,
    priceHistory: scopedPriceHistory,
    priceRules: priceControl.rules,
  }), [products, scopedInventory, scopedBranches, scopedAnalytics, scopedPriceHistory, priceControl.rules]);

  const invalidateProductData = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['products'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory_transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['product_analytics'] }),
  ]);

  const syncInventoryRows = async ({ product, rows, enabled }) => {
    if (!enabled || !product?.product_id || !Array.isArray(rows) || !rows.length) return [];
    const existingRows = await base44.entities.Inventory.filter({ restaurant_id: restaurantId, product_id: product.product_id }, '-created_date', 1_000);
    const today = new Date().toISOString().slice(0, 10);
    const results = await Promise.allSettled(rows.filter((row) => row.branch).map((row) => {
      const existing = existingRows.find((item) => item.id === row.id
        || (row.branch_id && item.branch_id === row.branch_id)
        || item.branch === row.branch);
      const payload = {
        restaurant_id: restaurantId,
        branch_id: row.branch_id || null,
        branch: row.branch,
        product_id: product.product_id,
        product_name: product.name,
        unit: product.unit || row.unit || '',
        opening_stock: Math.max(0, Number(row.opening_stock) || 0),
        low_stock_threshold: Math.max(0, Number(row.reorder_point) || 0),
        date: existing?.date || today,
      };
      return existing ? base44.entities.Inventory.update(existing.id, payload) : base44.entities.Inventory.create(payload);
    }));
    return results.filter((result) => result.status === 'rejected').map((result) => result.reason);
  };

  const createProduct = useMutation({
    mutationFn: async (data) => {
      const { _inventoryRows, _inventoryEnabled, ...productData } = data;
      const product = await base44.entities.Product.create({ ...productData, restaurant_id: restaurantId });
      const inventoryErrors = await syncInventoryRows({ product, rows: _inventoryRows, enabled: _inventoryEnabled });
      return { product, inventoryErrors };
    },
    onSuccess: async ({ inventoryErrors }) => {
      await invalidateProductData();
      setShowCreate(false);
      if (inventoryErrors.length) toast.warning('Product saved, but some opening-stock rows could not be synchronized.');
      else toast.success('Master product created.');
    },
    onError: (error) => toast.error(error?.message || 'Unable to create the product.'),
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, data }) => {
      const { _inventoryRows, _inventoryEnabled, ...productData } = data;
      const product = await base44.entities.Product.update(id, productData);
      const inventoryErrors = await syncInventoryRows({ product, rows: _inventoryRows, enabled: _inventoryEnabled });
      return { product, inventoryErrors };
    },
    onSuccess: async ({ inventoryErrors }) => {
      await invalidateProductData();
      setEditing(null);
      if (inventoryErrors.length) toast.warning('Product updated, but some branch stock rows could not be synchronized.');
      else toast.success('Master product updated.');
    },
    onError: (error) => toast.error(error?.message || 'Unable to update the product.'),
  });

  const deleteProduct = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: async () => {
      await invalidateProductData();
      setDeleting(null);
      toast.success('Product deleted.');
    },
    onError: (error) => toast.error(error?.message || 'Unable to delete this product. It may have linked records.'),
  });

  const archiveProducts = async (rows) => {
    const results = await Promise.allSettled(rows.map((product) => base44.entities.Product.update(product.id, { status: 'discontinued', is_active: false })));
    await invalidateProductData();
    const failures = results.filter((result) => result.status === 'rejected').length;
    if (failures) toast.warning(`${rows.length - failures} products archived; ${failures} failed.`);
    else toast.success(`${rows.length} products archived.`);
  };

  const handleProductSave = (data) => editing
    ? updateProduct.mutateAsync({ id: editing.id, data })
    : createProduct.mutateAsync(data);

  const handleAdjust = (product) => {
    setAdjustTarget(product || null);
    setShowStockDialog(true);
  };

  const handleExport = () => {
    downloadCsv(createCsv(products), `biz-control-products-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`${products.length} product records exported.`);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !restaurantId) return;
    setImporting(true);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error('The CSV file does not contain product rows.');
      if (rows.length > 500) throw new Error('Import a maximum of 500 products at a time.');
      const existingCodes = new Set(products.flatMap((product) => [product.sku, product.product_id, product.barcode]).filter(Boolean).map((value) => String(value).toLowerCase()));
      const timestamp = Date.now();
      const payloads = rows.flatMap((row, index) => {
        const name = row.name || row.product_name;
        const code = row.sku || row.product_id || row.barcode;
        if (!name || (code && existingCodes.has(String(code).toLowerCase()))) return [];
        if (code) existingCodes.add(String(code).toLowerCase());
        const productId = row.product_id || row.sku || `PRD-${timestamp}-${String(index + 1).padStart(4, '0')}`;
        return [{
          restaurant_id: restaurantId,
          name,
          product_id: productId,
          sku: row.sku || productId,
          barcode: row.barcode || null,
          category: row.category || null,
          unit: row.unit || null,
          purchase_cost: Math.max(0, Number(row.purchase_cost || row.default_cost) || 0),
          selling_price: Math.max(0, Number(row.selling_price || row.default_price) || 0),
          default_cost: Math.max(0, Number(row.purchase_cost || row.default_cost) || 0),
          default_price: Math.max(0, Number(row.selling_price || row.default_price) || 0),
          current_stock: Math.max(0, Number(row.current_stock) || 0),
          status: row.status || 'active',
          is_active: (row.status || 'active') === 'active',
          created_by: user?.email || null,
        }];
      });
      if (!payloads.length) throw new Error('All CSV rows are empty or duplicate existing product codes.');
      const results = await Promise.allSettled(payloads.map((payload) => base44.entities.Product.create(payload)));
      await invalidateProductData();
      const succeeded = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      if (failed) toast.warning(`${succeeded} products imported; ${failed} rows failed.`);
      else toast.success(`${succeeded} products imported.`);
    } catch (error) {
      toast.error(error?.message || 'Unable to import products.');
    } finally {
      setImporting(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([
      productsQuery.refetch(), categoriesQuery.refetch(), inventoryQuery.refetch(),
      transactionQuery.refetch(), analyticsQuery.refetch(), suppliersQuery.refetch(),
      priceHistoryQuery.refetch(),
    ]);
    toast.success('Product control center refreshed.');
  };

  const selectedStockRow = adjustTarget
    ? snapshot.productRows.find((row) => productIdentity(row.product) === productIdentity(adjustTarget))
    : null;
  const stockProduct = selectedStockRow ? { ...selectedStockRow.product, current_stock: selectedStockRow.quantity } : adjustTarget;

  if (!restaurantId) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
        <Package className="mb-3 h-10 w-10 text-blue-600" />
        <h1 className="text-xl font-black">Select a business</h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose an organization before opening Master Product Management.</p>
      </div>
    );
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} aria-label="Import product CSV" />
      <ProductMasterWorkspace
        snapshot={snapshot}
        productsLoading={productsQuery.isLoading}
        categories={categories}
        transactions={transactions}
        suppliers={suppliers}
        branches={branches}
        selectedLocation={selectedLocation}
        onSelectedLocationChange={setSelectedLocation}
        money={(value) => formatMoney(value, { maximumFractionDigits: 2 })}
        priceRules={priceControl.rules}
        setPriceRules={priceControl.setRules}
        savePriceRules={async () => {
          try {
            await priceControl.saveRules();
            toast.success('Product pricing rules saved.');
          } catch (error) {
            toast.error(error?.message || 'Unable to save pricing rules.');
          }
        }}
        savingPriceRules={priceControl.isSaving}
        onAdd={() => { setEditing(null); setShowCreate(true); }}
        onEdit={(product) => { setShowCreate(false); setEditing(product); }}
        onDelete={setDeleting}
        onAdjust={handleAdjust}
        onArchive={archiveProducts}
        onImport={() => !importing && fileInputRef.current?.click()}
        onExport={handleExport}
        onRefresh={refreshAll}
        onNavigate={navigate}
        onManageCategories={() => setShowCategories(true)}
        onManageUnits={() => setShowUnits(true)}
      />

      <ProductDialog open={showCreate} onOpenChange={setShowCreate} title="Create master product">
        <ProductMasterForm onSubmit={handleProductSave} onCancel={() => setShowCreate(false)} />
      </ProductDialog>

      <ProductDialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }} title="Edit master product">
        {editing ? <ProductMasterForm initial={editing} onSubmit={handleProductSave} onCancel={() => setEditing(null)} /> : null}
      </ProductDialog>

      <Dialog open={showStockDialog} onOpenChange={(open) => { setShowStockDialog(open); if (!open) setAdjustTarget(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader><DialogTitle>Inventory Adjustment</DialogTitle></DialogHeader>
          {!stockProduct ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold">Select a tracked product</p>
                <Select onValueChange={(value) => setAdjustTarget(snapshot.productRows.find((row) => productIdentity(row.product) === value)?.product || null)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Choose product" /></SelectTrigger>
                  <SelectContent>{snapshot.productRows.filter((row) => row.tracksInventory).map((row) => <SelectItem key={productIdentity(row.product)} value={productIdentity(row.product)}>{row.label} · {row.quantity} {row.product?.unit || ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setShowStockDialog(false)}>Cancel</Button>
            </div>
          ) : (
            <InventoryTransactionForm product={stockProduct} onSuccess={async () => { await invalidateProductData(); setShowStockDialog(false); setAdjustTarget(null); }} onCancel={() => { setShowStockDialog(false); setAdjustTarget(null); }} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCategories} onOpenChange={setShowCategories}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-3xl">
          <DialogHeader><DialogTitle>Product Categories</DialogTitle></DialogHeader>
          <EnterpriseCategoryManager />
        </DialogContent>
      </Dialog>

      <Dialog open={showUnits} onOpenChange={setShowUnits}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Ruler className="h-5 w-5 text-blue-600" />Product Units</DialogTitle></DialogHeader>
          <ProductUnitManager />
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>“{deleting?.name || 'This product'}” will be permanently deleted. Products with linked ERP records may be protected; archive them instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => deleting?.id && deleteProduct.mutate(deleting.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
