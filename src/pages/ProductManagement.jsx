/**
 * ProductManagement.jsx
 * Full Product Management System — BizCTRL
 * Route: /product-management
 */
import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useWorkspaceCustomization } from '@/lib/WorkspaceCustomizationContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import ProductMasterForm from '@/components/products/ProductMasterForm';
import BarcodeGenerator from '@/components/products/BarcodeGenerator';
import ProductVariantsManager from '@/components/products/ProductVariantsManager';
import InventoryTransactionForm from '@/components/products/InventoryTransactionForm';
import EnterpriseCategoryManager from '@/components/categories/CategoryManager';
import PriceAnalyticsTab from '@/components/products/PriceAnalyticsTab';
import {
  Package, Plus, Pencil, Trash2, Search, BarChart3, Tag, Ruler,
  Barcode, Layers, ArrowUpDown, TrendingUp, Upload, Download,
  AlertTriangle, CheckCircle, XCircle, RefreshCw,
  FileText, ChevronRight, Star, DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ── Helpers ──────────────────────────────────────────────────────────────────
function stockBadge(product, lowStockThreshold = 0, lowStockEnabled = true) {
  const stock = product.current_stock || 0;
  const min = Math.max(product.min_stock || 0, lowStockThreshold || 0);
  if (stock <= 0) return <Badge variant="destructive" className="text-xs">Out of Stock</Badge>;
  if (lowStockEnabled && stock <= min) return <Badge className="text-xs bg-orange-500">Low Stock</Badge>;
  return <Badge variant="secondary" className="text-xs text-green-600">In Stock</Badge>;
}

function statusBadge(status) {
  if (status === 'inactive') return <Badge variant="secondary" className="text-xs">Inactive</Badge>;
  if (status === 'discontinued') return <Badge variant="outline" className="text-xs text-gray-500">Discontinued</Badge>;
  return <Badge className="text-xs bg-green-500">Active</Badge>;
}

// ── DASHBOARD TAB ─────────────────────────────────────────────────────────────
function DashboardTab({ products, currency }) {
  const total = products.length;
  const active = products.filter(p => p.status === 'active' || p.is_active).length;
  const outOfStock = products.filter(p => (p.current_stock || 0) <= 0).length;
  const lowStock = products.filter(p => {
    const s = p.current_stock || 0;
    const m = p.min_stock || 0;
    return s > 0 && s <= m;
  }).length;
  const totalValue = products.reduce((sum, p) => sum + ((p.current_stock || 0) * (p.purchase_cost || p.default_cost || 0)), 0);

  const topSelling = useMemo(() => {
    return [...products]
      .filter(p => (p.selling_price || p.default_price || 0) > 0)
      .sort((a, b) => (b.selling_price || b.default_price || 0) - (a.selling_price || a.default_price || 0))
      .slice(0, 5);
  }, [products]);

  const categoryDist = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const cat = p.category || 'Uncategorized';
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [products]);

  const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Package className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Products</p>
              <p className="text-xl font-bold">{total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-xl font-bold text-green-600">{active}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Low Stock</p>
              <p className="text-xl font-bold text-orange-600">{lowStock}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Out of Stock</p>
              <p className="text-xl font-bold text-red-600">{outOfStock}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Product Value */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Total Product Value</p>
            <p className="text-2xl font-bold">{currency}{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <BarChart3 className="w-8 h-8 text-primary opacity-50" />
        </div>
      </Card>

      {/* Category Distribution */}
      {categoryDist.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Products by Category</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={categoryDist} cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {categoryDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Top Products by Price */}
      {topSelling.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1">
            <Star className="w-4 h-4 text-yellow-500" /> Top Products
          </h3>
          <div className="space-y-2">
            {topSelling.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">{i + 1}</span>
                  <span className="truncate max-w-[140px]">{p.name}</span>
                </div>
                <span className="font-semibold text-primary">{currency}{(p.selling_price || p.default_price || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── PRODUCT MASTER TAB ────────────────────────────────────────────────────────
function ProductMasterTab({ products, categories, isLoading, onRefresh, currency }) {
  const { t } = useLanguage();
  const { activeRestaurant } = useTenant();
  const { configuration, productCustomFields } = useWorkspaceCustomization();
  const productListSettings = configuration.tables.products;
  const visibleColumns = new Set(productListSettings.visible_columns || []);
  const lowStockSettings = configuration.notifications;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewProduct, setViewProduct] = useState(null);
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [stockProduct, setStockProduct] = useState(null);
  const [variantProduct, setVariantProduct] = useState(null);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Product.create({ ...data, restaurant_id: activeRestaurant?.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setShowForm(false); toast.success(t('product_added')); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setEditing(null); toast.success(t('product_updated')); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setDeleting(null); toast.success(t('product_deleted')); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const filteredProducts = products.filter(p => {
      const matchSearch = !search ||
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.sku?.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(search.toLowerCase()) ||
        p.product_id?.toLowerCase().includes(search.toLowerCase()) ||
        p.brand?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || p.status === filterStatus || (filterStatus === 'active' && p.is_active);
      const matchCat = filterCategory === 'all' || p.category_id === filterCategory || p.category === filterCategory;
      return matchSearch && matchStatus && matchCat;
    });
    const direction = productListSettings.default_sort_direction === 'desc' ? -1 : 1;
    const key = productListSettings.default_sort || 'name';
    return filteredProducts.sort((a, b) => {
      const aValue = a?.[key] ?? '';
      const bValue = b?.[key] ?? '';
      if (typeof aValue === 'number' || typeof bValue === 'number') return (Number(aValue) - Number(bValue)) * direction;
      return String(aValue).localeCompare(String(bValue)) * direction;
    });
  }, [products, search, filterStatus, filterCategory, productListSettings.default_sort, productListSettings.default_sort_direction]);

  return (
    <div className="space-y-3">
      {/* Search & Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8 text-sm"
            placeholder="Search name, SKU, barcode..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); }}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all', 'active', 'inactive', 'discontinued'].map(s => (
          <button key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filterStatus === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        {categories.filter(c => !c.parent_id).map(c => (
          <button key={c.id}
            onClick={() => setFilterCategory(filterCategory === c.id ? 'all' : c.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filterCategory === c.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</p>

      {isLoading ? (
        <p className="text-center text-muted-foreground text-sm py-8">{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('no_products')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <Card key={p.id} className="p-3">
              <div className="flex items-start gap-3">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" onError={e => e.target.style.display = 'none'} />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{p.name}</p>
                      {visibleColumns.has('sku') && p.sku && <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>}
                      {visibleColumns.has('category') && p.category && <p className="text-xs text-muted-foreground">{p.category}</p>}
                      {p.name_ar && <p className="text-xs text-muted-foreground" dir="rtl">{p.name_ar}</p>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {visibleColumns.has('status') && statusBadge(p.status)}
                      {visibleColumns.has('current_stock') && stockBadge(p, lowStockSettings.low_stock_threshold, lowStockSettings.low_stock_enabled)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
                    {visibleColumns.has('selling_price') && <span className="text-muted-foreground">Price: <span className="font-medium text-primary">{currency}{(p.selling_price || p.default_price || 0).toFixed(2)}</span></span>}
                    {visibleColumns.has('current_stock') && <span className="text-muted-foreground">Stock: <span className={`font-medium ${(p.current_stock || 0) <= Math.max(p.min_stock || 0, lowStockSettings.low_stock_threshold || 0) ? 'text-red-600' : 'text-green-600'}`}>{p.current_stock || 0}</span></span>}
                    {productCustomFields.filter((field) => field.visible !== false && p.custom_attributes?.[field.id] !== undefined && p.custom_attributes?.[field.id] !== '').map((field) => <span key={field.id} className="text-muted-foreground">{field.label}: <span className="font-medium text-foreground">{Array.isArray(p.custom_attributes[field.id]) ? p.custom_attributes[field.id].join(', ') : String(p.custom_attributes[field.id])}</span></span>)}
                  </div>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex gap-1 mt-2 pt-2 border-t border-border">
                <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => { setEditing(p); setShowForm(false); }}>
                  <Pencil className="w-3 h-3 mr-1" />Edit
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => setBarcodeProduct(p)}>
                  <Barcode className="w-3 h-3 mr-1" />Barcode
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => setStockProduct(p)}>
                  <ArrowUpDown className="w-3 h-3 mr-1" />Stock
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={() => setVariantProduct(p)}>
                  <Layers className="w-3 h-3 mr-1" />Variants
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(p)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Product Dialog */}
      <Dialog open={showForm || !!editing} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditing(null); } }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('edit_product') : t('add_product')}</DialogTitle>
          </DialogHeader>
          <ProductMasterForm
            initial={editing}
            onSubmit={(data) => editing ? updateMut.mutate({ id: editing.id, data }) : createMut.mutate(data)}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Barcode Dialog */}
      <Dialog open={!!barcodeProduct} onOpenChange={(o) => { if (!o) setBarcodeProduct(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Barcode / QR Code</DialogTitle></DialogHeader>
          {barcodeProduct && <BarcodeGenerator product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />}
        </DialogContent>
      </Dialog>

      {/* Stock Transaction Dialog */}
      <Dialog open={!!stockProduct} onOpenChange={(o) => { if (!o) setStockProduct(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Inventory Transaction</DialogTitle></DialogHeader>
          {stockProduct && (
            <InventoryTransactionForm
              product={stockProduct}
              onSuccess={() => setStockProduct(null)}
              onCancel={() => setStockProduct(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Variants Dialog */}
      <Dialog open={!!variantProduct} onOpenChange={(o) => { if (!o) setVariantProduct(null); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Product Variants — {variantProduct?.name}</DialogTitle></DialogHeader>
          {variantProduct && <ProductVariantsManager product={variantProduct} />}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_delete')}</AlertDialogTitle>
            <AlertDialogDescription>Delete "{deleting?.name}"? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate(deleting.id)} className="bg-destructive text-destructive-foreground">
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── CATEGORY MANAGEMENT TAB HELPERS ───────────────────────────────────────────
const CategoryForm = ({ form, set, handleSubmit, editing, t, parentCats, setShowForm, setEditing }) => (
  <form onSubmit={handleSubmit} className="space-y-3">
    <div>
      <Label className="text-xs">Category Name *</Label>
      <Input value={form.name} onChange={e => set('name', e.target.value)} required />
    </div>
    <div>
      <Label className="text-xs">Description</Label>
      <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder={t('optional')} />
    </div>
    <div>
      <Label className="text-xs">{t('parent_category')} (leave blank for top-level)</Label>
      <Select value={form.parent_id || '__none__'} onValueChange={v => set('parent_id', v === '__none__' ? '' : v)}>
        <SelectTrigger><SelectValue placeholder="— Top Level —" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Top Level —</SelectItem>
          {parentCats.filter(c => c.id !== editing?.id).map(c => (
            <SelectItem key={c.id} value={c.id || "__none__"}>{c.name_en || c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div>
      <Label className="text-xs">Color (hex)</Label>
      <Input value={form.color} onChange={e => set('color', e.target.value)} placeholder="#6366f1" />
    </div>
    <div className="flex gap-2">
      <Button type="submit" className="flex-1">{editing ? t('save') : t('add_category')}</Button>
      <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>{t('cancel')}</Button>
    </div>
  </form>
);

// ── CATEGORY MANAGEMENT TAB ───────────────────────────────────────────────────
function CategoryManagementTab({ categories, isLoading }) {
  const { t } = useLanguage();
  const { activeRestaurant } = useTenant();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', parent_id: '', color: '', type: 'product' });

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ProductCategory.create({ ...data, restaurant_id: activeRestaurant?.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product_categories'] }); setShowForm(false); setForm({ name: '', description: '', parent_id: '', color: '', type: 'product' }); toast.success(t('category_added')); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductCategory.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product_categories'] }); setEditing(null); toast.success(t('category_updated')); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ProductCategory.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product_categories'] }); setDeleting(null); toast.success(t('category_deleted')); },
    onError: (e) => toast.error(e.message),
  });

  const productCategories = useMemo(() => categories, [categories]);
  const parentCats = useMemo(() => productCategories.filter(c => !c.parent_id), [productCategories]);
  const subCats = useMemo(() => productCategories.filter(c => !!c.parent_id), [productCategories]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { name_en: form.name, description: form.description || null, parent_id: form.parent_id || null, color: form.color || null, is_active: true };
    if (editing) updateMut.mutate({ id: editing.id, data });
    else createMut.mutate(data);
  };

  const openEdit = (cat) => {
    setEditing(cat);
    setForm({ name: cat.name_en || cat.name || '', description: cat.description || '', parent_id: cat.parent_id || '', color: cat.color || '', type: 'product' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{productCategories.length} categories</p>
        <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', description: '', parent_id: '', color: '', type: 'product' }); }}>
          <Plus className="w-3 h-3 mr-1" />{t('add_category')}
        </Button>
      </div>

      {(showForm || editing) && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{editing ? t('edit_category') : t('add_category')}</h3>
          <CategoryForm form={form} set={set} handleSubmit={handleSubmit} editing={editing} t={t} parentCats={parentCats} setShowForm={setShowForm} setEditing={setEditing} />
        </Card>
      )}

      {isLoading ? (
        <p className="text-center text-muted-foreground text-sm py-8">{t('loading')}</p>
      ) : parentCats.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('no_categories')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {parentCats.map(cat => {
            const children = subCats.filter(c => c.parent_id === cat.id);
            return (
              <Card key={cat.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {cat.color && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />}
                    <div>
                      <p className="text-sm font-semibold">{cat?.name_en || cat?.name || "Unnamed"}</p>
                      {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                    </div>
                    {children.length > 0 && <Badge variant="outline" className="text-xs">{children.length} sub</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(cat)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                {children.length > 0 && (
                  <div className="mt-2 ml-4 space-y-1">
                    {children.map(child => (
                      <div key={child.id} className="flex items-center justify-between py-1 border-l-2 border-border pl-2">
                        <div className="flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs">{child?.name_en || child?.name || "Unnamed"}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(child)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeleting(child)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_delete')}</AlertDialogTitle>
            <AlertDialogDescription>Delete category "{deleting?.name_en || deleting?.name}"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate(deleting.id)} className="bg-destructive text-destructive-foreground">{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── UNIT MANAGEMENT TAB HELPERS ───────────────────────────────────────────────
const UnitForm = ({ handleSubmit, form, set, editing, t, setShowForm, setEditing }) => (
  <form onSubmit={handleSubmit} className="space-y-3">
    <div>
      <Label className="text-xs">Unit Name *</Label>
      <Input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. Dozen" />
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label className="text-xs">{t('abbreviation')}</Label>
        <Input value={form.abbreviation} onChange={e => set('abbreviation', e.target.value)} placeholder="dz" />
      </div>
      <div>
        <Label className="text-xs">{t('type')}</Label>
        <Select value={form.type} onValueChange={v => set('type', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="weight">{t('weight')}</SelectItem>
            <SelectItem value="volume">{t('volume')}</SelectItem>
            <SelectItem value="count">{t('count')}</SelectItem>
            <SelectItem value="custom">{t('custom')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
    <div className="flex gap-2">
      <Button type="submit" className="flex-1">{editing ? t('save') : t('add_unit')}</Button>
      <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>{t('cancel')}</Button>
    </div>
  </form>
);

// ── UNIT MANAGEMENT TAB ───────────────────────────────────────────────────────
function UnitManagementTab() {
  const { t } = useLanguage();
  const { activeRestaurant } = useTenant();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({ name: '', abbreviation: '', type: 'custom' });

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['product_units', activeRestaurant?.id],
    queryFn: () => base44.entities.ProductUnit.filter(
      activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {},
      'sort_order', 200
    ),
    enabled: !!activeRestaurant?.id,
    staleTime: 60000,
  });

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ProductUnit.create({ ...data, restaurant_id: activeRestaurant?.id, is_system: false }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product_units'] }); setShowForm(false); setForm({ name: '', abbreviation: '', type: 'custom' }); toast.success(t('unit_added')); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProductUnit.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product_units'] }); setEditing(null); toast.success(t('unit_updated')); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.ProductUnit.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['product_units'] }); setDeleting(null); toast.success(t('unit_deleted')); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { name: form.name, abbreviation: form.abbreviation || null, type: form.type, is_active: true };
    if (editing) updateMut.mutate({ id: editing.id, data });
    else createMut.mutate(data);
  };

  const systemUnits = units.filter(u => u.is_system);
  const customUnits = units.filter(u => !u.is_system);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{units.length} units</p>
        <Button size="sm" onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', abbreviation: '', type: 'custom' }); }}>
          <Plus className="w-3 h-3 mr-1" />{t('add_unit')}
        </Button>
      </div>

      {(showForm || editing) && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{editing ? t('edit_unit') : t('add_unit')}</h3>
          <UnitForm handleSubmit={handleSubmit} form={form} set={set} editing={editing} t={t} setShowForm={setShowForm} setEditing={setEditing} />
        </Card>
      )}

      {/* System Units */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('system_unit')}</p>
        <div className="grid grid-cols-2 gap-2">
          {systemUnits.map(u => (
            <div key={u.id} className="flex items-center justify-between p-2.5 bg-muted rounded-lg">
              <div>
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.abbreviation} • {u.type}</p>
              </div>
              <Badge variant="outline" className="text-xs">System</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Units */}
      {customUnits.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('custom_unit')}</p>
          <div className="space-y-2">
            {customUnits.map(u => (
              <div key={u.id} className="flex items-center justify-between p-2.5 bg-card border rounded-lg">
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.abbreviation} • {u.type}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(u); setForm({ name: u.name, abbreviation: u.abbreviation || '', type: u.type || 'custom' }); }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleting(u)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('confirm_delete')}</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate(deleting.id)} className="bg-destructive text-destructive-foreground">{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── BARCODE SYSTEM TAB ────────────────────────────────────────────────────────
function BarcodeSystemTab({ products }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [found, setFound] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const handleSearch = () => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const p = products.find(p =>
      p.barcode?.toLowerCase() === q ||
      p.sku?.toLowerCase() === q ||
      p.product_id?.toLowerCase() === q ||
      p.name?.toLowerCase().includes(q)
    );
    setFound(p || null);
    if (!p) toast.error('No product found with that barcode/SKU');
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Search className="w-4 h-4" /> {t('search_by_barcode')}
        </h3>
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Scan or type barcode / SKU..."
            className="flex-1"
          />
          <Button onClick={handleSearch}>Search</Button>
        </div>
        {found && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-200">{found.name}</p>
                <p className="text-xs text-green-600 dark:text-green-400">SKU: {found.sku || '—'} | Barcode: {found.barcode || '—'}</p>
                <p className="text-xs text-green-600 dark:text-green-400">Stock: {found.current_stock || 0} {found.unit || ''}</p>
              </div>
              <Button size="sm" onClick={() => setSelectedProduct(found)}>
                <Barcode className="w-3 h-3 mr-1" /> Generate
              </Button>
            </div>
          </div>
        )}
        {search && !found && (
          <p className="text-xs text-muted-foreground mt-2">Press Enter or click Search to look up</p>
        )}
      </Card>

      {/* Quick Barcode Generation */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Quick Generate — All Products</h3>
        <div className="space-y-2">
          {products.filter(p => p.barcode || p.sku).slice(0, 20).map(p => (
            <div key={p.id} className="flex items-center justify-between p-2.5 bg-card border rounded-lg">
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.barcode && `BC: ${p.barcode}`}
                  {p.barcode && p.sku && ' | '}
                  {p.sku && `SKU: ${p.sku}`}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelectedProduct(p)}>
                <Barcode className="w-3 h-3 mr-1" />Print
              </Button>
            </div>
          ))}
          {products.filter(p => !p.barcode && !p.sku).length > 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              {products.filter(p => !p.barcode && !p.sku).length} products have no barcode/SKU yet. Edit them to add.
            </p>
          )}
        </div>
      </div>

      <Dialog open={!!selectedProduct} onOpenChange={(o) => { if (!o) setSelectedProduct(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Barcode / QR Code</DialogTitle></DialogHeader>
          {selectedProduct && <BarcodeGenerator product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── INVENTORY INTEGRATION TAB ─────────────────────────────────────────────────
function InventoryIntegrationTab({ products, currency }) {
  const { t } = useLanguage();
  const { activeRestaurant } = useTenant();
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch] = useState('');

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['inventory_transactions', activeRestaurant?.id],
    queryFn: () => base44.entities.InventoryTransaction.filter(
      activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {},
      '-created_at', 500
    ),
    enabled: !!activeRestaurant?.id,
    staleTime: 30000,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-8 text-sm"
            placeholder="Search transactions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {txLoading ? (
        <p className="text-center py-8 text-muted-foreground text-sm">{t('loading')}</p>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          <ArrowUpDown className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No inventory transactions yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map(tx => (
            <Card key={tx.id} className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{tx.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tx.type === 'in' ? 'Stock In' : 'Stock Out'} • {new Date(tx.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${tx.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'in' ? '+' : '-'}{tx.quantity}
                  </p>
                  <p className="text-xs text-muted-foreground">{currency}{tx.unit_cost?.toFixed(2)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ANALYTICS TAB ─────────────────────────────────────────────────────────────
function AnalyticsTab({ products, currency }) {
  const { t } = useLanguage();

  const stockData = useMemo(() => {
    return products.slice(0, 10).map(p => ({
      name: p.name.substring(0, 10),
      stock: p.current_stock || 0,
      min: p.min_stock || 0
    }));
  }, [products]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Stock Levels vs Minimum</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={stockData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Bar dataKey="stock" fill="#6366f1" radius={[4, 4, 0, 0]} name="Current Stock" />
            <Bar dataKey="min" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Min Stock" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Inventory Insights</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-sm">Critical Stock (Out)</span>
            </div>
            <span className="font-bold text-red-600">{products.filter(p => (p.current_stock || 0) <= 0).length}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <span className="text-sm">Low Stock Alert</span>
            </div>
            <span className="font-bold text-orange-600">{products.filter(p => (p.current_stock || 0) > 0 && (p.current_stock || 0) <= (p.min_stock || 0)).length}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── IMPORT/EXPORT TAB ─────────────────────────────────────────────────────────
function ImportExportTab({ products, categories, currency }) {
  const { t } = useLanguage();
  const { activeRestaurant } = useTenant();
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const exportCSV = () => {
    const headers = ['name', 'name_ar', 'name_en', 'sku', 'barcode', 'category', 'unit', 'brand', 'purchase_cost', 'selling_price', 'tax_rate', 'min_stock', 'max_stock', 'status'];
    const rows = products.map(p => [
      p.name, p.name_ar || '', p.name_en || '', p.sku || '', p.barcode || '', p.category || '', p.unit || '', p.brand || '',
      p.purchase_cost || 0, p.selling_price || 0, p.tax_rate || 0, p.min_stock || 0, p.max_stock || 0, p.status || 'active'
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportPDF = () => {
    toast.info('PDF Export started... this may take a moment');
    // Simplified for demo
    window.print();
  };

  const downloadTemplate = () => {
    const headers = ['name', 'name_ar', 'name_en', 'sku', 'barcode', 'category', 'unit', 'brand', 'purchase_cost', 'selling_price', 'tax_rate', 'min_stock', 'max_stock', 'status'];
    const example = ['Example Product', 'منتج تجريبي', 'Example Product', 'SKU001', '123456', 'General', 'pcs', 'BrandX', '10.00', '15.00', '5', '10', '100', 'active'];
    const csvContent = [headers.join(','), example.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_import_template.csv';
    a.click();
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('File is empty or has no data rows'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      let imported = 0, failed = 0;
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        if (!row.name) { failed++; continue; }
        try {
          await base44.entities.Product.create({
            name: row.name,
            name_ar: row.name_ar || null,
            name_en: row.name_en || null,
            sku: row.sku || null,
            barcode: row.barcode || null,
            category: row.category || null,
            unit: row.unit || null,
            brand: row.brand || null,
            purchase_cost: parseFloat(row.purchase_cost) || 0,
            selling_price: parseFloat(row.selling_price) || 0,
            default_price: parseFloat(row.selling_price) || 0,
            default_cost: parseFloat(row.purchase_cost) || 0,
            tax_rate: parseFloat(row.tax_rate) || 0,
            min_stock: parseFloat(row.min_stock) || 0,
            max_stock: parseFloat(row.max_stock) || 0,
            status: row.status || 'active',
            is_active: (row.status || 'active') === 'active',
            restaurant_id: activeRestaurant?.id,
          });
          imported++;
        } catch { failed++; }
      }
      qc.invalidateQueries({ queryKey: ['products'] });
      setImportResult({ imported, failed });
      toast.success(`${imported} ${t('rows_imported')}, ${failed} ${t('rows_failed')}`);
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Export Section */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Download className="w-4 h-4" /> {t('export_products')}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs">
            <FileText className="w-3 h-3 mr-1" /> CSV Export
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} className="text-xs">
            <FileText className="w-3 h-3 mr-1" /> PDF Export
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{products.length} products will be exported</p>
      </Card>

      {/* Import Section */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4" /> {t('import_products')}
        </h3>
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-full text-xs">
            <Download className="w-3 h-3 mr-1" /> {t('download_template')}
          </Button>
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {importing ? t('processing') : 'Click to select CSV file'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Supported: .csv</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          {importResult && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-xs">
              <p className="font-semibold text-green-700 dark:text-green-300">{t('import_complete')}</p>
              <p className="text-green-600 dark:text-green-400">{importResult.imported} {t('rows_imported')}</p>
              {importResult.failed > 0 && <p className="text-red-600">{importResult.failed} {t('rows_failed')}</p>}
            </div>
          )}
        </div>
      </Card>

      {/* Import Instructions */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">CSV Format Guide</h3>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Required columns: <strong>name</strong></p>
          <p>Optional: name_ar, name_en, sku, barcode, category, unit, brand, purchase_cost, selling_price, tax_rate, min_stock, max_stock, status</p>
          <p>Status values: active, inactive, discontinued</p>
          <p>Download the template above for the correct format.</p>
        </div>
      </Card>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function ProductManagement() {
  const { t, currency } = useLanguage();
  const { activeRestaurant } = useTenant();
  const [activeTab, setActiveTab] = useState('dashboard');

  const { data: products = [], isLoading: productsLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['products', activeRestaurant?.id],
    queryFn: () => base44.entities.Product.filter(
      activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {},
      '-created_date', 2000
    ),
    enabled: !!activeRestaurant?.id,
    staleTime: 30000,
  });

  // Product Management uses product_categories ONLY (isolated enterprise category system)
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ['product_categories', activeRestaurant?.id],
    queryFn: () => base44.entities.ProductCategory.filter(
      activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {},
      'sort_order', 500
    ),
    enabled: !!activeRestaurant?.id,
    staleTime: 60000,
  });

  return (
    <div>
      <PageHeader
        title={t('product_management')}
        action={
          <Button size="sm" variant="outline" onClick={() => refetchProducts()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4">
          <TabsList className="flex w-max min-w-full gap-0 h-9 mb-4">
            <TabsTrigger value="dashboard" className="text-xs px-3 flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="master" className="text-xs px-3 flex items-center gap-1">
              <Package className="w-3 h-3" /> Products
            </TabsTrigger>
            <TabsTrigger value="categories" className="text-xs px-3 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Categories
            </TabsTrigger>
            <TabsTrigger value="units" className="text-xs px-3 flex items-center gap-1">
              <Ruler className="w-3 h-3" /> Units
            </TabsTrigger>
            <TabsTrigger value="barcode" className="text-xs px-3 flex items-center gap-1">
              <Barcode className="w-3 h-3" /> Barcode
            </TabsTrigger>
            <TabsTrigger value="inventory" className="text-xs px-3 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> Inventory
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs px-3 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="price-analytics" className="text-xs px-3 flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Price Analytics
            </TabsTrigger>
            <TabsTrigger value="import" className="text-xs px-3 flex items-center gap-1">
              <Upload className="w-3 h-3" /> Import/Export
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dashboard">
          <DashboardTab products={products} currency={currency} />
        </TabsContent>

        <TabsContent value="master">
          <ProductMasterTab
            products={products}
            categories={categories}
            isLoading={productsLoading}
            onRefresh={refetchProducts}
            currency={currency}
          />
        </TabsContent>

        <TabsContent value="categories">
          {/* Enterprise Category Manager — product_categories module only */}
          <EnterpriseCategoryManager />
        </TabsContent>

        <TabsContent value="units">
          <UnitManagementTab />
        </TabsContent>

        <TabsContent value="barcode">
          <BarcodeSystemTab products={products} />
        </TabsContent>

        <TabsContent value="inventory">
          <InventoryIntegrationTab products={products} currency={currency} />
        </TabsContent>

        <TabsContent value="analytics">
          <AnalyticsTab products={products} currency={currency} />
        </TabsContent>

        <TabsContent value="price-analytics">
          <PriceAnalyticsTab currency={currency} />
        </TabsContent>

        <TabsContent value="import">
          <ImportExportTab products={products} categories={categories} currency={currency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
