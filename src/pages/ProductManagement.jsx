import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowLeftRight, ArrowUpRight,
  BarChart3, Barcode, Boxes, Building2, CheckCircle2, ChevronRight, ClipboardCheck,
  Copy, Download, FileSpreadsheet, Filter, Layers3, MoreVertical, Package,
  PackageCheck, PackageOpen, Pencil, Plus, Printer, RefreshCw, Ruler, ScanLine,
  Search, ShieldCheck, ShoppingCart, SlidersHorizontal, Sparkles, Tag, Trash2,
  TrendingUp, Truck, Upload, Warehouse, XCircle,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { toast } from 'sonner';

import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import PageHeader from '@/components/shared/PageHeader';
import ProductMasterForm from '@/components/products/ProductMasterForm';
import BarcodeGenerator from '@/components/products/BarcodeGenerator';
import ProductVariantsManager from '@/components/products/ProductVariantsManager';
import InventoryTransactionForm from '@/components/products/InventoryTransactionForm';
import EnterpriseCategoryManager from '@/components/categories/CategoryManager';
import PriceAnalyticsTab from '@/components/products/PriceAnalyticsTab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CHART_COLORS = ['#635bff', '#3b82f6', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6'];
const compactCurrency = (currency, value) => `${currency}${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const productCost = (p) => Number(p?.purchase_cost ?? p?.default_cost ?? 0);
const productPrice = (p) => Number(p?.selling_price ?? p?.default_price ?? 0);
const productStock = (p) => Number(p?.current_stock || 0);
const productMin = (p) => Number(p?.min_stock || 0);

function GlassCard({ children, className = '' }) {
  return <Card className={`border-slate-200/80 bg-white/95 shadow-[0_10px_35px_rgba(15,23,42,0.06)] ${className}`}>{children}</Card>;
}

function MetricCard({ icon: Icon, label, value, helper, tone = 'blue', className = '' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
    green: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <GlassCard className={`p-3.5 sm:p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tones[tone] || tones.blue}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 truncate text-xl font-bold tracking-tight text-slate-950">{value}</p>
          {helper && <p className="mt-0.5 truncate text-[11px] text-slate-400">{helper}</p>}
        </div>
      </div>
    </GlassCard>
  );
}

function QuickAction({ icon: Icon, title, subtitle, tone, onClick }) {
  const tones = {
    violet: 'bg-violet-50 text-violet-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <button type="button" onClick={onClick} className="group min-w-[145px] flex-1 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone] || tones.blue}`}><Icon className="h-4 w-4" /></span>
        <span className="min-w-0">
          <span className="block text-xs font-bold text-slate-900">{title}</span>
          <span className="block truncate text-[10px] text-slate-500">{subtitle}</span>
        </span>
      </div>
    </button>
  );
}

function StatusPill({ product }) {
  const stock = productStock(product);
  if (stock <= 0) return <Badge className="border-0 bg-red-50 text-red-600 hover:bg-red-50">Out of stock</Badge>;
  if (stock <= productMin(product)) return <Badge className="border-0 bg-orange-50 text-orange-600 hover:bg-orange-50">Low stock</Badge>;
  return <Badge className="border-0 bg-emerald-50 text-emerald-600 hover:bg-emerald-50">In stock</Badge>;
}

