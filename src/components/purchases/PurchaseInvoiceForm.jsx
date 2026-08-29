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
import { useTenant } from '@/lib/TenantContext';
import { useAuth } from '@/lib/AuthContext';
import { usePurchaseProductsByCategory } from '@/hooks/usePurchaseProductsByCategory';
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
  createPurchaseInvoice, updatePurchaseInvoice, addInvoicePayment
} from '@/lib/procurementEngine';
import OcrScanDialog from './OcrScanDialog';

const CURRENCIES = ['SAR', 'USD', 'AED', 'EGP', 'KWD', 'QAR', 'BHD', 'OMR', 'EUR', 'GBP'];
const PAYMENT_METHODS = ['cash', 'bank', 'pos', 'transfer'];
const ADDITIONAL_COST_TYPES = ['delivery', 'transport', 'customs', 'packaging', 'miscellaneous'];

const emptyItem = () => ({
  _id: Math.random().toString(36).slice(2),
  category: '',
  category_id: '',
  subcategory_id: '',
  product_id: '',
  product_name: '',
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
  categories,
  categoriesTree
}) {
  const [expanded, setExpanded] = useState(() => !item.product_name && !item.product_id);
  // Fetch products for this item's category/subcategory and supplier
  // Calling hook here is safe because it's the top level of this component
  const { products: categoryProducts = [] } = usePurchaseProductsByCategory(item.category_id, supplierId, item.subcategory_id);

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
          <p className="truncate text-[11px] text-slate-500">Per {item.unit || 'unit'}</p>
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
                    {rootCat.icon || '📦'} {rootCat.name}
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
          }} disabled={!item.category_id}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0" disabled={!item.category_id}>
              <SelectValue placeholder={item.category_id ? "Select..." : "Select category first"} />
            </SelectTrigger>
            <SelectContent>
              {item.category_id && categoriesTree.find(c => c.id === item.category_id)?.children?.map(subCat => (
                <SelectItem key={subCat.id} value={subCat.id}>
                  {subCat.icon || '📦'} {subCat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-1 sm:col-span-2 min-w-0">
          <Label className="text-[10px] text-muted-foreground">Product *</Label>
          <Select value={item.product_id} onValueChange={v => {
            const prod = categoryProducts.find(p => p.id === v);
            updateItem(item._id, 'product_id', v);
            if (prod) {
              updateItem(item._id, 'product_name', prod.name);
              updateItem(item._id, 'unit', prod.unit || item.unit);
              updateItem(item._id, 'unit_cost', prod.default_cost || item.unit_cost);
            }
          }} disabled={!item.category_id && !supplierId}>
            <SelectTrigger className="h-8 text-xs w-full min-w-0" disabled={!item.category_id && !supplierId}>
              <SelectValue placeholder={(item.category_id || supplierId) ? (categoryProducts.length === 0 ? 'No matching products.' : 'Select...') : 'Select category or supplier first'} />
            </SelectTrigger>
            <SelectContent>
              {categoryProducts.length === 0 && (item.category_id || supplierId) ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No matching products found.</div>
              ) : (
                categoryProducts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)
              )}
            </SelectContent>
          </Select>
          {!item.product_id && (
            <Input value={item.product_name} onChange={e => updateItem(item._id, 'product_name', e.target.value)}
              placeholder="Or type product name" className="h-8 text-xs mt-1 w-full min-w-0" />
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

export default function PurchaseInvoiceForm({ invoice = null, onSuccess, onCancel }) {
  const { ownerFilter, branches, activeRestaurantId: restaurantId } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();

  const isEdit = !!invoice;

  // ── Form state ─────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    invoice_number: invoice?.invoice_number || '',
    supplier_id: invoice?.supplier_id || '',
    supplier_name: invoice?.supplier_name || '',
    supplier_email: invoice?.supplier_email || '',
    branch: invoice?.branch || '',
    date: invoice?.date || format(new Date(), 'yyyy-MM-dd'),
    due_date: invoice?.due_date || '',
    currency: invoice?.currency || 'SAR',
    notes: invoice?.notes || '',
    status: invoice?.status || 'draft',
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

  // Use hierarchical categories hook
  const { categories, tree: categoriesTree } = usePurchaseCategoriesHierarchy();

  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id);
  const resolvedVatNumber = vatNumber || selectedSupplier?.vat_number || selectedSupplier?.tax_number || '';
  const resolvedPaymentTerms = paymentTerms || selectedSupplier?.payment_terms || '';

  // ── Totals ─────────────────────────────────────────────────────────────
  const totals = calcInvoiceTotals(items, additionalCosts);
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
      const updated = { ...item, [field]: value };
      
      // When category changes: clear product selection and subcategory
      if (field === 'category_id') {
        updated.product_id = '';
        updated.product_name = '';
        updated.subcategory_id = '';
      }
      // When subcategory changes: clear product selection
      if (field === 'subcategory_id') {
        updated.product_id = '';
        updated.product_name = '';
      }
      
      return normalizePurchaseLine(updated);
    }));
  }, []);

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
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

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e, mode = 'post') => {
    e.preventDefault();
    if (savingRef.current) return;
    setError('');

    const isDraft = mode === 'draft';

    if (!form.branch) { setError('Branch is required'); return; }
    
    // Minimal validation: must have either a selected supplier or a typed name
    const supplierId = form.supplier_id && form.supplier_id.trim() !== '' ? form.supplier_id : null;
    const supplierName = form.supplier_name && form.supplier_name.trim() !== '' ? form.supplier_name : null;
    
    if (!isDraft && !supplierId && !supplierName) {
      setError('Supplier selection or name is required'); 
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
      };

      let savedInvoice;
      if (isEdit) {
        savedInvoice = await updatePurchaseInvoice({
          invoiceId: invoice.id,
          invoiceData: invoicePayload,
          items: cleanItems,
          additionalCosts: cleanCosts,
          createdBy: user?.email,
          mode,
        });
      } else {
        savedInvoice = await createPurchaseInvoice({
          invoiceData: invoicePayload,
          items: cleanItems,
          additionalCosts: cleanCosts,
          createdBy: user?.email,
          mode,
        });
      }

      // Process payments if any have amounts
      const validPayments = isDraft ? [] : payments.filter(p => parseFloat(p.amount) > 0);
      for (const pmt of validPayments) {
        await addInvoicePayment({
          invoiceId: savedInvoice.id,
          amount: parseFloat(pmt.amount),
          paymentMethod: pmt.payment_method,
          notes: pmt.notes,
          date: pmt.date,
          createdBy: user?.email,
        });
      }

      qc.invalidateQueries({ queryKey: ['supplier_invoices'] });
      qc.invalidateQueries({ queryKey: ['supplier_invoices_dash'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['debt_records'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      // Refresh treasury, supplier ledger, and dashboard after payment
      qc.invalidateQueries({ queryKey: ['wallet_transactions'] });
      qc.invalidateQueries({ queryKey: ['wallet_transactions_dash'] });
      qc.invalidateQueries({ queryKey: ['supplier_payments'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['dashboard_metrics'] });

      onSuccess?.(savedInvoice);
    } catch (err) {
      setError(err.message || 'Failed to save invoice');
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
              <span className="h-2 w-2 rounded-full bg-orange-500" />{isEdit ? form.status : 'Draft'}
            </span>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => setShowOcr(true)} className="h-10 flex-none gap-2 rounded-lg border-blue-500 px-3 font-bold text-blue-700 hover:bg-blue-50">
          <ScanLine className="h-4 w-4" /> Scan
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
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
              <div>{items.map((item, idx) => <PurchaseInvoiceItemRow key={item._id} item={item} idx={idx} itemsCount={items.length} updateItem={updateItem} removeItem={removeItem} supplierId={form.supplier_id} categories={categories} categoriesTree={categoriesTree} />)}</div>
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 sm:px-5">
                <Button type="button" variant="ghost" onClick={addItem} className="h-9 gap-2 px-0 font-bold text-blue-700 hover:bg-transparent"><Plus className="h-5 w-5 rounded-full border border-blue-600 p-0.5" /> Add Item</Button>
                <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{items.length} item{items.length === 1 ? '' : 's'}</span>
              </div>
            </>}
          </Card>

          <InvoiceAccordion title="Supplier" subtitle={selectedSupplier?.name || form.supplier_name} icon={UserRound} verified={Boolean(form.supplier_id || form.supplier_name.trim())} open={openSection === 'supplier'} onToggle={() => setOpenSection(current => current === 'supplier' ? null : 'supplier')}>
            <div className="space-y-3">
              <div><Label className="text-xs text-slate-600">Supplier *</Label><Select value={form.supplier_id} onValueChange={value => { const supplier = suppliers.find(item => item.id === value); setForm(current => ({ ...current, supplier_id: value, supplier_name: supplier?.name || '', supplier_email: supplier?.email || '' })); setPaymentTerms(supplier?.payment_terms || ''); setVatNumber(supplier?.vat_number || supplier?.tax_number || ''); }}><SelectTrigger className="mt-1 h-11 rounded-xl bg-white"><SelectValue placeholder="Select supplier..." /></SelectTrigger><SelectContent>{suppliers.map(supplier => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select>{!form.supplier_id && <Input value={form.supplier_name} onChange={event => setForm(current => ({ ...current, supplier_name: event.target.value }))} placeholder="Or type supplier name" className="mt-2 h-11 rounded-xl bg-white" />}</div>
              <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs text-slate-600">Invoice number</Label><Input value={form.invoice_number} onChange={event => setForm(current => ({ ...current, invoice_number: event.target.value }))} className="mt-1 h-10 bg-white" /></div><div><Label className="text-xs text-slate-600">Currency</Label><Select value={form.currency} onValueChange={value => setForm(current => ({ ...current, currency: value }))}><SelectTrigger className="mt-1 h-10 bg-white"><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(currency => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div></div>
              <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs text-slate-600">Invoice date</Label><Input type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} className="mt-1 h-10 bg-white" /></div><div><Label className="text-xs text-slate-600">VAT number</Label><Input value={resolvedVatNumber} onChange={event => setVatNumber(event.target.value)} inputMode="numeric" className="mt-1 h-10 bg-white" placeholder="VAT number" /></div></div>
            </div>
          </InvoiceAccordion>

          <InvoiceAccordion title="Branch" subtitle={selectedBranchName} icon={Store} verified={Boolean(form.branch)} open={openSection === 'branch'} onToggle={() => setOpenSection(current => current === 'branch' ? null : 'branch')}>
            <div><Label className="mb-1.5 block text-xs text-slate-600">Receiving branch *</Label><BranchSelect value={form.branch} onChange={value => setForm(current => ({ ...current, branch: value }))} /></div>
          </InvoiceAccordion>

          <InvoiceAccordion title="Payment" subtitle={paymentMethodLabel} icon={WalletCards} open={openSection === 'payment'} onToggle={() => setOpenSection(current => current === 'payment' ? null : 'payment')} trailing={form.due_date ? <span className="hidden flex-none items-center gap-1 text-xs font-bold text-orange-600 sm:inline-flex"><span className="h-2 w-2 rounded-full bg-orange-500" />Due {form.due_date}</span> : null}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2"><div><Label className="text-xs text-slate-600">Payment terms</Label><Input value={paymentTerms} onChange={event => setPaymentTerms(event.target.value)} placeholder="e.g. Credit / Net 30" className="mt-1 h-10 bg-white" /></div><div><Label className="text-xs text-slate-600">Due date</Label><Input type="date" value={form.due_date} onChange={event => setForm(current => ({ ...current, due_date: event.target.value }))} className="mt-1 h-10 bg-white" /></div></div>
              <label className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-950"><input id="pay-full-amount" type="checkbox" checked={payFullAmount} onChange={event => handlePayFullAmount(event.target.checked)} className="h-4 w-4 accent-blue-600" /> Pay full invoice amount</label>
              {payments.map((payment, index) => <div key={payment._id} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2.5"><Input type="number" min="0" step="0.01" value={payment.amount} onChange={event => updatePayment(payment._id, 'amount', event.target.value)} disabled={payFullAmount} className="h-9" placeholder="Amount" /><Select value={payment.payment_method} onValueChange={value => updatePayment(payment._id, 'payment_method', value)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map(method => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent></Select><Input type="date" value={payment.date} onChange={event => updatePayment(payment._id, 'date', event.target.value)} className="h-9" /><div className="flex gap-1"><Input value={payment.notes} onChange={event => updatePayment(payment._id, 'notes', event.target.value)} className="h-9" placeholder={`Payment ${index + 1} note`} />{payments.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removePayment(payment._id)} className="h-9 w-9 text-red-600"><Trash2 className="h-4 w-4" /></Button>}</div></div>)}
              {!payFullAmount && <Button type="button" variant="outline" size="sm" onClick={addPayment} className="w-full gap-1"><Plus className="h-3.5 w-3.5" /> Add payment</Button>}
              <div className="border-t border-slate-200 pt-3"><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-blue-600" /><span className="text-xs font-bold text-slate-800">Additional costs</span></div><span className="text-xs font-bold text-slate-500">{form.currency} {totals.additionalTotal.toFixed(2)}</span></div>{additionalCosts.map(cost => <div key={cost._id} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2 rounded-xl bg-white p-2"><Select value={cost.type} onValueChange={value => updateAdditionalCost(cost._id, 'type', value)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{ADDITIONAL_COST_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select><Input type="number" min="0" step="0.01" value={cost.amount} onChange={event => updateAdditionalCost(cost._id, 'amount', Number(event.target.value || 0))} className="h-9" placeholder="Amount" /><Button type="button" variant="ghost" size="icon" onClick={() => removeAdditionalCost(cost._id)} className="h-9 w-9 text-red-600"><Trash2 className="h-4 w-4" /></Button><Input value={cost.description} onChange={event => updateAdditionalCost(cost._id, 'description', event.target.value)} className="col-span-3 h-9" placeholder="Description" /></div>)}<Button type="button" variant="ghost" size="sm" onClick={addAdditionalCost} className="h-8 gap-1 px-0 text-xs font-bold text-blue-700"><Plus className="h-3.5 w-3.5" /> Add cost</Button></div>
              <div className="flex justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold"><span>Remaining balance</span><span>{form.currency} {Math.max(0, remaining).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            </div>
          </InvoiceAccordion>

          <InvoiceAccordion title="Attachments" subtitle={attachments.length ? `${attachments.length} invoice ${attachments.length === 1 ? 'file' : 'files'}` : 'No invoice file'} icon={Paperclip} open={openSection === 'attachments'} onToggle={() => setOpenSection(current => current === 'attachments' ? null : 'attachments')} trailing={attachments.length ? <span className="hidden h-9 w-9 flex-none items-center justify-center rounded-lg bg-blue-50 text-blue-700 sm:flex"><FileText className="h-4 w-4" /></span> : null}>
            <div className="space-y-2">{attachments.map((url, index) => <div key={`${url}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><FileText className="h-3.5 w-3.5 text-blue-600" /><a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-blue-700">{url.split('/').pop()}</a><Button type="button" variant="ghost" size="icon" onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))} className="h-7 w-7 text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></div>)}<label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 text-xs font-bold text-blue-700"><Paperclip className="h-4 w-4" />Upload invoice<input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileUpload} /></label><Textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} rows={2} placeholder="Internal procurement notes" className="resize-none rounded-xl bg-white" /></div>
          </InvoiceAccordion>
        </div>
      </div>

      <footer className="grid flex-none grid-cols-2 gap-3 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:px-5">
        <Button type="button" variant="outline" disabled={saving} onClick={e => handleSubmit(e, 'draft')} className="h-12 gap-2 rounded-xl border-blue-300 font-bold text-blue-700">
          <Save className="h-4 w-4" />{saving && submitMode === 'draft' ? 'Saving...' : 'Save Draft'}
        </Button>
        <Button type="submit" disabled={saving} className="h-12 gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 font-bold shadow-lg shadow-blue-200 hover:from-blue-800 hover:to-blue-700">
          <ClipboardCheck className="h-4 w-4" />{saving && submitMode === 'post' ? 'Posting...' : isEdit ? 'Review & Update' : 'Review & Post'}
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
