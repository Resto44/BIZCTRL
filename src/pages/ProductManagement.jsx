import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Package, Ruler } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { ROLES, useRole } from '@/lib/RoleContext';
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
import { getProductCatalogCounts, setBranchProductAssortment } from '@/lib/productCatalogRepository';
import { isSupermarketProductPortal } from '@/lib/productImportAccess';

const PRODUCT_QUERY_LIMIT = 2_000;

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
  const { role } = useRole();
  const { formatMoney } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const restaurantId = activeRestaurant?.id || null;
  const canImportProductSpreadsheet = isSupermarketProductPortal(activeRestaurant);
  const canDeleteProducts = canImportProductSpreadsheet && role === ROLES.OWNER;

  const [selectedLocation, setSelectedLocation] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showUnits, setShowUnits] = useState(false);
  const selectedBranch = selectedLocation === 'all'
    ? null
    : branches.find((branch) => String(branch.id || branch.key || branch.branch_key) === selectedLocation) || null;

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
  const catalogCountsQuery = useQuery({
    queryKey: ['erp-master-catalog-counts', restaurantId, selectedBranch?.id || null],
    queryFn: () => getProductCatalogCounts({ restaurantId, branchId: selectedBranch?.id || null }),
    enabled: Boolean(restaurantId),
    staleTime: 20_000,
  });

  const products = productsQuery.data || [];
  const categories = categoriesQuery.data || [];
  const inventory = inventoryQuery.data || [];
  const transactions = transactionQuery.data || [];
  const analytics = analyticsQuery.data || [];
  const suppliers = suppliersQuery.data || [];
  const priceHistory = priceHistoryQuery.data || [];
  const scopedInventory = selectedBranch ? inventory.filter((row) => matchesLocation(row, selectedBranch)) : inventory;
  const scopedAnalytics = selectedBranch ? analytics.filter((row) => matchesLocation(row, selectedBranch)) : analytics;
  const scopedPriceHistory = selectedBranch ? priceHistory.filter((row) => matchesLocation(row, selectedBranch)) : priceHistory;
  const scopedBranches = selectedBranch ? [selectedBranch] : branches;

  const priceControl = useProductPriceRules();
  const calculatedSnapshot = useMemo(() => buildProductControlSnapshot({
    products,
    inventory: scopedInventory,
    branches: scopedBranches,
    analytics: scopedAnalytics,
    priceHistory: scopedPriceHistory,
    priceRules: priceControl.rules,
  }), [products, scopedInventory, scopedBranches, scopedAnalytics, scopedPriceHistory, priceControl.rules]);
  const snapshot = useMemo(() => {
    const counts = catalogCountsQuery.data;
    if (!counts) return calculatedSnapshot;
    const lowStock = Number(counts.low_stock || 0);
    const outOfStock = Number(counts.out_of_stock || 0);
    const activeProducts = Number(counts.active_total || 0);
    return {
      ...calculatedSnapshot,
      totalProducts: Number(counts.master_total || 0),
      activeProducts,
      lowStock,
      outOfStock,
      trackedProducts: Math.max(activeProducts, calculatedSnapshot.trackedProducts || 0),
      healthy: Math.max(0, activeProducts - lowStock - outOfStock),
      inventoryValue: Number(counts.inventory_value || 0),
    };
  }, [calculatedSnapshot, catalogCountsQuery.data]);

  const invalidateProductData = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['products'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    queryClient.invalidateQueries({ queryKey: ['inventory_transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['product_analytics'] }),
    queryClient.invalidateQueries({ queryKey: ['erp-master-catalog'] }),
    queryClient.invalidateQueries({ queryKey: ['erp-master-catalog-counts'] }),
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
      let assortmentError = null;
      if (selectedBranch?.id) {
        try {
          await setBranchProductAssortment({ restaurantId, branchId: selectedBranch.id, productIds: [product.id], active: true });
        } catch (error) {
          assortmentError = error;
        }
      }
      return { product, inventoryErrors, assortmentError };
    },
    onSuccess: async ({ inventoryErrors, assortmentError }) => {
      await invalidateProductData();
      setShowCreate(false);
      if (inventoryErrors.length || assortmentError) toast.warning('Product saved, but one or more branch settings could not be synchronized.');
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

  const handleProductSave = (data) => editing
    ? updateProduct.mutateAsync({ id: editing.id, data })
    : createProduct.mutateAsync(data);

  const handleAdjust = (product) => {
    setAdjustTarget(product || null);
    setShowStockDialog(true);
  };

  const refreshAll = async () => {
    await Promise.all([
      productsQuery.refetch(), categoriesQuery.refetch(), inventoryQuery.refetch(),
      transactionQuery.refetch(), analyticsQuery.refetch(), suppliersQuery.refetch(),
      priceHistoryQuery.refetch(), catalogCountsQuery.refetch(),
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
      <ProductMasterWorkspace
        restaurantId={restaurantId}
        snapshot={snapshot}
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
        onDelete={canDeleteProducts ? setDeleting : null}
        onAdjust={handleAdjust}
        onRefresh={refreshAll}
        onNavigate={navigate}
        onManageCategories={() => setShowCategories(true)}
        onManageUnits={() => setShowUnits(true)}
        onDataChanged={invalidateProductData}
        canImportProductSpreadsheet={canImportProductSpreadsheet}
        canDeleteProducts={canDeleteProducts}
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