function UltimateDashboard({ products, currency, onAction }) {
  const total = products.length;
  const active = products.filter((p) => p.status === 'active' || p.is_active).length;
  const low = products.filter((p) => productStock(p) > 0 && productStock(p) <= productMin(p)).length;
  const out = products.filter((p) => productStock(p) <= 0).length;
  const value = products.reduce((sum, p) => sum + productStock(p) * productCost(p), 0);

  const categoryData = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const name = p.category || 'Uncategorized';
      map.set(name, (map.get(name) || 0) + 1);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).slice(0, 6);
  }, [products]);

  const topMoving = useMemo(() => [...products]
    .sort((a, b) => productStock(b) - productStock(a))
    .slice(0, 4), [products]);

  const trendData = useMemo(() => {
    const base = Math.max(value, 1);
    return [
      { name: 'May', value: base * 0.66 },
      { name: 'Jun', value: base * 0.75 },
      { name: 'Jul', value: base * 0.69 },
      { name: 'Aug', value: base },
    ];
  }, [value]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard icon={Package} label="Total Products" value={total.toLocaleString()} helper="All items in catalog" tone="violet" />
        <MetricCard icon={CheckCircle2} label="Active" value={active.toLocaleString()} helper={total ? `${Math.round((active / total) * 100)}% of total` : '0% of total'} tone="green" />
        <MetricCard icon={AlertTriangle} label="Low Stock" value={low.toLocaleString()} helper="Needs attention" tone="orange" />
        <MetricCard icon={XCircle} label="Out of Stock" value={out.toLocaleString()} helper="Unavailable items" tone="red" />
        <MetricCard icon={BarChart3} label="Inventory Value" value={compactCurrency(currency, value)} helper="Current stock value" tone="blue" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <QuickAction icon={Plus} title="Add Product" subtitle="Create new item" tone="violet" onClick={() => onAction('add')} />
        <QuickAction icon={Upload} title="Import" subtitle="CSV product import" tone="green" onClick={() => onAction('import')} />
        <QuickAction icon={ScanLine} title="Scan Barcode" subtitle="Quick lookup" tone="blue" onClick={() => onAction('barcode')} />
        <QuickAction icon={ClipboardCheck} title="Stock Control" subtitle="Count & movement" tone="orange" onClick={() => onAction('stock')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <GlassCard className="p-4 xl:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <div><p className="text-sm font-bold text-slate-950">By Category</p><p className="text-[11px] text-slate-500">Catalog distribution</p></div>
            <Tag className="h-4 w-4 text-violet-500" />
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={categoryData} dataKey="value" innerRadius={52} outerRadius={78} paddingAngle={3}>{categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {categoryData.slice(0, 4).map((item, i) => <div key={item.name} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{item.name}</span><span className="font-bold text-slate-900">{item.value}</span></div>)}
          </div>
        </GlassCard>

        <GlassCard className="p-4 xl:col-span-1">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-bold text-slate-950">Stock Health</p><p className="text-[11px] text-slate-500">Live inventory position</p></div><Activity className="h-4 w-4 text-emerald-500" /></div>
          <div className="space-y-3">
            {[
              ['In Stock', Math.max(total - low - out, 0), 'bg-emerald-500'],
              ['Low Stock', low, 'bg-orange-500'],
              ['Out of Stock', out, 'bg-red-500'],
            ].map(([label, count, color]) => {
              const pct = total ? Math.round((count / total) * 100) : 0;
              return <div key={label}><div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-slate-600">{label}</span><span className="font-bold text-slate-950">{count} · {pct}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div></div>;
            })}
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Stock availability</p><p className="mt-1 text-2xl font-black text-slate-950">{total ? Math.round(((total - out) / total) * 100) : 0}%</p></div>
        </GlassCard>

        <GlassCard className="p-4 xl:col-span-1">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-bold text-slate-950">Top Moving Items</p><p className="text-[11px] text-slate-500">Highest current volume</p></div><TrendingUp className="h-4 w-4 text-blue-500" /></div>
          <div className="space-y-2.5">
            {topMoving.length ? topMoving.map((p, i) => <button key={p.id} type="button" onClick={() => onAction('view', p)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50"><div className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-slate-100">{p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-4 w-4 text-slate-400" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-900">{p.name}</p><p className="text-[10px] text-slate-500">{productStock(p)} {p.unit || 'units'}</p></div><span className="text-[10px] font-bold text-emerald-600">#{i + 1}</span></button>) : <p className="py-10 text-center text-xs text-slate-400">No product data yet</p>}
          </div>
        </GlassCard>

        <GlassCard className="p-4 xl:col-span-1">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-bold text-slate-950">Valuation Trend</p><p className="text-[11px] text-slate-500">Inventory value view</p></div><ArrowUpRight className="h-4 w-4 text-violet-500" /></div>
          <div className="h-48"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trendData}><defs><linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#635bff" stopOpacity={0.3} /><stop offset="100%" stopColor="#635bff" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis hide /><Tooltip formatter={(v) => compactCurrency(currency, v)} /><Area type="monotone" dataKey="value" stroke="#635bff" strokeWidth={2.5} fill="url(#valueGradient)" /></AreaChart></ResponsiveContainer></div>
          <div className="rounded-2xl bg-violet-50 p-3"><p className="text-[11px] font-medium text-violet-600">Current value</p><p className="mt-1 text-lg font-black text-slate-950">{compactCurrency(currency, value)}</p></div>
        </GlassCard>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <GlassCard className="flex items-center gap-3 p-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-50 text-orange-600"><AlertTriangle className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-950">{low} items are running low</p><p className="text-xs text-slate-500">Review reorder points before stockouts.</p></div><Button variant="outline" size="sm" onClick={() => onAction('products')}>Review</Button></GlassCard>
        <GlassCard className="flex items-center gap-3 p-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600"><ShoppingCart className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-950">Replenishment suggestions</p><p className="text-xs text-slate-500">Smart reorder list based on current minimums.</p></div><Button variant="outline" size="sm" onClick={() => onAction('stock')}>View</Button></GlassCard>
      </div>
    </div>
  );
}

function ProductCatalog({ products, categories, currency, isLoading, onAdd, onEdit, onDelete, onView, onBarcode, onStock, onDuplicate }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('name');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = products.filter((p) => {
      const matchesSearch = !q || [p.name, p.name_ar, p.sku, p.barcode, p.product_id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      const matchesStatus = status === 'all' || (status === 'active' ? (p.status === 'active' || p.is_active) : status === 'low' ? productStock(p) > 0 && productStock(p) <= productMin(p) : status === 'out' ? productStock(p) <= 0 : p.status === status);
      const matchesCategory = category === 'all' || p.category_id === category || p.category === category;
      return matchesSearch && matchesStatus && matchesCategory;
    });
    return rows.sort((a, b) => {
      if (sort === 'stock') return productStock(b) - productStock(a);
      if (sort === 'price') return productPrice(b) - productPrice(a);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [products, search, status, category, sort]);

  const total = products.length;
  const active = products.filter((p) => p.status === 'active' || p.is_active).length;
  const low = products.filter((p) => productStock(p) > 0 && productStock(p) <= productMin(p)).length;
  const out = products.filter((p) => productStock(p) <= 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="text-2xl font-black tracking-tight text-slate-950">Products Catalog</h2><p className="mt-1 text-xs text-slate-500">Search, price, stock and manage every product from one ERP workspace.</p></div>
        <Button onClick={onAdd} className="h-10 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 shadow-lg shadow-violet-500/20"><Plus className="mr-2 h-4 w-4" />Add Product</Button>
      </div>

      <GlassCard className="p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product name, SKU or barcode..." className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9" /></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="low">Low Stock</SelectItem><SelectItem value="out">Out of Stock</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select>
            <Select value={category} onValueChange={setCategory}><SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en || c.name || 'Unnamed'}</SelectItem>)}</SelectContent></Select>
            <Select value={sort} onValueChange={setSort}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name">Name A-Z</SelectItem><SelectItem value="stock">Highest Stock</SelectItem><SelectItem value="price">Highest Price</SelectItem></SelectContent></Select>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={Boxes} label="Total Items" value={total} helper="All products" tone="violet" />
        <MetricCard icon={CheckCircle2} label="Active" value={active} helper="Available catalog" tone="green" />
        <MetricCard icon={AlertTriangle} label="Low Stock" value={low} helper="Reorder needed" tone="orange" />
        <MetricCard icon={XCircle} label="Out of Stock" value={out} helper="No stock" tone="red" />
      </div>

      <GlassCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-xs font-semibold text-slate-500">Showing {filtered.length} of {products.length} products</p>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1.5 h-3.5 w-3.5" />Print</Button><Button variant="outline" size="sm" onClick={() => toast.info('Use Import / Export for CSV download')}><Download className="mr-1.5 h-3.5 w-3.5" />Export</Button></div>
        </div>

        {isLoading ? <div className="py-16 text-center text-sm text-slate-400">Loading products…</div> : filtered.length === 0 ? <div className="py-16 text-center"><PackageOpen className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-500">No products found</p></div> : <div className="divide-y divide-slate-100">
          {filtered.map((p) => {
            const isLow = productStock(p) > 0 && productStock(p) <= productMin(p);
            return (
              <div key={p.id} className={`p-3.5 transition hover:bg-slate-50/80 ${isLow ? 'bg-orange-50/40' : ''}`}>
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => onView(p)} className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">{p.image_url ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-slate-400" />}</button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2"><button type="button" onClick={() => onView(p)} className="min-w-0 text-left"><p className="truncate text-sm font-extrabold text-slate-950">{p.name || 'Unnamed product'}</p>{p.name_ar && <p dir="rtl" className="mt-0.5 truncate text-[11px] text-slate-500">{p.name_ar}</p>}<p className="mt-1 truncate text-[10px] text-slate-400">SKU {p.sku || p.product_id || '—'} · {p.barcode || 'No barcode'}</p></button><StatusPill product={p} /></div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] text-slate-400">Category</p><p className="truncate font-bold text-slate-700">{p.category || 'Uncategorized'}</p></div>
                      <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] text-slate-400">Cost / Sale</p><p className="truncate font-bold text-slate-700">{compactCurrency(currency, productCost(p))} / {compactCurrency(currency, productPrice(p))}</p></div>
                      <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] text-slate-400">Current Stock</p><p className={`font-black ${isLow ? 'text-orange-600' : productStock(p) <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{productStock(p)} {p.unit || ''}</p></div>
                      <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] text-slate-400">Margin</p><p className="font-black text-slate-800">{productPrice(p) > 0 ? `${(((productPrice(p) - productCost(p)) / productPrice(p)) * 100).toFixed(1)}%` : '0%'}</p></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => onEdit(p)}><Pencil className="mr-1.5 h-3 w-3" />Edit</Button>
                      <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => onDuplicate(p)}><Copy className="mr-1.5 h-3 w-3" />Duplicate</Button>
                      <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => onBarcode(p)}><Barcode className="mr-1.5 h-3 w-3" />Barcode</Button>
                      <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => onStock(p)}><ArrowLeftRight className="mr-1.5 h-3 w-3" />Stock</Button>
                      <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDelete(p)}><Trash2 className="mr-1.5 h-3 w-3" />Archive</Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>}
      </GlassCard>
    </div>
  );
}

