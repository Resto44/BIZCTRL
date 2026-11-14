import {postSupplierPayment} from '@/lib/supplierWorkspace';
/**
 * PurchaseInvoiceForm — Phase 7
 * Enterprise multi-line invoice form with:
 * - Header fields (invoice #, supplier, branch, dates, currency)
 * - Multi-line items (category, product, unit, qty, cost, discount, tax, line total)
 * - Additional costs (delivery, transport, customs, etc.)
 * - Partial payment section (cash, bank, POS, transfer)
 * - Attachment upload
 * - OCR scan trigger
 * - Approval workflow display
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { fetchProductBrandChoices } from '@/lib/productBrands';
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { usePurchaseProductsByCategory } from '@/hooks/usePurchaseProductsByCategory';
import {
  purchaseBrandOptions, purchaseProductsForBrand, purchaseProductBrand,
  clearPurchaseProductForFilter, selectPurchaseProduct,
} from '@/lib/purchaseInvoiceBrands';
import { usePurchaseCategoriesHierarchy } from '@/hooks/usePurchaseCategoriesHierarchy';
import BranchSelect from '@/components/shared/BranchSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Trash2, Package, Truck, AlertCircle, CheckCircle2,
  Paperclip, ScanLine, ChevronDown, ChevronUp,
  FileText, Save, X, PencilLine, Minus, UserRound,
  Store, WalletCards, ClipboardCheck
} from 'lucide-react';
import { format } from 'date-fns';
import {
  calcLineTotal, calcInvoiceTotals, normalizePurchaseLine,
  createPurchaseInvoice, updatePurchaseInvoice, addInvoicePayment,
  groupPurchaseLinesBySupplier, computeApprovalStatus
} from '@/lib/procurementEngine';
import OcrScanDialog from './OcrScanDialog';
import PurchaseExpenseOptions from './PurchaseExpenseOptions';
import { resumePurchaseSubmission } from '@/lib/purchaseSubmission';

const CURRENCIES = ['SAR', 'USD', 'AED', 'EGP', 'KWD', 'QAR', 'BHD', 'OMR', 'EUR', 'GBP'];
const PAYMENT_METHODS = ['cash', 'bank', 'pos', 'transfer'];
const ADDITIONAL_COST_TYPES = ['delivery', 'transport', 'customs', 'packaging', 'miscellaneous'];

const emptyItem = () => ({
  _id: Math.random().toString(36).slice(2),
  category: '',
  category_id: '',
  subcategory_id: '',
  brand: '',
  product_id: '',
  product_name: '',
  supplier_id: '',
  unit: '',
  quantity: 1,
  unit_cost: 0,
  discount: 0,
  tax: 0,
  line_total: 0,
});

const emptyPayment = () => ({
  _id: Math.random().toString(36).slice(2),
  amount: 0,
  payment_method: 'cash',
  notes: '',
  date: format(new Date(), 'yyyy-MM-dd'),
});

const emptyAdditionalCost = () => ({
  _id: Math.random().toString(36).slice(2),
  type: 'delivery',
  description: '',
  amount: 0,
});

/**
 * PurchaseInvoiceItemRow
 * Separated component to handle per-item hooks (Rules of Hooks)
 */
