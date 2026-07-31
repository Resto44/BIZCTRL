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

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
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
  Clock, Upload, Paperclip, ScanLine, ChevronDown, ChevronUp, DollarSign
} from 'lucide-react';
import { format } from 'date-fns';
import {
  calcLineTotal, calcInvoiceTotals, computeApprovalStatus,
  createPurchaseInvoice, updatePurchaseInvoice, addInvoicePayment
} from '@/lib/procurementEngine';
import OcrScanDialog from './OcrScanDialog';

const CURRENCIES = ['SAR', 'USD', 'AED', 'EGP', 'KWD', 'QAR', 'BHD', 'OMR', 'EUR', 'GBP'];
const PAYMENT_METHODS = ['cash', 'bank', 'pos', 'transfer'];
const ADDITIONAL_COST_TYPES = ['delivery', 'transport', 'customs', 'packaging', 'miscellaneous'];

const STATUS_CONFIG = {
  draft:     { label: 'Draft',    cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  pending:   { label: 'Pending',  cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  approved:  { label: 'Approved', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  paid:      { label: 'Paid',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  partial:   { label: 'Partial',  cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  unpaid:    { label: 'Unpaid',   cls: 'bg-red-100 text-red-700 border-red-200' },
  cancelled: { label: 'Cancelled',cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const APPROVAL_CONFIG = {
  auto_approved: { label: 'Auto Approved', cls: 'bg-emerald-100 text-emerald-700' },
  pending:       { label: 'Pending Approval', cls: 'bg-yellow-100 text-yellow-700' },
  approved:      { label: 'Approved', cls: 'bg-blue-100 text-blue-700' },
  rejected:      { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
};

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
  // Fetch products for this item's category/subcategory and supplier
  // Calling hook here is safe because it's the top level of this component
  const { products: categoryProducts = [] } = usePurchaseProductsByCategory(item.category_id, supplierId, item.subcategory_id);

  return (
    <div className="rounded-lg border border-border p-3 space-y-2 bg-secondary/20 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
        {itemsCount > 1 && (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive flex-shrink-0" onClick={() => removeItem(item._id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

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
          {!item.product_id && (item.category_id || item.subcategory_id) && (
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
            onChange={e => updateItem(item._id, 'quantity', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-full min-w-0" />
        </div>
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Unit Cost</Label>
          <Input type="number" min="0" step="0.01" value={item.unit_cost}
            onChange={e => updateItem(item._id, 'unit_cost', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-full min-w-0" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Discount</Label>
          <Input type="number" min="0" step="0.01" value={item.discount}
            onChange={e => updateItem(item._id, 'discount', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-full min-w-0" />
        </div>
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Tax %</Label>
          <Input type="number" min="0" max="100" step="0.1" value={item.tax}
            onChange={e => updateItem(item._id, 'tax', parseFloat(e.target.value) || 0)} className="h-8 text-xs w-full min-w-0" />
        </div>
        <div className="min-w-0">
          <Label className="text-[10px] text-muted-foreground">Line Total</Label>
          <div className="h-8 flex items-center px-2 rounded-md bg-primary/5 border border-border text-xs font-semibold text-primary truncate">
            {(item.line_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseInvoiceForm({ invoice = null, onSuccess, onCancel }) {
  const { currency: currencySymbol, lang } = useLanguage();
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
    invoice?.items?.length ? invoice.items.map(i => ({ ...i, _id: Math.random().toString(36).slice(2) })) : [emptyItem()]
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
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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

  // ── Totals ─────────────────────────────────────────────────────────────
  const totals = calcInvoiceTotals(items, additionalCosts);
  const paymentTotal = payFullAmount
    ? totals.grandTotal
    : payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const remaining = payFullAmount ? 0 : totals.grandTotal - paymentTotal;
  const approvalStatus = computeApprovalStatus(totals.grandTotal);

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
      
      updated.line_total = calcLineTotal(updated);
      return updated;
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
    setForm(f => ({
      ...f,
      invoice_number: extracted.invoice_number || f.invoice_number,
      date: extracted.date || f.date,
      supplier_name: extracted.supplier_name || f.supplier_name,
    }));
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
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.branch) { setError('Branch is required'); return; }
    
    // Minimal validation: must have either a selected supplier or a typed name
    const supplierId = form.supplier_id && form.supplier_id.trim() !== '' ? form.supplier_id : null;
    const supplierName = form.supplier_name && form.supplier_name.trim() !== '' ? form.supplier_name : null;
    
    if (!supplierId && !supplierName) { 
      setError('Supplier selection or name is required'); 
      return; 
    }

    if (items.length === 0 || items.every(i => !i.product_name && !i.product_id)) {
      setError('At least one line item is required'); return;
    }

    setSaving(true);
    try {
      const cleanItems = items.map(({ _id, ...i }) => ({
        ...i,
        line_total: calcLineTotal(i),
      }));
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
        });
      } else {
        savedInvoice = await createPurchaseInvoice({
          invoiceData: invoicePayload,
          items: cleanItems,
          additionalCosts: cleanCosts,
          createdBy: user?.email,
        });
      }

      // Process payments if any have amounts
      const validPayments = payments.filter(p => parseFloat(p.amount) > 0);
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
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5 overflow-x-hidden">
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
        </div>
      )}

      {/* OCR Scan Button */}
      <div className="flex justify-end px-4">
        <Button type="button" variant="outline" size="sm" onClick={() => setShowOcr(true)} className="gap-1.5 text-xs">
          <ScanLine className="w-3.5 h-3.5" /> Scan Invoice (OCR)
        </Button>
      </div>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <Card className="p-4 space-y-3 overflow-hidden">
        <div className="flex items-center gap-2 mb-1">
          <Receipt className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold">Invoice Header</span>
          {isEdit && (
            <Badge className={`ms-auto text-[10px] border ${STATUS_CONFIG[form.status]?.cls}`}>
              {STATUS_CONFIG[form.status]?.label}
            </Badge>
          )}
          {!isEdit && (
            <Badge className={`ms-auto text-[10px] border ${APPROVAL_CONFIG[approvalStatus]?.cls}`}>
              {APPROVAL_CONFIG[approvalStatus]?.label}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <Label className="text-xs text-muted-foreground">Invoice Number</Label>
            <Input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="INV-001" className="h-9 w-full min-w-0 truncate" />
          </div>
          <div className="min-w-0">
            <Label className="text-xs text-muted-foreground">Currency</Label>
            <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
              <SelectTrigger className="h-9 w-full min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">Supplier *</Label>
          <Select value={form.supplier_id} onValueChange={v => {
            const s = suppliers.find(s => s.id === v);
            setForm(f => ({ ...f, supplier_id: v, supplier_name: s?.name || '', supplier_email: s?.email || '' }));
          }}>
            <SelectTrigger className="h-9 w-full min-w-0">
              <SelectValue placeholder="Select supplier..." />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {!form.supplier_id && (
            <Input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
              placeholder="Or type supplier name..." className="h-9 mt-1.5 text-sm w-full min-w-0" />
          )}
        </div>

        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">Branch *</Label>
          <BranchSelect value={form.branch} onChange={v => setForm(f => ({ ...f, branch: v }))} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <Label className="text-xs text-muted-foreground">Purchase Date *</Label>
            <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 w-full min-w-0" />
          </div>
          <div className="min-w-0">
            <Label className="text-xs text-muted-foreground">Due Date</Label>
            <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="h-9 w-full min-w-0" />
          </div>
        </div>

        <div className="min-w-0">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="text-sm resize-none w-full min-w-0" placeholder="Additional notes..." />
        </div>
      </Card>

      {/* ── LINE ITEMS ──────────────────────────────────────────────────── */}
      <Card className="p-4 overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold">Line Items</span>
          <Button type="button" size="sm" variant="outline" onClick={addItem} className="ms-auto gap-1 text-xs h-7">
            <Plus className="w-3 h-3" /> Add Item
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item, idx) => (
            <PurchaseInvoiceItemRow 
              key={item._id}
              item={item}
              idx={idx}
              itemsCount={items.length}
              updateItem={updateItem}
              removeItem={removeItem}
              supplierId={form.supplier_id}
              categories={categories}
              categoriesTree={categoriesTree}
            />
          ))}
        </div>
      </Card>

      {/* ── ADDITIONAL COSTS ────────────────────────────────────────────── */}
      <Card className="p-4 overflow-hidden">
        <button type="button" className="flex items-center gap-2 w-full" onClick={() => setShowAdditionalCosts(v => !v)}>
          <Truck className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold">Additional Costs</span>
          {totals.additionalTotal > 0 && (
            <span className="text-xs text-muted-foreground ms-1">({currencySymbol}{totals.additionalTotal.toLocaleString()})</span>
          )}
          <span className="ms-auto">{showAdditionalCosts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
        </button>

        {showAdditionalCosts && (
          <div className="mt-3 space-y-2">
            {additionalCosts.map(cost => (
              <div key={cost._id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end rounded-lg border border-border p-2.5 bg-secondary/20">
                <div className="min-w-0">
                  <Label className="text-[10px] text-muted-foreground">Type</Label>
                  <Select value={cost.type} onValueChange={v => updateAdditionalCost(cost._id, 'type', v)}>
                    <SelectTrigger className="h-8 text-xs w-full min-w-0"><SelectValue /></SelectTrigger>
                    <SelectContent>{ADDITIONAL_COST_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Description</Label>
                  <Input value={cost.description} onChange={e => updateAdditionalCost(cost._id, 'description', e.target.value)}
                    placeholder="Description" className="h-8 text-xs w-full min-w-0" />
                </div>
                <div className="min-w-0">
                  <Label className="text-[10px] text-muted-foreground">Amount</Label>
                  <Input type="number" min="0" step="0.01" value={cost.amount}
                    onChange={e => updateAdditionalCost(cost._id, 'amount', parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs w-full min-w-0" placeholder="0.00" />
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive flex-shrink-0" onClick={() => removeAdditionalCost(cost._id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addAdditionalCost} className="gap-1 text-xs h-7 w-full">
              <Plus className="w-3 h-3" /> Add Cost
            </Button>
          </div>
        )}
      </Card>

      {/* ── TOTALS SUMMARY ──────────────────────────────────────────────── */}
      <Card className="p-4 bg-secondary/30 overflow-hidden">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium truncate">{currencySymbol}{totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between gap-2 text-emerald-600">
              <span>Discount</span>
              <span className="truncate">-{currencySymbol}{totals.discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {totals.taxAmount > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Tax</span>
              <span className="truncate">+{currencySymbol}{totals.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {totals.additionalTotal > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Additional Costs</span>
              <span className="truncate">+{currencySymbol}{totals.additionalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between gap-2 border-t border-border pt-1.5 font-bold text-base">
            <span>Grand Total</span>
            <span className="text-primary truncate">{currencySymbol}{totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </Card>

      {/* ── PAYMENTS ────────────────────────────────────────────────────── */}
      <Card className="p-4 overflow-hidden">
        <button type="button" className="flex items-center gap-2 w-full" onClick={() => setShowPayments(v => !v)}>
          <DollarSign className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold">Payments</span>
          {paymentTotal > 0 && (
            <span className="text-xs text-muted-foreground ms-1">(Paid: {currencySymbol}{paymentTotal.toLocaleString()})</span>
          )}
          {totals.grandTotal > 0 && (
            <span className={`ms-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              remaining <= 0
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : paymentTotal > 0
                  ? 'bg-orange-100 text-orange-700 border-orange-200'
                  : 'bg-gray-100 text-gray-600 border-gray-200'
            }`}>
              {remaining <= 0 ? 'Paid' : paymentTotal > 0 ? 'Partial' : 'Draft'}
            </span>
          )}
          <span className="ms-auto">{showPayments ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
        </button>

        {showPayments && (
          <div className="mt-3 space-y-2">
            {/* ☑ Pay Full Amount */}
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
              <input
                id="pay-full-amount"
                type="checkbox"
                checked={payFullAmount}
                onChange={e => handlePayFullAmount(e.target.checked)}
                className="w-4 h-4 accent-primary cursor-pointer"
              />
              <label htmlFor="pay-full-amount" className="text-xs font-semibold text-foreground cursor-pointer select-none flex-1">
                Pay Full Amount
              </label>
              {payFullAmount && totals.grandTotal > 0 && (
                <span className="text-xs font-bold text-primary">
                  {currencySymbol}{totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {/* Payment rows — hidden when Pay Full Amount is checked */}
            {!payFullAmount && payments.map((pmt, idx) => (
              <div key={pmt._id} className="rounded-lg border border-border p-2.5 space-y-2 bg-secondary/20 overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Payment {idx + 1}</span>
                  {payments.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive flex-shrink-0" onClick={() => removePayment(pmt._id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Amount</Label>
                    <Input type="number" min="0" step="0.01" value={pmt.amount}
                      onChange={e => updatePayment(pmt._id, 'amount', e.target.value)} className="h-8 text-xs w-full min-w-0" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Method</Label>
                    <Select value={pmt.payment_method} onValueChange={v => updatePayment(pmt._id, 'payment_method', v)}>
                      <SelectTrigger className="h-8 text-xs w-full min-w-0"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Date</Label>
                    <Input type="date" value={pmt.date} onChange={e => updatePayment(pmt._id, 'date', e.target.value)} className="h-8 text-xs w-full min-w-0" />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Notes</Label>
                    <Input value={pmt.notes} onChange={e => updatePayment(pmt._id, 'notes', e.target.value)} placeholder="..." className="h-8 text-xs w-full min-w-0" />
                  </div>
                </div>
              </div>
            ))}

            {/* When Pay Full Amount: show method/date/notes only */}
            {payFullAmount && (
              <div className="rounded-lg border border-border p-2.5 space-y-2 bg-secondary/20 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Method</Label>
                    <Select value={payments[0]?.payment_method || 'cash'} onValueChange={v => setPayments(prev => [{ ...(prev[0] || emptyPayment()), payment_method: v }])}>
                      <SelectTrigger className="h-8 text-xs w-full min-w-0"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] text-muted-foreground">Date</Label>
                    <Input type="date" value={payments[0]?.date || format(new Date(), 'yyyy-MM-dd')} onChange={e => setPayments(prev => [{ ...(prev[0] || emptyPayment()), date: e.target.value }])} className="h-8 text-xs w-full min-w-0" />
                  </div>
                </div>
                <div className="min-w-0">
                  <Label className="text-[10px] text-muted-foreground">Notes</Label>
                  <Input value={payments[0]?.notes || ''} onChange={e => setPayments(prev => [{ ...(prev[0] || emptyPayment()), notes: e.target.value }])} placeholder="..." className="h-8 text-xs w-full min-w-0" />
                </div>
              </div>
            )}

            {!payFullAmount && (
              <Button type="button" variant="outline" size="sm" onClick={addPayment} className="gap-1 text-xs h-7 w-full">
                <Plus className="w-3 h-3" /> Add Payment
              </Button>
            )}

            {/* Remaining balance summary */}
            {totals.grandTotal > 0 && (
              <div className={`flex justify-between items-center rounded-lg px-3 py-2.5 gap-2 ${
                remaining <= 0 ? 'bg-emerald-50 dark:bg-emerald-950' :
                paymentTotal > 0 ? 'bg-orange-50 dark:bg-orange-950' :
                'bg-red-50 dark:bg-red-950'
              }`}>
                <div>
                  <p className={`text-xs font-medium ${
                    remaining <= 0 ? 'text-emerald-700' :
                    paymentTotal > 0 ? 'text-orange-700' : 'text-red-700'
                  }`}>Remaining Balance</p>
                  {paymentTotal > 0 && (
                    <p className="text-[10px] text-muted-foreground">Paid: {currencySymbol}{paymentTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {remaining <= 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                  <span className={`text-base font-bold truncate ${
                    remaining <= 0 ? 'text-emerald-700' :
                    paymentTotal > 0 ? 'text-orange-700' : 'text-red-700'
                  }`}>
                    {currencySymbol}{Math.max(0, remaining).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── ATTACHMENTS ─────────────────────────────────────────────────── */}
      <Card className="p-4 overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <Paperclip className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold">Attachments</span>
        </div>
        <div className="space-y-2">
          {attachments.map((url, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/30 rounded px-2 py-1 min-w-0">
              <Paperclip className="w-3 h-3 flex-shrink-0" />
              <a href={url} target="_blank" rel="noreferrer" className="truncate flex-1 text-primary hover:underline">{url.split('/').pop()}</a>
              <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-destructive flex-shrink-0" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          <label className="flex items-center gap-2 cursor-pointer">
            <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7 pointer-events-none">
              <Upload className="w-3.5 h-3.5" /> Upload File
            </Button>
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileUpload} />
          </label>
        </div>
      </Card>

      {/* ── ACTIONS ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 pb-4 px-4">
        <Button type="submit" className="flex-1 h-11 font-bold" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update Invoice' : 'Create Invoice'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-11">Cancel</Button>
        )}
      </div>

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