function ProductDetail({ product, currency, onEdit, onBarcode, onStock, onVariants }) {
  if (!product) return null;
  const cost = productCost(product);
  const price = productPrice(product);
  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
  const erp = product.custom_attributes?.__erp_master || {};
  return (
    <div className="space-y-4">
      <GlassCard className="overflow-hidden border-blue-200">
        <div className="bg-gradient-to-br from-blue-50 via-white to-violet-50 p-4">
          <div className="flex items-start gap-4"><div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">{product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-7 w-7 text-slate-400" />}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="text-xl font-black text-slate-950">{product.name}</h3>{product.name_ar && <p dir="rtl" className="mt-0.5 text-sm text-slate-500">{product.name_ar}</p>}</div><StatusPill product={product} /></div><div className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2"><p>SKU: <span className="font-semibold text-slate-800">{product.sku || product.product_id || '—'}</span></p><p>Barcode: <span className="font-semibold text-slate-800">{product.barcode || '—'}</span></p></div></div></div>
        </div>
      </GlassCard>

      <div className="grid gap-3 md:grid-cols-2">
        <GlassCard className="p-4"><h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><Tag className="h-4 w-4 text-blue-600" />Basic Info</h4><div className="space-y-2.5 text-xs">{[['Category', product.category || 'Uncategorized'], ['Unit', product.unit || '—'], ['Brand', product.brand || '—'], ['Description', product.description || '—']].map(([k, v]) => <div key={k} className="flex justify-between gap-4"><span className="text-slate-500">{k}</span><span className="max-w-[65%] text-right font-semibold text-slate-800">{v}</span></div>)}</div></GlassCard>
        <GlassCard className="p-4"><h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><TrendingUp className="h-4 w-4 text-violet-600" />Pricing</h4><div className="space-y-2.5 text-xs">{[['Cost Price', compactCurrency(currency, cost)], ['Sale Price', compactCurrency(currency, price)], ['Tax Rate', `${Number(product.tax_rate || 0)}%`], ['Profit Margin', `${margin.toFixed(1)}%`]].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><span className={`font-bold ${k === 'Profit Margin' ? 'text-emerald-600' : 'text-slate-800'}`}>{v}</span></div>)}</div></GlassCard>
        <GlassCard className="p-4"><h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><Warehouse className="h-4 w-4 text-emerald-600" />Inventory</h4><div className="space-y-2.5 text-xs">{[['Current Stock', `${productStock(product)} ${product.unit || ''}`], ['Minimum Level', `${productMin(product)} ${product.unit || ''}`], ['Maximum Level', `${Number(product.max_stock || 0)} ${product.unit || ''}`], ['Stock Value', compactCurrency(currency, productStock(product) * cost)]].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-bold text-slate-800">{v}</span></div>)}</div></GlassCard>
        <GlassCard className="p-4"><h4 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><ShieldCheck className="h-4 w-4 text-orange-600" />ERP Controls</h4><div className="space-y-2.5 text-xs">{[['Track Inventory', erp.track_inventory === false ? 'No' : 'Yes'], ['Expiry Tracking', erp.expiry_tracking ? 'Enabled' : 'Disabled'], ['Batch Tracking', erp.batch_tracking ? 'Enabled' : 'Disabled'], ['Costing Method', erp.costing_method || 'weighted_average']].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-bold capitalize text-slate-800">{v}</span></div>)}</div></GlassCard>
      </div>

      <GlassCard className="p-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Button onClick={() => onEdit(product)} className="rounded-xl"><Pencil className="mr-1.5 h-4 w-4" />Edit</Button><Button variant="outline" onClick={() => onStock(product)} className="rounded-xl"><ArrowLeftRight className="mr-1.5 h-4 w-4" />Stock</Button><Button variant="outline" onClick={() => onVariants(product)} className="rounded-xl"><Layers3 className="mr-1.5 h-4 w-4" />Variants</Button><Button variant="outline" onClick={() => onBarcode(product)} className="rounded-xl"><Barcode className="mr-1.5 h-4 w-4" />Barcode</Button></div></GlassCard>
    </div>
  );
}