function PurchaseInvoiceItemRow({ 
  item, 
  idx, 
  itemsCount,
  updateItem, 
  removeItem, 
  supplierId,
  suppliers,
  multiSupplierMode,
  organizationBrands,
  brandsError,
  categories,
  categoriesTree
}) {
  const subcategories = categories.filter(category => category.parent_id === item.category_id);
  const itemSupplierId = multiSupplierMode ? item.supplier_id : supplierId;
  const selectedItemSupplier = multiSupplierMode ? suppliers.find(s => String(s.id) === String(item.supplier_id)) : null;
  const [expanded, setExpanded] = useState(() => !item.product_name && !item.product_id);
  const [brandSearch, setBrandSearch] = useState('');
  // Fetch products for this item's category/subcategory and supplier
  // Calling hook here is safe because it's the top level of this component
  const { products: categoryProducts = [], isLoading: productsLoading } = usePurchaseProductsByCategory(item.category_id, itemSupplierId, item.subcategory_id);
  // Brands come from this same tenant-, category-, and supplier-filtered
  // catalog, not an unrelated company brand or another supplier.
  const selectedBrand = purchaseProductBrand(categoryProducts, item.product_id, item.brand);
  const brandOptions = purchaseBrandOptions(categoryProducts, selectedBrand, organizationBrands);
  const visibleProducts = purchaseProductsForBrand(categoryProducts, selectedBrand);
  const query = brandSearch.trim().toLocaleLowerCase();
  const visibleBrands = brandOptions.filter(name =>
    !query || name.toLocaleLowerCase().includes(query) || name === selectedBrand,
  );
  useEffect(() => { setBrandSearch(''); }, [item.category_id, item.subcategory_id, item.supplier_id]);

  // Mobile number keyboards can emit input before change. Use the same canonical
  // state update for both events so quantity, cost, discount, and tax always
  // reach the calculation path immediately.
  const updateNumericItem = (field, event) => {
    const parsed = Number.parseFloat(event.currentTarget.value);
    updateItem(item._id, field, Number.isFinite(parsed) ? parsed : 0);
  };

  const adjustQuantity = (change) => {
    const nextQuantity = Math.max(0, Number(item.quantity || 0) + change);
    updateItem(item._id, 'quantity', nextQuantity);
  };

  return (
    <div className="border-t border-slate-200 bg-white first:border-t-0">
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1.4fr)_90px_122px_90px_100px_34px] sm:items-center sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{item.product_name || `New item ${idx + 1}`}</p>
          <p className="truncate text-[11px] text-slate-500">{multiSupplierMode ? (selectedItemSupplier?.name || 'Supplier not selected') + ' · ' : ''}Per {item.unit || 'unit'}</p>
        </div>

        <div className="hidden truncate text-sm font-medium text-slate-700 sm:block">{item.unit || '—'}</div>

        <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-start">
          <div className="inline-flex h-10 items-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <button type="button" onClick={() => adjustQuantity(-1)} className="flex h-full w-9 items-center justify-center text-slate-500 hover:bg-slate-50" aria-label={`Decrease ${item.product_name || `item ${idx + 1}`} quantity`}>
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-9 px-1 text-center text-sm font-semibold text-slate-900">{Number(item.quantity || 0).toLocaleString()}</span>
            <button type="button" onClick={() => adjustQuantity(1)} className="flex h-full w-9 items-center justify-center text-blue-700 hover:bg-blue-50" aria-label={`Increase ${item.product_name || `item ${idx + 1}`} quantity`}>
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="text-right sm:hidden">
            <p className="text-[10px] text-slate-500">Unit cost</p>
            <p className="text-xs font-semibold text-slate-800">{Number(item.unit_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="hidden text-sm font-medium tabular-nums text-slate-700 sm:block">{Number(item.unit_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        <div className="absolute right-14 mt-0 text-sm font-bold tabular-nums text-slate-950 sm:static sm:text-right">
          {calcLineTotal(item).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => setExpanded(value => !value)} className="absolute right-4 mt-0 h-8 w-8 text-blue-700 sm:static" aria-label={`Edit ${item.product_name || `item ${idx + 1}`}`} aria-expanded={expanded}>
          <PencilLine className="h-4 w-4" />
        </Button>
      </div>

      {expanded && <div className="space-y-2 border-t border-blue-100 bg-blue-50/40 p-3 sm:p-4">

      {multiSupplierMode && <div className="rounded-lg border border-blue-200 bg-white p-2.5" data-testid="purchase-line-supplier">
        <Label className="mb-1.5 block text-xs font-bold text-blue-900">Supplier for this product *</Label>
        <Select value={item.supplier_id || undefined} onValueChange={v => updateItem(item._id, 'supplier_id', v)}>
          <SelectTrigger className="h-11 w-full bg-white" aria-label="Supplier for this product"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
          <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Product Category *</Label>
          <Select value={item.category_id} onValueChange={v => {
            const cat = categories.find(c => c.id === v);
            updateItem(item._id, 'category_id', v);
            updateItem(item._id, 'category', cat?.name || '');
          }}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {categoriesTree.map(rootCat => (
                <div key={rootCat.id}>
                  <SelectItem value={rootCat.id}>
                    {rootCat.icon || '📦'} {rootCat.name}{rootCat.branch_id ? ' · Branch' : ''}
                  </SelectItem>
                  {rootCat.children && rootCat.children.length > 0 && (
                    rootCat.children.map(childCat => (
                      <SelectItem key={childCat.id} value={childCat.id} className="pl-6">
                        └─ {childCat.icon || '📦'} {childCat.name}
                      </SelectItem>
                    ))
                  )}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Sub-category</Label>
          <Select value={item.subcategory_id} onValueChange={v => {
            updateItem(item._id, 'subcategory_id', v);
          }} disabled={!item.category_id || subcategories.length === 0}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0" disabled={!item.category_id || subcategories.length === 0}>
              <SelectValue placeholder={item.category_id ? (subcategories.length ? "Select..." : "No sub-categories") : "Select category first"} />
            </SelectTrigger>
            <SelectContent>
              {subcategories.map(subCat => (
                <SelectItem key={subCat.id} value={subCat.id}>
                  {subCat.icon || '📦'} {subCat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0" data-testid="purchase-line-brand">
          <Label className="mb-1 block text-xs font-semibold text-slate-700">Brand</Label>
          {brandOptions.length > 15 && (
            <Input aria-label="Search purchase product brands" value={brandSearch}
              onChange={event => setBrandSearch(event.target.value)}
              placeholder="Search brands..." className="mb-1.5 h-10 w-full bg-white text-sm" />
          )}
          <Select value={selectedBrand ? `brand:${selectedBrand}` : '__all__'}
            onValueChange={value => { setBrandSearch(''); updateItem(item._id, 'brand', value === '__all__' ? '' : value.slice(6)); }}
            disabled={!item.category_id && !itemSupplierId}>
            <SelectTrigger className="h-11 w-full min-w-0 bg-white text-sm" aria-label="Select product brand">
              <SelectValue placeholder="Select brand" />
            </SelectTrigger>
            <SelectContent className="max-h-[min(50dvh,360px)]">
              <SelectItem value="__all__">— All brands —</SelectItem>
              {visibleBrands.map(brand => (
                <SelectItem key={brand} value={`brand:${brand}`}>{brand}</SelectItem>
              ))}
              {brandOptions.length === 0 && <div className="p-2 text-xs text-slate-500">
                {productsLoading ? 'Loading brands...' : 'No brands saved for this business yet. Add them in Product Master.'}
              </div>}
            </SelectContent>
          </Select>
          {brandsError && <p className="mt-1 text-xs text-amber-700">Could not load all saved brands; available category brands remain selectable.</p>}
        </div>
        <div className="min-w-0">
          <Label className="mb-1 block text-xs font-semibold text-slate-700">Product *</Label>
          <Select value={item.product_id || undefined} onValueChange={v => {
            const product = visibleProducts.find(p => String(p.id) === String(v));
            if (product) updateItem(item._id, 'selected_product', product);
          }} disabled={!item.category_id && !itemSupplierId}>
            <SelectTrigger className="h-11 text-sm w-full min-w-0" aria-label="Select purchase product">
              <SelectValue placeholder={(item.category_id || itemSupplierId) ? (visibleProducts.length === 0 ? 'No matching products.' : 'Select...') : 'Select category or supplier first'} />
            </SelectTrigger>
            <SelectContent>
              {visibleProducts.length === 0 && (item.category_id || itemSupplierId) ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No product matches this brand, category and supplier.</div>
              ) : (
                visibleProducts.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)
              )}
            </SelectContent>
          </Select>
          {!item.product_id && (
            <Input value={item.product_name} onChange={e => updateItem(item._id, 'product_name', e.target.value)}
              placeholder="Or type product name" className="h-10 text-sm mt-1 w-full min-w-0" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Unit</Label>
          <Input value={item.unit} onChange={e => updateItem(item._id, 'unit', e.target.value)} placeholder="kg" className="h-8 text-xs w-full min-w-0" />
        </div>
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Quantity</Label>
          <Input type="number" min="0" step="0.001" value={item.quantity}
            onInput={e => updateNumericItem('quantity', e)}
            onChange={e => updateNumericItem('quantity', e)}
            onBlur={e => updateNumericItem('quantity', e)}
            className="h-8 text-xs w-full min-w-0" />
        </div>
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Unit Cost</Label>
          <Input type="number" min="0" step="0.01" value={item.unit_cost}
            onInput={e => updateNumericItem('unit_cost', e)}
            onChange={e => updateNumericItem('unit_cost', e)}
            onBlur={e => updateNumericItem('unit_cost', e)}
            className="h-8 text-xs w-full min-w-0" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Discount</Label>
          <Input type="number" min="0" step="0.01" value={item.discount}
            onInput={e => updateNumericItem('discount', e)}
            onChange={e => updateNumericItem('discount', e)}
            onBlur={e => updateNumericItem('discount', e)}
            className="h-8 text-xs w-full min-w-0" />
        </div>
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Tax %</Label>
          <Input type="number" min="0" max="100" step="0.1" value={item.tax}
            onInput={e => updateNumericItem('tax', e)}
            onChange={e => updateNumericItem('tax', e)}
            onBlur={e => updateNumericItem('tax', e)}
            className="h-8 text-xs w-full min-w-0" />
        </div>
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Line Total</Label>
          <div className="h-8 flex items-center px-2 rounded-md bg-primary/5 border border-border text-xs font-semibold text-primary truncate">
            {calcLineTotal(item).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        {itemsCount > 1 && <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs text-red-600" onClick={() => removeItem(item._id)}><Trash2 className="h-3.5 w-3.5" /> Remove item</Button>}
      </div>
      </div>}
    </div>
  );
}

function InvoiceAccordion({ title, subtitle, icon: Icon, verified = false, open, onToggle, trailing, children }) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5" aria-expanded={open}>
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blue-600 text-white shadow-sm shadow-blue-200"><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">{title}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-slate-700">{subtitle || 'Not selected'}</span>
            {verified && <span className="inline-flex flex-none items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Verified</span>}
          </span>
        </span>
        {trailing}
        {open ? <ChevronUp className="h-5 w-5 flex-none text-slate-500" /> : <ChevronDown className="h-5 w-5 flex-none text-slate-500" />}
      </button>
      {open && <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">{children}</div>}
    </Card>
  );
}

export default function PurchaseInvoiceForm({ invoice = null, supplier = null, onSuccess, onCancel }) {
  const { ownerFilter, branches, activeRestaurantId: restaurantId } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();

  const isEdit = !!invoice;

  // ── Form state ─────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    invoice_number: invoice?.invoice_number || '',
    supplier_id: invoice?.supplier_id || supplier?.id || '',
    supplier_name: invoice?.supplier_name || supplier?.name || '',
    supplier_email: invoice?.supplier_email || supplier?.email || '',
    branch: invoice?.branch || '',
    date: invoice?.date || format(new Date(), 'yyyy-MM-dd'),
    due_date: invoice?.due_date || '',
    currency: invoice?.currency || 'SAR',
    notes: invoice?.notes || '',
    status: invoice?.status || 'draft',
  });

  // The optional expense association is reference-only; it never adds a cost line.
  const [expenseLink, setExpenseLink] = useState({
    expense_id:invoice?.expense_id||null,expense_category_id:invoice?.expense_category_id||null,
  });

  const [items, setItems] = useState(
    invoice?.items?.length
      ? invoice.items.map(i => ({ ...normalizePurchaseLine(i), _id: Math.random().toString(36).slice(2) }))
      : [emptyItem()]
  );

  const [additionalCosts, setAdditionalCosts] = useState(
    invoice?.additional_costs?.length ? invoice.additional_costs.map(c => ({ ...c, _id: Math.random().toString(36).slice(2) })) : []
  );

  const [payments, setPayments] = useState([emptyPayment()]);
  const [payFullAmount, setPayFullAmount] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [attachments, setAttachments] = useState(invoice?.attachment_urls || []);
  const [, setOcrMeta] = useState(null);
  const [vatNumber, setVatNumber] = useState(invoice?.vat_number || '');
  const [paymentTerms, setPaymentTerms] = useState(invoice?.payment_terms || '');
  const [openSection, setOpenSection] = useState(null);
  const [showLineItems, setShowLineItems] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitMode, setSubmitMode] = useState(null);
  const savingRef = useRef(false);
  const submissionRef = useRef({ invoice: null, completedPayments: new Set() });
  const [multiSupplierMode, setMultiSupplierMode] = useState(false);
  const batchRef = useRef({ mode: null, completed: new Map() });
  // activeRestaurantId already destructured above as restaurantId

  // ── Auto-numbering ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit && !form.invoice_number && restaurantId) {
      const fetchNumber = async () => {
        try {
          const { data, error } = await supabase.rpc('generate_purchase_invoice_number', {
            p_restaurant_id: restaurantId,
            p_date: form.date
          });
          if (!error && data) {
            setForm(f => ({ ...f, invoice_number: data }));
          }
        } catch (err) {
          console.error('[PurchaseInvoiceForm] Failed to generate invoice number:', err);
        }
      };
      fetchNumber();
    }
  }, [isEdit, restaurantId, form.date]);

  // ── Data fetches ───────────────────────────────────────────────────────
  // Use get_org_suppliers() RPC to load ALL suppliers for this organization:
  // both manually-created (created_by = owner email) and approved suppliers
  // from Request Center (created_by = owner email via erp_decide_membership).
  // This is the unified supplier source — no separate sources.
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers_org', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return [];
      const { data, error } = await supabase.rpc('get_org_suppliers');
      if (error) {
        console.warn('[PurchaseInvoiceForm] get_org_suppliers error:', error.message);
        // Fallback to created_by filter for backward compat
        return base44.entities.Supplier.filter(ownerFilter || {}, 'name', 500);
      }
      return data || [];
    },
    enabled: !!restaurantId,
  });

  // Share the same RLS-scoped saved brands as Product Master.
  // The category/supplier filtered products remain the only source of selectable
  // Product IDs; brand names alone never authorize a different supplier item.
  const { data: organizationBrands = [], isError: brandsError } = useQuery({
    queryKey: ['product-brand-choices', restaurantId],
    queryFn: () => fetchProductBrandChoices(supabase, restaurantId),
    enabled: Boolean(restaurantId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Use hierarchical categories hook
  const { categories, tree: categoriesTree } = usePurchaseCategoriesHierarchy();

  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id);
  const resolvedVatNumber = vatNumber || selectedSupplier?.vat_number || selectedSupplier?.tax_number || '';
  const resolvedPaymentTerms = paymentTerms || selectedSupplier?.payment_terms || '';

  // ── Totals ─────────────────────────────────────────────────────────────
  const totals = calcInvoiceTotals(items, additionalCosts);
  const batchGroups = multiSupplierMode ? (() => {
    try { return groupPurchaseLinesBySupplier(items, suppliers); }
    catch { return []; }
  })() : [];
  const batchTotal = batchGroups.reduce((sum, group) => sum + Math.round(group.totals.grandTotal * 100), 0) / 100;
  const paymentTotal = payFullAmount
    ? totals.grandTotal
    : payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const remaining = payFullAmount ? 0 : totals.grandTotal - paymentTotal;
  const displaySubtotal = Math.max(0, totals.subtotal - totals.taxAmount);
  const selectedBranch = branches.find(branch => branch.key === form.branch || branch.branch_key === form.branch);
  const selectedBranchName = selectedBranch?.name || selectedBranch?.branch_name || form.branch;
  const paymentMethodLabel = paymentTotal > 0
    ? payments[0]?.payment_method || 'Payment entered'
    : resolvedPaymentTerms || (form.due_date ? 'Credit' : 'Not configured');

  // ── Pay Full Amount handler ────────────────────────────────────────────
  const handlePayFullAmount = (checked) => {
    setPayFullAmount(checked);
    if (checked && totals.grandTotal > 0) {
      setPayments([{ ...emptyPayment(), amount: totals.grandTotal.toFixed(2) }]);
    } else if (!checked) {
      setPayments([emptyPayment()]);
    }
  };

  // Sync payment amount when grand total changes while Pay Full Amount is on
  useEffect(() => {
    if (payFullAmount && totals.grandTotal > 0) {
      setPayments(prev => [{ ...(prev[0] || emptyPayment()), amount: totals.grandTotal.toFixed(2) }]);
    }
  }, [payFullAmount, totals.grandTotal]);

  // ── Item handlers ──────────────────────────────────────────────────────
  const updateItem = useCallback((id, field, value) => {
    setItems(prev => prev.map(item => {
      if (item._id !== id) return item;
      if (field === 'selected_product') {
        return normalizePurchaseLine(selectPurchaseProduct(item, value));
      }
      if (['category_id', 'subcategory_id', 'supplier_id', 'brand'].includes(field)) {
        return normalizePurchaseLine(clearPurchaseProductForFilter(item, field, value));
      }
      return normalizePurchaseLine({ ...item, [field]: value });
    }));
  }, []);

  const addItem = () => setItems(prev => [...prev, {
    ...emptyItem(), supplier_id: multiSupplierMode ? (prev[prev.length - 1]?.supplier_id || '') : '',
  }]);
  const removeItem = (id) => setItems(prev => prev.filter(item => item._id !== id));

  // ── Additional cost handlers ───────────────────────────────────────────
  const updateAdditionalCost = (id, field, value) => {
    setAdditionalCosts(prev => prev.map(c => c._id === id ? { ...c, [field]: value } : c));
  };
  const addAdditionalCost = () => setAdditionalCosts(prev => [...prev, emptyAdditionalCost()]);
  const removeAdditionalCost = (id) => setAdditionalCosts(prev => prev.filter(c => c._id !== id));

  // ── Payment handlers ───────────────────────────────────────────────────
  const updatePayment = (id, field, value) => {
    setPayments(prev => prev.map(p => p._id === id ? { ...p, [field]: value } : p));
  };
  const addPayment = () => setPayments(prev => [...prev, emptyPayment()]);
  const removePayment = (id) => setPayments(prev => prev.filter(p => p._id !== id));

  // ── OCR pre-fill ───────────────────────────────────────────────────────
  const handleOcrResult = (extracted) => {
    const normalizedSupplierName = String(extracted.supplier_name || '').trim().toLocaleLowerCase();
    const matchedSupplier = suppliers.find(supplier =>
      String(supplier.name || '').trim().toLocaleLowerCase() === normalizedSupplierName,
    );
    setForm(f => ({
      ...f,
      invoice_number: extracted.invoice_number || f.invoice_number,
      date: extracted.date || f.date,
      due_date: extracted.due_date || f.due_date,
      currency: extracted.currency || f.currency,
      supplier_id: matchedSupplier?.id || f.supplier_id,
      supplier_name: matchedSupplier?.name || extracted.supplier_name || f.supplier_name,
      supplier_email: matchedSupplier?.email || f.supplier_email,
    }));
    setVatNumber(extracted.vat_number || matchedSupplier?.vat_number || matchedSupplier?.tax_number || '');
    setPaymentTerms(extracted.payment_terms || matchedSupplier?.payment_terms || '');
    setOcrMeta({
      ...(extracted.__ocr || {}),
      invoiceTotal: Number(extracted.total_amount || extracted.invoice_total || 0),
      subtotal: Number(extracted.subtotal || 0),
      taxAmount: Number(extracted.tax_amount || 0),
      confidence: Number(extracted.overall_confidence || extracted.__ocr?.confidence || 0),
      fieldConfidence: extracted.field_confidence || {},
    });
    if (extracted.__ocr?.fileUrl?.startsWith('http')) {
      setAttachments(prev => prev.includes(extracted.__ocr.fileUrl) ? prev : [...prev, extracted.__ocr.fileUrl]);
    }
    if (Array.isArray(extracted.items) && extracted.items.length > 0) {
      setItems(extracted.items.map(line => normalizePurchaseLine({
        ...emptyItem(),
        product_name: line.description || line.product_name || '',
        unit: line.unit || '',
        quantity: Number(line.quantity || 1),
        unit_cost: Number(line.unit_price || line.unit_cost || 0),
        tax: Number(line.tax_rate || line.tax || 0),
        _ocr_confidence: Number(line.confidence || 0),
      })));
    }
    setShowOcr(false);
  };

  // ── File attachment ────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const path = `invoices/${Date.now()}_${file.name}`;
      const { data, error: uploadError } = await supabase.storage.from('attachments').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path);
      setAttachments(prev => [...prev, publicUrl]);
    } catch (err) {
      console.error('Upload error:', err);
      // Fallback: store file name as placeholder
      setAttachments(prev => [...prev, `[file:${file.name}]`]);
    }
  };

  // A receiving session is NOT a ledger invoice. Each supplier gets its own
  // canonical invoice, independent payable and independently recorded payments.
  // Keep successful writes in memory so a partial request failure cannot create
  // the same supplier invoice twice on a user retry.
  const handleSupplierBatchSubmit = async (mode) => {
    if (savingRef.current) return;
    setError('');
    if (isEdit || supplier) {
      setError('Multi-supplier entry is available only for a new purchase session.');
      return;
    }
    const branch = branches.find(b => b.key === form.branch || b.branch_key === form.branch);
    if (!restaurantId || !branch?.id) {
      setError('Select an authorized receiving branch before saving supplier invoices.');
      return;
    }
    const baseNumber = String(form.invoice_number || '').trim();
    if (!baseNumber) {
      setError('An invoice batch number is required before splitting supplier invoices.');
      return;
    }
    // A combined payment, expense reference or overhead has no unambiguous
    // supplier allocation. Refuse it rather than mis-posting another party's debt.
    if (payFullAmount || payments.some(p => Number(p.amount) !== 0 || !Number.isFinite(Number(p.amount))) ||
      additionalCosts.some(cost => Number(cost.amount) !== 0) ||
      expenseLink.expense_id || expenseLink.expense_category_id) {
      setError('For multiple suppliers, record payments, additional costs and expense references separately on each supplier invoice.');
      return;
    }
    let groups;
    try {
      groups = groupPurchaseLinesBySupplier(items, suppliers);
      if (groups.length < 2) throw new Error('Select at least two different suppliers, or use Single supplier mode.');
      // Validate every supplier before the first write, avoiding a partial
      // batch because a later product/quantity is invalid.
      if (mode !== 'draft') {
        for (const group of groups) {
          for (const line of group.items) {
            const quantity = Number(line.quantity), cost = Number(line.unit_cost);
            const discount = Number(line.discount || 0), tax = Number(line.tax || 0);
            if ((!line.product_id && !String(line.product_name || '').trim()) ||
              !Number.isFinite(quantity) || quantity <= 0 ||
              !Number.isFinite(cost) || cost < 0 ||
              !Number.isFinite(discount) || discount < 0 || discount > quantity * cost ||
              !Number.isFinite(tax) || tax < 0 || tax > 100) {
              throw new Error(`Review all product names, quantities, costs, discounts and tax for ${group.supplierName}.`);
            }
          }
        }
      }
    } catch (validationError) {
      setError(validationError.message);
      return;
    }
    const batchGrandTotal = Math.round(groups.reduce((sum, group) => sum +
      Math.round(group.totals.grandTotal * 100), 0)) / 100;
    // A 20-party purchase must not evade the standard Owner approval threshold
    // merely by splitting a large session into small supplier invoices.
    if (mode !== 'draft' && computeApprovalStatus(batchGrandTotal) === 'pending') {
      setError('This combined purchase exceeds the approval threshold. Save separate supplier drafts for Owner review before posting.');
      return;
    }
    const fingerprint = JSON.stringify({
      restaurantId, branchId: branch.id, baseNumber, mode, date: form.date, currency: form.currency,
      groups: groups.map(g => [g.supplierId, g.items, g.totals.grandTotal]),
    });
    const progress = batchRef.current;
    if (progress.blocked) {
      setError('A supplier invoice may have been saved but its posting is incomplete. Review Purchase History and Supplier Ledger before continuing.');
      return;
    }
    if (progress.completed.size && (progress.mode !== mode || progress.fingerprint !== fingerprint)) {
      setError('Part of this batch was saved. Do not change its products or mode; retry remaining suppliers, or inspect the already saved invoices.');
      return;
    }
    progress.mode = mode;
    progress.fingerprint = fingerprint;
    savingRef.current = true;
    setSaving(true);
    setSubmitMode(mode);
    try {
      for (let index = 0; index < groups.length; index += 1) {
        const group = groups[index];
        if (progress.completed.has(group.supplierId)) continue;
        const invoiceNumber = `${baseNumber}-S${String(index + 1).padStart(2, '0')}`;
        const { data: duplicates, error: duplicateError } = await supabase
          .from('supplier_invoices')
          .select('id, invoice_number')
          .eq('restaurant_id', restaurantId)
          .eq('branch_id', branch.id)
          .eq('supplier_id', group.supplierId)
          .eq('invoice_number', invoiceNumber)
          .limit(1);
        if (duplicateError) throw new Error('Cannot verify duplicate purchase invoices. No further suppliers have been saved.');
        if (duplicates?.length) {
          progress.blocked = true;
          throw new Error(`Invoice ${invoiceNumber} exists for ${group.supplierName}. Review the supplier account before continuing; no duplicate was created.`);
        }
        const cleanItems = group.items.map(({ _id, _ocr_confidence, ...line }) => normalizePurchaseLine(line));
        const invoiceData = {
          ...form,
          invoice_number: invoiceNumber,
          supplier_id: group.supplierId,
          supplier_name: group.supplierName,
          supplier_email: group.supplierEmail,
          restaurant_id: restaurantId,
          branch_id: branch.id,
          paid_amount: 0,
          expense_id: null,
          expense_category_id: null,
          attachment_urls: attachments,
          notes: [form.notes, `Purchase batch ${baseNumber} · Supplier ${index + 1}/${groups.length}`].filter(Boolean).join('\n'),
        };
        try {
          const saved = await createPurchaseInvoice({
            invoiceData, items: cleanItems, additionalCosts: [], createdBy: user?.email, mode,
          });
          // Read back the canonical supplier boundary and DB-recalculated
          // amount before considering this group complete. Do not silently
          // attribute another supplier's payable or mismatched tax/total.
          if (!saved?.id ||
            String(saved.supplier_id) !== String(group.supplierId) ||
            String(saved.restaurant_id) !== String(restaurantId) ||
            String(saved.branch_id) !== String(branch.id) ||
            !Number.isFinite(Number(saved.total_amount)) ||
            Math.abs(Number(saved.total_amount) - group.totals.grandTotal) > 0.005) {
            progress.blocked = true;
            throw new Error(`Supplier attribution or posted amount mismatch for ${invoiceNumber}. Review saved invoice before continuing.`);
          }
          progress.completed.set(group.supplierId, saved);
        } catch (writeError) {
          // An insert may succeed before an inventory/debt callback fails.
          // Do not assume it rolled back, and NEVER insert the same invoice again.
          const { data: found, error: verificationError } = await supabase
            .from('supplier_invoices').select('id,invoice_number')
            .eq('restaurant_id',restaurantId).eq('branch_id',branch.id)
            .eq('supplier_id',group.supplierId).eq('invoice_number',invoiceNumber).limit(1);
          if (verificationError || found?.length) {
            progress.blocked = true;
            throw new Error(`The status of ${invoiceNumber} needs manual verification in Purchase History. Do not retry it automatically. ${writeError.message || ''}`);
          }
          throw writeError;
        }
      }
      for (const key of ['supplier_invoices','supplier_invoices_dash','inventory',
        'debt_records','purchases','supplier_payments','supplier-ledger',
        'suppliers','dashboard_metrics','procurement_kpis']) {
        qc.invalidateQueries({queryKey:[key]});
      }
      onSuccess?.([...progress.completed.values()]);
    } catch (saveError) {
      setError(`${progress.completed.size}/${groups.length} supplier invoices saved. ${saveError.message || 'Batch incomplete.'} Retry only the remaining suppliers; existing invoices will not be duplicated.`);
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSubmitMode(null);
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e, mode = 'post') => {
    e.preventDefault();
    if (multiSupplierMode) return handleSupplierBatchSubmit(mode);
    if (savingRef.current) return;
    setError('');

    const isDraft = mode === 'draft';

    if (!form.branch) { setError('Branch is required'); return; }
    
    // Minimal validation: must have either a selected supplier or a typed name
    const supplierId = supplier?.id || (form.supplier_id && form.supplier_id.trim() !== '' ? form.supplier_id : null);
    const supplierName = supplier?.name || (form.supplier_name && form.supplier_name.trim() !== '' ? form.supplier_name : null);
    
    if (!isDraft && !supplierId && !supplierName) {
      setError('Supplier selection or name is required');
      return;
    }
    if (items.some(item => item.supplier_id &&
        (!supplierId || String(item.supplier_id) !== String(supplierId)))) {
      setError('An item belongs to a different supplier. Switch to multi-supplier mode or select the correct supplier before saving.');
      return;
    }

    if (!isDraft && (items.length === 0 || items.every(i => !i.product_name && !i.product_id))) {
      setError('At least one line item is required'); return;
    }
    if (!isDraft && items.some((item) => Number(item.quantity) <= 0 || Number(item.unit_cost) < 0 || Number(item.discount || 0) < 0 || Number(item.tax || 0) < 0 || Number(item.tax || 0) > 100)) {
      setError('Every purchase line requires a positive quantity, a non-negative cost and discount, and tax between 0 and 100%.'); return;
    }
    const outstandingBalance = Math.max(0, totals.grandTotal - Number(invoice?.paid_amount || 0));
    if (!isDraft && paymentTotal > outstandingBalance + 0.005) {
      setError('Payment amount cannot exceed the outstanding invoice balance.'); return;
    }

    savingRef.current = true;
    setSaving(true);
    setSubmitMode(mode);
    try {
      const cleanItems = items.map(({ _id, _ocr_confidence, ...i }) => normalizePurchaseLine(i));
      const cleanCosts = additionalCosts.map(({ _id, ...c }) => c);

      // Resolve branch_id UUID from branch key string
      const selectedBranch = branches.find(b => b.key === form.branch || b.branch_key === form.branch);
      const branchId = selectedBranch?.id || null;

      // Resolve supplier email from suppliers list if not already set
      const supplierObj = supplierId ? suppliers.find(s => s.id === supplierId) : null;
      const supplierEmail = form.supplier_email || supplierObj?.email || null;

      const invoicePayload = {
        ...form,
        supplier_id: supplierId, // Sanitize: ensure "" becomes null for UUID column
        supplier_name: supplierName || form.supplier_name,
        supplier_email: supplierEmail || null,
        attachment_urls: attachments,
        // Always include restaurant_id and branch_id so RLS erp_scope_insert passes
        restaurant_id: restaurantId || null,
        branch_id: branchId,
        expense_id:expenseLink.expense_id||null,
        expense_category_id:expenseLink.expense_category_id||null,
      };

      // Prevent the common accidental duplicate when an invoice number is
      // reused for the same supplier/branch. Keep existing ledger history intact.
      // This is an early UX safeguard, not a replacement for DB idempotency.
      const invoiceNumber = String(invoicePayload.invoice_number || '').trim();
      if (!isEdit && !submissionRef.current.invoice && restaurantId && supplierId && branchId && invoiceNumber) {
        const { data: existingInvoice, error: duplicateLookupError } = await supabase
          .from('supplier_invoices')
          .select('id, invoice_number')
          .eq('restaurant_id', restaurantId)
          .eq('supplier_id', supplierId)
          .eq('branch_id', branchId)
          .eq('invoice_number', invoiceNumber)
          .limit(1);
        if (duplicateLookupError) throw new Error('Could not verify the invoice number. Retry before saving; no new invoice was posted.');
        if (existingInvoice?.length) {
          throw new Error(`Invoice ${invoiceNumber} already exists for this supplier and branch. Open Supplier Ledger and review the existing invoice instead of posting a duplicate.`);
        }
      }

      const validPayments = isDraft ? [] : payments.filter(p => parseFloat(p.amount) > 0);
      const savedInvoice = await resumePurchaseSubmission({
        state: submissionRef.current,
        saveInvoice: () => isEdit
          ? updatePurchaseInvoice({ invoiceId: invoice.id, invoiceData: invoicePayload, items: cleanItems, additionalCosts: cleanCosts, createdBy: user?.email, mode })
          : createPurchaseInvoice({ invoiceData: invoicePayload, items: cleanItems, additionalCosts: cleanCosts, createdBy: user?.email, mode }),
        payments: validPayments,
        savePayment: (saved, pmt) => (supplier ? postSupplierPayment : addInvoicePayment)({requestId: pmt.requestId ||= crypto.randomUUID(), invoiceId: saved.id, amount: parseFloat(pmt.amount), paymentMethod: pmt.payment_method, notes: pmt.notes, date: pmt.date, createdBy: user?.email }),
        onInvoiceSaved: saved => setForm(current => ({ ...current, status: saved.status })),
      });

      qc.invalidateQueries({ queryKey: ['supplier_invoices'] });
      // After a posted or updated invoice links a fixed/variable expense,
      // Expenses must show the reference in its purchase history immediately.
      // No Expense insert happens here; supplier_invoices is source of truth.
      qc.invalidateQueries({ queryKey: ['expense_purchase_invoice_history'] });
      qc.invalidateQueries({ queryKey: ['supplier_invoices_dash'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['debt_records'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      // Refresh treasury, supplier ledger, and dashboard after payment
      qc.invalidateQueries({ queryKey: ['wallet_transactions'] });
      qc.invalidateQueries({ queryKey: ['wallet_transactions_dash'] });
      qc.invalidateQueries({ queryKey: ['supplier_payments'] });
      qc.invalidateQueries({ queryKey: ['supplier-ledger'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });

      onSuccess?.(savedInvoice);
    } catch (err) {
      setError(submissionRef.current.invoice ? `Invoice ${submissionRef.current.invoice.invoice_number || submissionRef.current.invoice.id} is saved. Payment failed; retry the remaining payments. ${err.message || ''}` : err.message || 'Failed to save invoice');
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSubmitMode(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <form onSubmit={e => handleSubmit(e, 'post')} className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 text-slate-950">
      <header className="flex flex-none items-center gap-3 bg-white px-4 py-4 sm:px-5">
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="h-10 w-10 flex-none rounded-full" aria-label="Close purchase invoice">
          <X className="h-6 w-6" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Purchase Invoice</h2>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-slate-500">{form.invoice_number || 'Invoice number pending'}</span>
            <span className="inline-flex flex-none items-center gap-1.5 rounded-full bg-orange-50 px-2 py-1 text-[11px] font-bold capitalize text-orange-600">
              <span className="h-2 w-2 rounded-full bg-orange-500" />{form.status}
            </span>
          </div>
        </div>
        <Button type="button" variant="outline" disabled={!!submissionRef.current.invoice} onClick={() => setShowOcr(true)} className="h-10 flex-none gap-2 rounded-lg border-blue-500 px-3 font-bold text-blue-700 hover:bg-blue-50">
          <ScanLine className="h-4 w-4" /> Scan
        </Button>
      </header>

      <div inert={submissionRef.current.invoice || (multiSupplierMode && batchRef.current.completed.size) ? '' : undefined} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
        <div className="mx-auto max-w-3xl space-y-3.5 pb-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />{error}
            </div>
          )}

          <Card className="grid grid-cols-4 divide-x divide-slate-200 overflow-hidden border-slate-200 bg-white px-1 py-4 shadow-sm">
            <div className="min-w-0 px-2 text-center sm:px-4"><p className="text-[11px] text-slate-500 sm:text-sm">Items</p><p className="mt-1 truncate text-lg font-black text-slate-950 sm:text-xl">{items.length}</p></div>
            <div className="min-w-0 px-2 text-center sm:px-4"><p className="text-[11px] text-slate-500 sm:text-sm">Subtotal</p><p className="mt-1 truncate text-sm font-black text-slate-950 sm:text-xl"><span className="me-1 text-[10px] font-medium text-slate-500 sm:text-sm">{form.currency}</span>{displaySubtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
            <div className="min-w-0 px-2 text-center sm:px-4"><p className="text-[11px] text-slate-500 sm:text-sm">VAT</p><p className="mt-1 truncate text-sm font-black text-slate-950 sm:text-xl"><span className="me-1 text-[10px] font-medium text-slate-500 sm:text-sm">{form.currency}</span>{totals.taxAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
            <div className="min-w-0 px-2 text-center sm:px-4"><p className="text-[11px] text-slate-500 sm:text-sm">Total</p><p className="mt-1 truncate text-sm font-black text-blue-700 sm:text-xl"><span className="me-1 text-[10px] font-medium text-slate-500 sm:text-sm">{form.currency}</span>{totals.grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
          </Card>

          <Card data-testid="purchase-supplier-mode" className="border-blue-200 bg-white p-3 sm:p-4">
            <label className="flex items-center gap-3 text-sm font-bold text-slate-900">
              <input type="checkbox" className="h-5 w-5 accent-blue-600" checked={multiSupplierMode}
                disabled={isEdit || !!supplier || saving || !!submissionRef.current.invoice || batchRef.current.completed.size > 0}
                onChange={e => {
                  const enabled = e.target.checked;
                  if (!enabled) {
                    const previousSuppliers = [...new Set(items.map(item => item.supplier_id).filter(Boolean))];
                    if (previousSuppliers.length > 1) {
                      setError('Different suppliers are selected. Keep multi-supplier mode or separate these items before switching to a single supplier.');
                      return;
                    }
                    if (previousSuppliers.length === 1) {
                      const selected = suppliers.find(s => String(s.id) === String(previousSuppliers[0]));
                      setForm(current => ({...current,supplier_id: previousSuppliers[0],
                        supplier_name: selected?.name || '',supplier_email: selected?.email || ''}));
                    }
                  }
                  setMultiSupplierMode(enabled);
                  if (enabled && form.supplier_id) {
                    setItems(previous => previous.map(item => ({
                      ...item, supplier_id: item.supplier_id || form.supplier_id,
                    })));
                  }
                  setError('');
                }}/>
              Purchase from multiple suppliers (up to 20)
            </label>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Choose the supplier for each product. Every supplier gets its own invoice and payable,
              never one shared debt.
            </p>
          </Card>
          {multiSupplierMode && <Card data-testid="purchase-supplier-batch-summary" className="space-y-3 border-blue-200 bg-blue-50/60 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="mb-1 block text-xs font-semibold">Purchase batch reference *</Label>
                <Input aria-label="Purchase batch reference" value={form.invoice_number}
                  onChange={e => setForm(current => ({...current,invoice_number:e.target.value}))}
                  className="bg-white"/></div>
              <div><Label className="mb-1 block text-xs font-semibold">Currency</Label>
                <Select value={form.currency} onValueChange={value => setForm(current => ({...current,currency:value}))}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="mb-1 block text-xs font-semibold">Purchase date</Label>
                <Input type="date" value={form.date}
                  onChange={e => setForm(current => ({...current,date:e.target.value}))} className="bg-white"/></div>
              <div className="flex flex-col justify-end rounded-lg border border-blue-100 bg-white p-2 text-xs font-bold">
                <span className="text-slate-600">Suppliers / purchase total</span>
                <span className="text-base text-blue-800">{batchGroups.length} · {form.currency} {batchTotal.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-xs font-semibold text-amber-800">
              Combined payments and extra expenses cannot be allocated automatically.
              Add them separately to each supplier invoice.
            </p>
            {batchGroups.map(group => <div key={group.supplierId}
              className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs font-semibold"
              data-testid="purchase-batch-supplier-total">
              <span className="min-w-0 truncate">{group.supplierName} · {group.items.length} item(s)</span>
              <span className="shrink-0 font-black tabular-nums">{form.currency} {group.totals.grandTotal.toFixed(2)}</span>
            </div>)}
            {batchRef.current.completed.size > 0 && <p className="text-xs font-bold text-emerald-800">
              {batchRef.current.completed.size} supplier invoice(s) saved. Retry only remaining suppliers.
            </p>}
          </Card>}

          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <button type="button" onClick={() => setShowLineItems(value => !value)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5" aria-expanded={showLineItems}>
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blue-600 text-white"><Package className="h-5 w-5" /></span>
              <span className="flex-1 text-lg font-black text-slate-950">Line Items</span>
              {showLineItems ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
            </button>
            {showLineItems && <>
              <div className="hidden grid-cols-[minmax(0,1.4fr)_90px_122px_90px_100px_34px] border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] font-medium text-slate-500 sm:grid">
                <span>Item</span><span>Unit</span><span>Qty</span><span>Unit Cost</span><span className="text-right">Total</span><span />
              </div>
              <div>{items.map((item, idx) => <PurchaseInvoiceItemRow key={item._id} item={item} idx={idx} itemsCount={items.length} updateItem={updateItem} removeItem={removeItem} supplierId={form.supplier_id} suppliers={suppliers} multiSupplierMode={multiSupplierMode} organizationBrands={organizationBrands} brandsError={brandsError} categories={categories} categoriesTree={categoriesTree} />)}</div>
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 sm:px-5">
                <Button type="button" variant="ghost" onClick={addItem} className="h-9 gap-2 px-0 font-bold text-blue-700 hover:bg-transparent"><Plus className="h-5 w-5 rounded-full border border-blue-600 p-0.5" /> Add Item</Button>
                <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{items.length} item{items.length === 1 ? '' : 's'}</span>
              </div>
            </>}
          </Card>

          {!multiSupplierMode && <InvoiceAccordion title="Supplier" subtitle={selectedSupplier?.name || form.supplier_name} icon={UserRound} verified={Boolean(form.supplier_id || form.supplier_name.trim())} open={openSection === 'supplier'} onToggle={() => setOpenSection(current => current === 'supplier' ? null : 'supplier')}>
            <div className="space-y-3">
              <div><Label className="text-xs text-slate-600">Supplier *</Label><Select disabled={Boolean(supplier)} value={form.supplier_id} onValueChange={value => { const supplier = suppliers.find(item => item.id === value); setForm(current => ({ ...current, supplier_id: value, supplier_name: supplier?.name || '', supplier_email: supplier?.email || '' })); setPaymentTerms(supplier?.payment_terms || ''); setVatNumber(supplier?.vat_number || supplier?.tax_number || ''); }}><SelectTrigger className="mt-1 h-11 rounded-xl bg-white"><SelectValue placeholder="Select supplier..." /></SelectTrigger><SelectContent>{suppliers.map(supplier => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select>{!form.supplier_id && <Input value={form.supplier_name} onChange={event => setForm(current => ({ ...current, supplier_name: event.target.value }))} placeholder="Or type supplier name" className="mt-2 h-11 rounded-xl bg-white" />}</div>
              <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs text-slate-600">Invoice number</Label><Input value={form.invoice_number} onChange={event => setForm(current => ({ ...current, invoice_number: event.target.value }))} className="mt-1 h-10 bg-white" /></div><div><Label className="text-xs text-slate-600">Currency</Label><Select value={form.currency} onValueChange={value => setForm(current => ({ ...current, currency: value }))}><SelectTrigger className="mt-1 h-10 bg-white"><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(currency => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div></div>
              <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs text-slate-600">Invoice date</Label><Input type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} className="mt-1 h-10 bg-white" /></div><div><Label className="text-xs text-slate-600">VAT number</Label><Input value={resolvedVatNumber} onChange={event => setVatNumber(event.target.value)} inputMode="numeric" className="mt-1 h-10 bg-white" placeholder="VAT number" /></div></div>
            </div>
          </InvoiceAccordion>}

          <InvoiceAccordion title="Branch" subtitle={selectedBranchName} icon={Store} verified={Boolean(form.branch)} open={openSection === 'branch'} onToggle={() => setOpenSection(current => current === 'branch' ? null : 'branch')}>
            <div><Label className="mb-1.5 block text-xs text-slate-600">Receiving branch *</Label><BranchSelect value={form.branch}
              onChange={value=>{
                setForm(current=>({...current,branch:value}));
                setExpenseLink({expense_id:null,expense_category_id:null});
              }} /></div>
          </InvoiceAccordion>

          {!multiSupplierMode ? <InvoiceAccordion title="Payment" subtitle={paymentMethodLabel} icon={WalletCards} open={openSection === 'payment'} onToggle={() => setOpenSection(current => current === 'payment' ? null : 'payment')} trailing={form.due_date ? <span className="hidden flex-none items-center gap-1 text-xs font-bold text-orange-600 sm:inline-flex"><span className="h-2 w-2 rounded-full bg-orange-500" />Due {form.due_date}</span> : null}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs text-slate-600">Payment terms</Label><Input value={paymentTerms} onChange={event => setPaymentTerms(event.target.value)} placeholder="e.g. Credit / Net 30" className="mt-1 h-10 bg-white" /></div><div><Label className="text-xs text-slate-600">Due date</Label><Input type="date" value={form.due_date} onChange={event => setForm(current => ({ ...current, due_date: event.target.value }))} className="mt-1 h-10 bg-white" /></div></div>
              <label className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-950"><input id="pay-full-amount" type="checkbox" checked={payFullAmount} onChange={event => handlePayFullAmount(event.target.checked)} className="h-4 w-4 accent-blue-600" /> Pay full invoice amount</label>
              {payments.map((payment, index) => <div key={payment._id} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2.5"><Input type="number" min="0" step="0.01" value={payment.amount} onChange={event => updatePayment(payment._id, 'amount', event.target.value)} disabled={payFullAmount} className="h-9" placeholder="Amount" /><Select value={payment.payment_method} onValueChange={value => updatePayment(payment._id, 'payment_method', value)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map(method => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent></Select><Input type="date" value={payment.date} onChange={event => updatePayment(payment._id, 'date', event.target.value)} className="h-9" /><div className="flex gap-1"><Input value={payment.notes} onChange={event => updatePayment(payment._id, 'notes', event.target.value)} className="h-9" placeholder={`Payment ${index + 1} note`} />{payments.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removePayment(payment._id)} className="h-9 w-9 text-red-600"><Trash2 className="h-4 w-4" /></Button>}</div></div>)}
              {!payFullAmount && <Button type="button" variant="outline" size="sm" onClick={addPayment} className="w-full gap-1"><Plus className="h-3.5 w-3.5" /> Add payment</Button>}
              <div className="border-t border-slate-200 pt-3"><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-blue-600" /><span className="text-xs font-bold text-slate-800">Additional costs</span></div><span className="text-xs font-bold text-slate-500">{form.currency} {totals.additionalTotal.toFixed(2)}</span></div>{additionalCosts.map(cost => <div key={cost._id} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2 rounded-xl bg-white p-2"><Select value={cost.type} onValueChange={value => updateAdditionalCost(cost._id, 'type', value)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{ADDITIONAL_COST_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select><Input type="number" min="0" step="0.01" value={cost.amount} onChange={event => updateAdditionalCost(cost._id, 'amount', Number(event.target.value || 0))} className="h-9" placeholder="Amount" /><Button type="button" variant="ghost" size="icon" onClick={() => removeAdditionalCost(cost._id)} className="h-9 w-9 text-red-600"><Trash2 className="h-4 w-4" /></Button><Input value={cost.description} onChange={event => updateAdditionalCost(cost._id, 'description', event.target.value)} className="col-span-3 h-9" placeholder="Description" /></div>)}<Button type="button" variant="ghost" size="sm" onClick={addAdditionalCost} className="h-8 gap-1 px-0 text-xs font-bold text-blue-700"><Plus className="h-3.5 w-3.5" /> Add cost</Button></div>
              <div className="flex justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold"><span>Remaining balance</span><span>{form.currency} {Math.max(0, remaining).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            </div>
          </InvoiceAccordion> : <Card className="border-blue-200 bg-white p-3 text-xs font-semibold text-blue-900">
            Supplier-specific payment amounts, additional costs and due dates belong on each supplier invoice.
          </Card>}

          {!multiSupplierMode && <InvoiceAccordion title="Options · Expense reference" subtitle={expenseLink.expense_id?'Existing expense linked':expenseLink.expense_category_id?'Expense type selected':'Optional · No extra posting'} icon={ClipboardCheck}
            open={openSection==='expenseOptions'}
            onToggle={()=>setOpenSection(current=>current==='expenseOptions'?null:'expenseOptions')}>
            <PurchaseExpenseOptions restaurantId={restaurantId}
              branchId={selectedBranch?.id||null}
              branchKey={form.branch}
              value={expenseLink} onChange={setExpenseLink} disabled={saving||Boolean(submissionRef.current.invoice)}/>
          </InvoiceAccordion>}

          <InvoiceAccordion title="Attachments" subtitle={attachments.length ? `${attachments.length} invoice ${attachments.length === 1 ? 'file' : 'files'}` : 'No invoice file'} icon={Paperclip} open={openSection === 'attachments'} onToggle={() => setOpenSection(current => current === 'attachments' ? null : 'attachments')} trailing={attachments.length ? <span className="hidden h-9 w-9 flex-none items-center justify-center rounded-lg bg-blue-50 text-blue-700 sm:flex"><FileText className="h-4 w-4" /></span> : null}>
            <div className="space-y-2">{attachments.map((url, index) => <div key={`${url}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><FileText className="h-3.5 w-3.5 text-blue-600" /><a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-blue-700">{url.split('/').pop()}</a><Button type="button" variant="ghost" size="icon" onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))} className="h-7 w-7 text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></div>)}<label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 text-xs font-bold text-blue-700"><Paperclip className="h-4 w-4" />Upload invoice<input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileUpload} /></label><Textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} rows={2} placeholder="Internal procurement notes" className="resize-none rounded-xl bg-white" /></div>
          </InvoiceAccordion>
        </div>
      </div>

      <footer className="grid flex-none grid-cols-2 gap-3 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:px-5">
        <Button type="button" variant="outline" disabled={saving || !!submissionRef.current.invoice} onClick={e => handleSubmit(e, 'draft')} className="h-12 gap-2 rounded-xl border-blue-300 font-bold text-blue-700">
          <Save className="h-4 w-4" />{saving && submitMode === 'draft' ? 'Saving...' : multiSupplierMode ? 'Save supplier drafts' : 'Save Draft'}
        </Button>
        <Button type="submit" disabled={saving} className="h-12 gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 font-bold shadow-lg shadow-blue-200 hover:from-blue-800 hover:to-blue-700">
          <ClipboardCheck className="h-4 w-4" />{saving && submitMode === 'post' ? 'Posting...' : multiSupplierMode ? 'Post separate invoices' : submissionRef.current.invoice ? 'Retry remaining payments' : isEdit ? 'Review & Update' : 'Review & Post'}
        </Button>
      </footer>

      {/* OCR Dialog */}
      {showOcr && (
        <OcrScanDialog
          onResult={handleOcrResult}
          onClose={() => setShowOcr(false)}
          branch={form.branch}
          createdBy={user?.email}
        />
      )}
    </form>
  );
}
