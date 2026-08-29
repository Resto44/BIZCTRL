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
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Trash2, Receipt, Package, Truck, AlertCircle, CheckCircle2,
  Paperclip, ScanLine, ChevronDown, ChevronUp, DollarSign,
  ArrowLeft, ShieldCheck, RefreshCw, FileText, Clock3, Building2,
  Hash, CalendarDays, CreditCard, ChevronRight, Save, Send, Calculator
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

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">{idx + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{item.product_name || 'New line item'}</span>
            <span className="block truncate text-[11px] text-slate-500">
              {Number(item.quantity || 0).toLocaleString()} {item.unit || 'unit'} × {Number(item.unit_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </span>
          {item._ocr_confidence ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">{item._ocr_confidence}%</span>
          ) : null}
          <span className="whitespace-nowrap text-sm font-bold text-slate-900">
            {calcLineTotal(item).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 flex-none text-slate-400" /> : <ChevronDown className="h-4 w-4 flex-none text-slate-400" />}
        </button>
        {itemsCount > 1 && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-destructive" onClick={() => removeItem(item._id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {expanded && <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 p-3">

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
      </div>}
    </div>
  );
}

function VerificationCard({ title, value, verified, icon: Icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-xl border p-3 text-left transition-all ${
        active
          ? 'border-blue-400 bg-blue-50/70 shadow-sm ring-2 ring-blue-100'
          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
      }`}
    >
      <span className="mb-2 block text-[11px] font-medium text-slate-500">{title}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{value || 'Needs review'}</span>
        <ChevronRight className="h-4 w-4 flex-none text-slate-400" />
      </span>
      <span className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
        {verified ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
        {verified ? 'Verified' : 'Review'}
      </span>
    </button>
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
  const [showAdditionalCosts, setShowAdditionalCosts] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [attachments, setAttachments] = useState(invoice?.attachment_urls || []);
  const [ocrMeta, setOcrMeta] = useState(null);
  const [vatNumber, setVatNumber] = useState(invoice?.vat_number || '');
  const [paymentTerms, setPaymentTerms] = useState(invoice?.payment_terms || '');
  const [activeDetail, setActiveDetail] = useState('supplier');
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
  const scannedInvoiceTotal = Number(ocrMeta?.invoiceTotal || 0);
  const invoiceDifference = scannedInvoiceTotal > 0 ? totals.grandTotal - scannedInvoiceTotal : 0;
  const invoiceMatchesScan = scannedInvoiceTotal > 0 && Math.abs(invoiceDifference) < 0.01;
  const hasLineItems = items.some(item => Boolean(item.product_name || item.product_id));
  const verificationChecks = [
    Boolean(form.supplier_id || form.supplier_name.trim()),
    Boolean(form.branch),
    Boolean(form.invoice_number.trim()),
    Boolean(form.date),
    Boolean(resolvedPaymentTerms || form.due_date),
    Boolean(resolvedVatNumber),
    hasLineItems,
    invoiceMatchesScan,
  ];
  const verifiedCount = verificationChecks.filter(Boolean).length;
  const reviewCount = verificationChecks.length - verifiedCount;
  const averageLineConfidence = Math.round(
    items.reduce((sum, item) => sum + Number(item._ocr_confidence || 0), 0) /
      Math.max(1, items.filter(item => item._ocr_confidence).length),
  );

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
      <header className="flex h-16 flex-none items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="h-9 w-9 rounded-full" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="truncate text-base font-bold sm:text-lg">Smart Invoice Capture</h2>
          <p className="text-[10px] text-slate-500">AI-assisted procurement posting</p>
        </div>
        <Badge className="border-0 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50">
          OCR {ocrMeta?.confidence ? `${Math.round(ocrMeta.confidence)}%` : 'Ready'}
        </Badge>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
        <div className="mx-auto max-w-3xl space-y-4 pb-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />{error}
            </div>
          )}

          <Card className="overflow-hidden border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                <FileText className="h-7 w-7 text-blue-600" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{ocrMeta?.fileName || 'Invoice document'}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                  <Clock3 className="h-3 w-3" />
                  {ocrMeta?.scannedAt ? `Scanned ${new Date(ocrMeta.scannedAt).toLocaleString()}` : 'Upload PDF, JPG or PNG for extraction'}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setShowOcr(true)} className="h-10 gap-1.5 rounded-xl border-slate-200 px-3 text-xs font-semibold text-blue-700">
                {ocrMeta ? <RefreshCw className="h-4 w-4" /> : <ScanLine className="h-4 w-4" />}
                {ocrMeta ? 'Rescan' : 'Scan'}
              </Button>
            </div>
          </Card>

          <Card className="border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{verifiedCount} fields verified · {reviewCount} need review</p>
                <p className="text-[11px] text-slate-500">Accounting checks update as you complete the invoice.</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${reviewCount === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {reviewCount === 0 ? 'Ready' : 'Review'}
              </span>
            </div>
          </Card>

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <VerificationCard title="Supplier" value={selectedSupplier?.name || form.supplier_name} verified={Boolean(form.supplier_id || form.supplier_name.trim())} icon={Building2} active={activeDetail === 'supplier'} onClick={() => setActiveDetail('supplier')} />
            <VerificationCard title="Branch" value={branches.find(b => b.key === form.branch || b.branch_key === form.branch)?.name || form.branch} verified={Boolean(form.branch)} icon={Building2} active={activeDetail === 'branch'} onClick={() => setActiveDetail('branch')} />
            <VerificationCard title="Invoice No" value={form.invoice_number} verified={Boolean(form.invoice_number.trim())} icon={Hash} active={activeDetail === 'invoice'} onClick={() => setActiveDetail('invoice')} />
            <VerificationCard title="Date" value={form.date} verified={Boolean(form.date)} icon={CalendarDays} active={activeDetail === 'date'} onClick={() => setActiveDetail('date')} />
            <VerificationCard title="Payment Terms" value={resolvedPaymentTerms || (form.due_date ? `Due ${form.due_date}` : '')} verified={Boolean(resolvedPaymentTerms || form.due_date)} icon={CreditCard} active={activeDetail === 'terms'} onClick={() => setActiveDetail('terms')} />
            <VerificationCard title="VAT Number" value={resolvedVatNumber} verified={Boolean(resolvedVatNumber)} icon={Receipt} active={activeDetail === 'vat'} onClick={() => setActiveDetail('vat')} />
          </section>

          <Card className="border-blue-100 bg-white p-4 shadow-sm ring-1 ring-blue-50">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">Review selected field</p>
              <Badge variant="outline" className="border-blue-100 bg-blue-50 text-[10px] text-blue-700">Editable</Badge>
            </div>
            {activeDetail === 'supplier' && <div className="space-y-2">
              <Label className="text-xs text-slate-600">Supplier *</Label>
              <Select value={form.supplier_id} onValueChange={v => {
                const supplier = suppliers.find(s => s.id === v);
                setForm(current => ({ ...current, supplier_id: v, supplier_name: supplier?.name || '', supplier_email: supplier?.email || '' }));
                setPaymentTerms(supplier?.payment_terms || '');
                setVatNumber(supplier?.vat_number || supplier?.tax_number || '');
              }}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                <SelectContent>{suppliers.map(supplier => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent>
              </Select>
              {!form.supplier_id && <Input value={form.supplier_name} onChange={e => setForm(current => ({ ...current, supplier_name: e.target.value }))} placeholder="Or type supplier name" className="h-11 rounded-xl" />}
            </div>}
            {activeDetail === 'branch' && <div>
              <Label className="mb-1.5 block text-xs text-slate-600">Receiving branch *</Label>
              <BranchSelect value={form.branch} onChange={value => setForm(current => ({ ...current, branch: value }))} />
            </div>}
            {activeDetail === 'invoice' && <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0"><Label className="text-xs text-slate-600">Invoice number</Label><Input value={form.invoice_number} onChange={e => setForm(current => ({ ...current, invoice_number: e.target.value }))} className="mt-1 h-11 rounded-xl" /></div>
              <div className="min-w-0"><Label className="text-xs text-slate-600">Currency</Label><Select value={form.currency} onValueChange={value => setForm(current => ({ ...current, currency: value }))}><SelectTrigger className="mt-1 h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(currency => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div>
            </div>}
            {activeDetail === 'date' && <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs text-slate-600">Invoice date *</Label><Input type="date" value={form.date} onChange={e => setForm(current => ({ ...current, date: e.target.value }))} className="mt-1 h-11 rounded-xl" /></div>
              <div><Label className="text-xs text-slate-600">Due date</Label><Input type="date" value={form.due_date} onChange={e => setForm(current => ({ ...current, due_date: e.target.value }))} className="mt-1 h-11 rounded-xl" /></div>
            </div>}
            {activeDetail === 'terms' && <div><Label className="text-xs text-slate-600">Payment terms</Label><Input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30 days" className="mt-1 h-11 rounded-xl" /></div>}
            {activeDetail === 'vat' && <div><Label className="text-xs text-slate-600">Supplier VAT number</Label><Input value={vatNumber} onChange={e => setVatNumber(e.target.value)} placeholder="15-digit VAT number" inputMode="numeric" className="mt-1 h-11 rounded-xl" /></div>}
          </Card>

          <Card className="border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" />
              <div className="min-w-0 flex-1"><p className="text-sm font-bold">Line Items ({items.length})</p><p className="text-[10px] text-slate-500">{averageLineConfidence ? `Average OCR confidence ${averageLineConfidence}%` : 'Tap a line to review details'}</p></div>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-8 gap-1 rounded-lg text-xs"><Plus className="h-3.5 w-3.5" /> Add Item</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => <PurchaseInvoiceItemRow key={item._id} item={item} idx={idx} itemsCount={items.length} updateItem={updateItem} removeItem={removeItem} supplierId={form.supplier_id} categories={categories} categoriesTree={categoriesTree} />)}
            </div>
          </Card>

          <Card className="border-slate-200 bg-white p-3 shadow-sm">
            <button type="button" className="flex w-full items-center gap-2" onClick={() => setShowAdditionalCosts(value => !value)}>
              <Truck className="h-4 w-4 text-blue-600" /><span className="flex-1 text-left text-sm font-bold">Additional Costs</span>
              <span className="text-xs font-semibold text-slate-500">{form.currency} {totals.additionalTotal.toFixed(2)}</span>{showAdditionalCosts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showAdditionalCosts && <div className="mt-3 space-y-2">
              {additionalCosts.map(cost => <div key={cost._id} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-xl bg-slate-50 p-2">
                <Select value={cost.type} onValueChange={value => updateAdditionalCost(cost._id, 'type', value)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{ADDITIONAL_COST_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
                <Input type="number" min="0" step="0.01" value={cost.amount} onChange={e => updateAdditionalCost(cost._id, 'amount', Number(e.target.value || 0))} className="h-9" placeholder="Amount" />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-600" onClick={() => removeAdditionalCost(cost._id)}><Trash2 className="h-4 w-4" /></Button>
                <Input value={cost.description} onChange={e => updateAdditionalCost(cost._id, 'description', e.target.value)} className="col-span-3 h-9" placeholder="Description" />
              </div>)}
              <Button type="button" variant="outline" size="sm" onClick={addAdditionalCost} className="w-full gap-1"><Plus className="h-3.5 w-3.5" /> Add cost</Button>
            </div>}
          </Card>

          <Card className="border-slate-200 bg-white p-3 shadow-sm">
            <button type="button" className="flex w-full items-center gap-2" onClick={() => setShowPayments(value => !value)}>
              <DollarSign className="h-4 w-4 text-blue-600" /><span className="flex-1 text-left text-sm font-bold">Payment</span>
              <span className="text-xs font-semibold text-slate-500">Remaining {form.currency} {Math.max(0, remaining).toFixed(2)}</span>{showPayments ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showPayments && <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold"><input id="pay-full-amount" type="checkbox" checked={payFullAmount} onChange={e => handlePayFullAmount(e.target.checked)} className="h-4 w-4 accent-blue-600" /> Pay full invoice amount</label>
              {payments.map((payment, index) => <div key={payment._id} className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2">
                <Input type="number" min="0" step="0.01" value={payment.amount} onChange={e => updatePayment(payment._id, 'amount', e.target.value)} disabled={payFullAmount} className="h-9" placeholder="Amount" />
                <Select value={payment.payment_method} onValueChange={value => updatePayment(payment._id, 'payment_method', value)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map(method => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent></Select>
                <Input type="date" value={payment.date} onChange={e => updatePayment(payment._id, 'date', e.target.value)} className="h-9" />
                <div className="flex gap-1"><Input value={payment.notes} onChange={e => updatePayment(payment._id, 'notes', e.target.value)} className="h-9" placeholder={`Payment ${index + 1} note`} />{payments.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removePayment(payment._id)} className="h-9 w-9 text-red-600"><Trash2 className="h-4 w-4" /></Button>}</div>
              </div>)}
              {!payFullAmount && <Button type="button" variant="outline" size="sm" onClick={addPayment} className="w-full gap-1"><Plus className="h-3.5 w-3.5" /> Add payment</Button>}
            </div>}
          </Card>

          <Card className="border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><Paperclip className="h-4 w-4 text-blue-600" /><span className="flex-1 text-sm font-bold">Documents & Notes</span><label className="cursor-pointer"><span className="text-xs font-bold text-blue-700">Upload</span><input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileUpload} /></label></div>
            {attachments.map((url, index) => <div key={`${url}-${index}`} className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs"><FileText className="h-3.5 w-3.5 text-blue-600" /><a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-blue-700">{url.split('/').pop()}</a><Button type="button" variant="ghost" size="icon" onClick={() => setAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))} className="h-7 w-7 text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></div>)}
            <Textarea value={form.notes} onChange={e => setForm(current => ({ ...current, notes: e.target.value }))} rows={2} placeholder="Internal procurement notes" className="resize-none rounded-xl" />
          </Card>

          <Card className="border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Calculator className="h-4 w-4" /></span><div><p className="text-sm font-bold">Invoice Reconciliation</p><p className="text-[10px] text-slate-500">Calculated from verified line data</p></div></div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-semibold">{form.currency} {totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="font-semibold">{form.currency} {totals.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              {totals.discountAmount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>-{form.currency} {totals.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
              {totals.additionalTotal > 0 && <div className="flex justify-between"><span className="text-slate-500">Additional costs</span><span className="font-semibold">{form.currency} {totals.additionalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
              <div className="flex justify-between border-y border-slate-100 py-2 text-base font-bold"><span>Invoice Total</span><span>{form.currency} {totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className={`flex justify-between font-bold ${invoiceMatchesScan ? 'text-emerald-700' : 'text-amber-700'}`}><span>Difference</span><span>{scannedInvoiceTotal > 0 ? `${form.currency} ${invoiceDifference.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Awaiting scan'}</span></div>
            </div>
          </Card>
        </div>
      </div>

      <footer className="grid flex-none grid-cols-2 gap-3 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:px-5">
        <Button type="button" variant="outline" disabled={saving} onClick={e => handleSubmit(e, 'draft')} className="h-12 gap-2 rounded-xl border-blue-300 font-bold text-blue-700">
          <Save className="h-4 w-4" />{saving && submitMode === 'draft' ? 'Saving...' : 'Save Draft'}
        </Button>
        <Button type="submit" disabled={saving} className="h-12 gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 font-bold shadow-lg shadow-blue-200 hover:from-blue-800 hover:to-blue-700">
          <Send className="h-4 w-4" />{saving && submitMode === 'post' ? 'Posting...' : isEdit ? 'Approve & Update' : 'Approve & Post'}
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