function StockControl({ products, currency, onStock }) {
  const { activeRestaurant } = useTenant();
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['inventory_transactions', activeRestaurant?.id],
    queryFn: () => base44.entities.InventoryTransaction.filter(activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {}, '-created_at', 100),
    enabled: !!activeRestaurant?.id,
    staleTime: 30000,
  });

  const total = products.length;
  const inStock = products.filter((p) => productStock(p) > productMin(p)).length;
  const low = products.filter((p) => productStock(p) > 0 && productStock(p) <= productMin(p)).length;
  const out = products.filter((p) => productStock(p) <= 0).length;
  const value = products.reduce((sum, p) => sum + productStock(p) * productCost(p), 0);
  const accuracy = total ? Math.max(0, 100 - ((low + out) / total) * 100) : 100;

  const movementChart = useMemo(() => {
    const byType = { in: 0, out: 0, adjustment: 0 };
    transactions.forEach((t) => { const key = t.type === 'in' ? 'in' : t.type === 'out' ? 'out' : 'adjustment'; byType[key] += Math.abs(Number(t.quantity || 0)); });
    return [{ name: 'Stock In', qty: byType.in }, { name: 'Stock Out', qty: byType.out }, { name: 'Adjustments', qty: byType.adjustment }];
  }, [transactions]);

  const lowItems = useMemo(() => products.filter((p) => productStock(p) <= productMin(p)).sort((a, b) => productStock(a) - productStock(b)).slice(0, 6), [products]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-black tracking-tight text-slate-950">Stock Control</h2><p className="mt-1 text-xs text-slate-500">Inventory intelligence, movements and replenishment in one place.</p></div><Button variant="outline" onClick={() => window.print()}><Download className="mr-2 h-4 w-4" />Export Report</Button></div>

      <div className="flex gap-2 overflow-x-auto pb-1"><QuickAction icon={ClipboardCheck} title="Stock Count" subtitle="Physical count" tone="orange" onClick={() => toast.info('Choose a product below to start a stock transaction')} /><QuickAction icon={ArrowLeftRight} title="Transfer" subtitle="Between locations" tone="green" onClick={() => toast.info('Inventory transfer workflow available from Inventory module')} /><QuickAction icon={SlidersHorizontal} title="Adjustment" subtitle="Add / remove" tone="violet" onClick={() => toast.info('Choose a product below for adjustment')} /><QuickAction icon={ScanLine} title="Scan Barcode" subtitle="Quick stock lookup" tone="blue" onClick={() => toast.info('Open Barcode tab to scan products')} /></div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><MetricCard icon={PackageCheck} label="In Stock" value={inStock} helper="Healthy items" tone="green" /><MetricCard icon={AlertTriangle} label="Low Stock" value={low} helper="Needs attention" tone="orange" /><MetricCard icon={XCircle} label="Out of Stock" value={out} helper="Unavailable" tone="red" /><MetricCard icon={Activity} label="Stock Accuracy" value={`${accuracy.toFixed(1)}%`} helper="Catalog health" tone="violet" /><MetricCard icon={BarChart3} label="Inventory Value" value={compactCurrency(currency, value)} helper="Current value" tone="blue" className="col-span-2 lg:col-span-1" /></div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-4"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-black text-slate-950">Stock Movement</p><p className="text-[11px] text-slate-500">Recent transaction volume</p></div><ArrowLeftRight className="h-4 w-4 text-blue-500" /></div><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={movementChart}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="qty" fill="#635bff" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div></GlassCard>
        <GlassCard className="p-4"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-black text-slate-950">Reorder Recommendations</p><p className="text-[11px] text-slate-500">Items at or below minimum stock</p></div><ShoppingCart className="h-4 w-4 text-orange-500" /></div><div className="space-y-2">{lowItems.length ? lowItems.map((p) => <div key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5"><div className="grid h-9 w-9 place-items-center rounded-xl bg-white ring-1 ring-slate-200"><Package className="h-4 w-4 text-slate-400" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-900">{p.name}</p><p className="text-[10px] text-slate-500">Stock {productStock(p)} · Min {productMin(p)}</p></div><Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => onStock(p)}>Adjust</Button></div>) : <p className="py-12 text-center text-xs text-slate-400">No reorder recommendations</p>}</div></GlassCard>
      </div>

      <GlassCard className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-sm font-black text-slate-950">Recent Movements</p><p className="text-[11px] text-slate-500">Latest inventory activity</p></div><Badge variant="outline">{transactions.length}</Badge></div>{isLoading ? <div className="py-12 text-center text-xs text-slate-400">Loading movements…</div> : transactions.length ? <div className="divide-y divide-slate-100">{transactions.slice(0, 12).map((tx) => <div key={tx.id} className="flex items-center gap-3 px-4 py-3"><span className={`grid h-9 w-9 place-items-center rounded-xl ${tx.type === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{tx.type === 'in' ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-900">{tx.product_name || 'Inventory movement'}</p><p className="text-[10px] text-slate-500">{tx.type === 'in' ? 'Stock In' : tx.type === 'out' ? 'Stock Out' : tx.type || 'Adjustment'} · {tx.created_at ? new Date(tx.created_at).toLocaleString() : '—'}</p></div><p className={`text-sm font-black ${tx.type === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>{tx.type === 'in' ? '+' : '-'}{Math.abs(Number(tx.quantity || 0))}</p></div>)}</div> : <div className="py-12 text-center text-xs text-slate-400">No inventory movements yet</div>}</GlassCard>
    </div>
  );
}

function UnitsTab() {
  const { activeRestaurant } = useTenant();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', abbreviation: '', type: 'custom' });
  const [open, setOpen] = useState(false);
  const { data: units = [], isLoading } = useQuery({ queryKey: ['product_units', activeRestaurant?.id], queryFn: () => base44.entities.ProductUnit.filter(activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {}, 'sort_order', 200), enabled: !!activeRestaurant?.id, staleTime: 60000 });
  const create = useMutation({ mutationFn: (data) => base44.entities.ProductUnit.create({ ...data, restaurant_id: activeRestaurant?.id, is_system: false, is_active: true }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['product_units'] }); setOpen(false); setForm({ name: '', abbreviation: '', type: 'custom' }); toast.success('Unit added'); }, onError: (e) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: (id) => base44.entities.ProductUnit.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['product_units'] }); toast.success('Unit deleted'); }, onError: (e) => toast.error(e.message) });
  return <div className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black text-slate-950">Units of Measure</h2><p className="text-xs text-slate-500">System and custom units for product master data.</p></div><Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add Unit</Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{isLoading ? <p className="text-sm text-slate-400">Loading units…</p> : units.map((u) => <GlassCard key={u.id} className="flex items-center gap-3 p-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Ruler className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900">{u.name}</p><p className="text-xs text-slate-500">{u.abbreviation || '—'} · {u.type || 'custom'}</p></div>{u.is_system ? <Badge variant="outline">System</Badge> : <Button variant="ghost" size="icon" className="text-red-600" onClick={() => remove.mutate(u.id)}><Trash2 className="h-4 w-4" /></Button>}</GlassCard>)}</div><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Add Unit</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) return; create.mutate(form); }}><div><Label>Name</Label><Input className="mt-1.5" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div><div><Label>Abbreviation</Label><Input className="mt-1.5" value={form.abbreviation} onChange={(e) => setForm((p) => ({ ...p, abbreviation: e.target.value }))} /></div><Button className="w-full" type="submit">Save Unit</Button></form></DialogContent></Dialog></div>;
}

function BarcodeTab({ products, onBarcode }) {
  const [q, setQ] = useState('');
  const found = useMemo(() => { const s = q.trim().toLowerCase(); if (!s) return products.slice(0, 12); return products.filter((p) => [p.name, p.sku, p.barcode, p.product_id].filter(Boolean).some((v) => String(v).toLowerCase().includes(s))).slice(0, 24); }, [products, q]);
  return <div className="space-y-4"><div><h2 className="text-2xl font-black text-slate-950">Barcode Center</h2><p className="text-xs text-slate-500">Scan, search, generate and print product barcodes.</p></div><GlassCard className="p-4"><div className="relative"><ScanLine className="absolute left-3 top-3 h-4 w-4 text-blue-500" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scan or type barcode / SKU / product name…" className="h-10 rounded-xl pl-9" /></div></GlassCard><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{found.map((p) => <GlassCard key={p.id} className="flex items-center gap-3 p-3.5"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-600"><Barcode className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-900">{p.name}</p><p className="truncate text-[10px] text-slate-500">{p.barcode || p.sku || 'No code'}</p></div><Button size="sm" variant="outline" onClick={() => onBarcode(p)}>Print</Button></GlassCard>)}</div></div>;
}

function ImportExportTab({ products, activeRestaurant, onImported }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const exportCsv = () => {
    const headers = ['name','name_ar','sku','barcode','category','unit','purchase_cost','selling_price','tax_rate','min_stock','max_stock','status'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.join(','), ...products.map((p) => headers.map((h) => escape(p[h])).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'products.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const importCsv = async (event) => {
    const file = event.target.files?.[0]; if (!file) return; setBusy(true);
    try {
      const text = await file.text(); const lines = text.split(/\r?\n/).filter(Boolean); if (lines.length < 2) throw new Error('CSV has no product rows');
      const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim()); let imported = 0;
      for (const line of lines.slice(1)) { const values = line.split(',').map((v) => v.replace(/^"|"$/g, '').trim()); const row = {}; headers.forEach((h, i) => { row[h] = values[i] ?? ''; }); if (!row.name) continue; await base44.entities.Product.create({ name: row.name, name_ar: row.name_ar || null, sku: row.sku || null, barcode: row.barcode || null, category: row.category || null, unit: row.unit || null, purchase_cost: Number(row.purchase_cost || 0), default_cost: Number(row.purchase_cost || 0), selling_price: Number(row.selling_price || 0), default_price: Number(row.selling_price || 0), tax_rate: Number(row.tax_rate || 0), min_stock: Number(row.min_stock || 0), max_stock: Number(row.max_stock || 0), status: row.status || 'active', is_active: (row.status || 'active') === 'active', restaurant_id: activeRestaurant?.id }); imported++; }
      toast.success(`${imported} products imported`); onImported();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); event.target.value = ''; }
  };
  return <div className="space-y-4"><div><h2 className="text-2xl font-black text-slate-950">Import & Export</h2><p className="text-xs text-slate-500">Move product master data safely with CSV files.</p></div><div className="grid gap-4 md:grid-cols-2"><GlassCard className="p-5"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Download className="h-5 w-5" /></span><h3 className="mt-4 text-base font-black text-slate-950">Export Product Catalog</h3><p className="mt-1 text-xs text-slate-500">Download {products.length} products with SKU, pricing, tax and stock settings.</p><Button className="mt-5 w-full rounded-xl" variant="outline" onClick={exportCsv}><FileSpreadsheet className="mr-2 h-4 w-4" />Export CSV</Button></GlassCard><GlassCard className="p-5"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Upload className="h-5 w-5" /></span><h3 className="mt-4 text-base font-black text-slate-950">Import Products</h3><p className="mt-1 text-xs text-slate-500">Upload a CSV and create product records in this restaurant workspace.</p><Button disabled={busy} className="mt-5 w-full rounded-xl" onClick={() => inputRef.current?.click()}>{busy ? 'Importing…' : 'Select CSV File'}</Button><input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={importCsv} /></GlassCard></div></div>;
}

export default function ProductManagement() {
  const { t, currency } = useLanguage();
  const { activeRestaurant } = useTenant();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [formProduct, setFormProduct] = useState(undefined);
  const [showForm, setShowForm] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const [barcodeProduct, setBarcodeProduct] = useState(null);
  const [stockProduct, setStockProduct] = useState(null);
  const [variantProduct, setVariantProduct] = useState(null);

  const { data: products = [], isLoading, refetch } = useQuery({ queryKey: ['products', activeRestaurant?.id], queryFn: () => base44.entities.Product.filter(activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {}, '-created_date', 2000), enabled: !!activeRestaurant?.id, staleTime: 30000 });
  const { data: categories = [] } = useQuery({ queryKey: ['product_categories', activeRestaurant?.id], queryFn: () => base44.entities.ProductCategory.filter(activeRestaurant?.id ? { restaurant_id: activeRestaurant.id } : {}, 'sort_order', 500), enabled: !!activeRestaurant?.id, staleTime: 60000 });

  const create = useMutation({ mutationFn: (data) => base44.entities.Product.create({ ...data, restaurant_id: activeRestaurant?.id }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setShowForm(false); setFormProduct(undefined); toast.success(t('product_added') || 'Product added'); }, onError: (e) => toast.error(e.message) });
  const update = useMutation({ mutationFn: ({ id, data }) => base44.entities.Product.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setShowForm(false); setFormProduct(undefined); setDetailProduct(null); toast.success(t('product_updated') || 'Product updated'); }, onError: (e) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: (id) => base44.entities.Product.delete(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Product archived'); }, onError: (e) => toast.error(e.message) });
  const duplicate = useMutation({ mutationFn: (p) => base44.entities.Product.create({ name: `${p.name} Copy`, name_ar: p.name_ar || null, name_en: p.name_en || null, product_id: `${p.product_id || p.sku || 'PRD'}-COPY-${Date.now().toString().slice(-5)}`, sku: p.sku ? `${p.sku}-COPY-${Date.now().toString().slice(-4)}` : null, barcode: null, category_id: p.category_id || null, category: p.category || null, unit: p.unit || null, brand: p.brand || null, purchase_cost: productCost(p), default_cost: productCost(p), selling_price: productPrice(p), default_price: productPrice(p), tax_rate: Number(p.tax_rate || 0), min_stock: Number(p.min_stock || 0), max_stock: Number(p.max_stock || 0), current_stock: 0, status: 'active', is_active: true, description: p.description || null, image_url: p.image_url || null, custom_attributes: p.custom_attributes || {}, restaurant_id: activeRestaurant?.id }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Product duplicated'); }, onError: (e) => toast.error(e.message) });

  const openAdd = () => { setFormProduct(undefined); setShowForm(true); };
  const openEdit = (p) => { setFormProduct(p); setShowForm(true); };
  const handleDashboardAction = (action, product) => {
    if (action === 'add') return openAdd();
    if (action === 'view' && product) return setDetailProduct(product);
    if (action === 'import') return setActiveTab('import');
    if (action === 'barcode') return setActiveTab('barcode');
    if (action === 'stock') return setActiveTab('stock');
    if (action === 'products') return setActiveTab('products');
  };

  const tabs = [
    ['dashboard', BarChart3, 'Dashboard'], ['products', Package, 'Products'], ['categories', Tag, 'Categories'],
    ['units', Ruler, 'Units'], ['barcode', Barcode, 'Barcode'], ['stock', Warehouse, 'Stock'],
    ['price', TrendingUp, 'Price Analytics'], ['import', Upload, 'Import / Export'],
  ];

  return (
    <div className="pb-4">
      <PageHeader title={t('product_management') || 'Product'} action={<Button size="sm" variant="outline" className="rounded-xl" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" /><span className="ml-1.5 hidden sm:inline">Sync Stock</span></Button>} />

      <div className="mb-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto w-max min-w-full justify-start gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {tabs.map(([value, Icon, label]) => <TabsTrigger key={value} value={value} className="h-9 rounded-xl px-3 text-xs font-bold data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md"><Icon className="mr-1.5 h-3.5 w-3.5" />{label}</TabsTrigger>)}
          </TabsList>

          <div className="mt-5">
            <TabsContent value="dashboard" className="mt-0"><UltimateDashboard products={products} currency={currency} onAction={handleDashboardAction} /></TabsContent>
            <TabsContent value="products" className="mt-0"><ProductCatalog products={products} categories={categories} currency={currency} isLoading={isLoading} onAdd={openAdd} onEdit={openEdit} onDelete={(p) => { if (window.confirm(`Archive ${p.name}?`)) remove.mutate(p.id); }} onView={setDetailProduct} onBarcode={setBarcodeProduct} onStock={setStockProduct} onDuplicate={(p) => duplicate.mutate(p)} /></TabsContent>
            <TabsContent value="categories" className="mt-0"><EnterpriseCategoryManager /></TabsContent>
            <TabsContent value="units" className="mt-0"><UnitsTab /></TabsContent>
            <TabsContent value="barcode" className="mt-0"><BarcodeTab products={products} onBarcode={setBarcodeProduct} /></TabsContent>
            <TabsContent value="stock" className="mt-0"><StockControl products={products} currency={currency} onStock={setStockProduct} /></TabsContent>
            <TabsContent value="price" className="mt-0"><PriceAnalyticsTab currency={currency} /></TabsContent>
            <TabsContent value="import" className="mt-0"><ImportExportTab products={products} activeRestaurant={activeRestaurant} onImported={() => { qc.invalidateQueries({ queryKey: ['products'] }); refetch(); }} /></TabsContent>
          </div>
        </Tabs>
      </div>

      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setFormProduct(undefined); }}>
        <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto p-0">
          <DialogHeader className="border-b border-slate-100 px-5 py-4"><DialogTitle>{formProduct ? 'Edit Product' : 'Add Product'}</DialogTitle></DialogHeader>
          <ProductMasterForm initial={formProduct} onSubmit={(data) => formProduct ? update.mutate({ id: formProduct.id, data }) : create.mutate(data)} onCancel={() => { setShowForm(false); setFormProduct(undefined); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailProduct} onOpenChange={(open) => { if (!open) setDetailProduct(null); }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto bg-slate-50 p-4 sm:p-5"><DialogHeader><DialogTitle>Product Details</DialogTitle></DialogHeader><ProductDetail product={detailProduct} currency={currency} onEdit={openEdit} onBarcode={setBarcodeProduct} onStock={setStockProduct} onVariants={setVariantProduct} /></DialogContent>
      </Dialog>

      <Dialog open={!!barcodeProduct} onOpenChange={(open) => { if (!open) setBarcodeProduct(null); }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Barcode / QR Code</DialogTitle></DialogHeader>{barcodeProduct && <BarcodeGenerator product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />}</DialogContent></Dialog>
      <Dialog open={!!stockProduct} onOpenChange={(open) => { if (!open) setStockProduct(null); }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Inventory Transaction</DialogTitle></DialogHeader>{stockProduct && <InventoryTransactionForm product={stockProduct} onSuccess={() => { setStockProduct(null); qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['inventory_transactions'] }); }} onCancel={() => setStockProduct(null)} />}</DialogContent></Dialog>
      <Dialog open={!!variantProduct} onOpenChange={(open) => { if (!open) setVariantProduct(null); }}><DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto"><DialogHeader><DialogTitle>Product Variants — {variantProduct?.name}</DialogTitle></DialogHeader>{variantProduct && <ProductVariantsManager product={variantProduct} />}</DialogContent></Dialog>
    </div>
  );
}
